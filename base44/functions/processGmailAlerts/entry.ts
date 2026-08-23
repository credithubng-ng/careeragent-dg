import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  identifyEmailSource,
  KNOWN_SOURCE_DEFAULTS,
  extractEmailBody,
  extractSender,
  extractHeader,
  normalizeJobUrl,
  extractSourceJobId,
  extractVacanciesFromEmail,
} from "../../shared/emailParsers.ts";
import { filterRelevance } from "../../shared/relevanceFilter.ts";
import { runJobMatch } from "../../shared/jobMatching.ts";
import { fetchJobPageContent } from "../../shared/jobPageFetcher.ts";
import { extractJobFromText, assessContentQuality, computeContentHash } from "../../shared/jobExtraction.ts";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CONNECTOR_ID = "6a6dbe19898b53557d5ea634";
const INITIAL_DAYS = 30;
const INCREMENTAL_DAYS = 7;
const MAX_EMAIL_CANDIDATES = 200;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "incremental";
    const maxJobs = Number(body.maxJobs) || 20;
    const webhookMessageIds: string[] = body.message_ids || [];

    // Get user (for user-triggered imports)
    let user = null;
    try { user = await base44.auth.me(); } catch {}

    // Lightweight connection check — don't process emails
    if (mode === "check") {
      try {
        await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
        return Response.json({ connected: true });
      } catch {
        return Response.json({ not_connected: true }, { status: 403 });
      }
    }

    const ownerEmail = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (!ownerEmail) {
      return Response.json(
        { error: "Unable to identify the signed-in account. Please log out, sign in again and retry." },
        { status: 401 }
      );
    }

    // Scope every service-role read to the signed-in user. Service role bypasses RLS,
    // so unfiltered list calls could otherwise select another account's records.
    const candidates = await base44.asServiceRole.entities.Candidate.filter({ owner_email: ownerEmail });
    const candidate = candidates[0];
    if (!candidate) {
      return Response.json(
        { error: "No candidate profile found. Please create your candidate profile first." },
        { status: 400 }
      );
    }

    // Get Gmail connection (APP_USER mode — each user connects their own mailbox)
    let accessToken = "";
    try {
      const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
      accessToken = conn.accessToken;
    } catch {
      return Response.json(
        { error: "Gmail not connected. Please connect your Gmail account in Settings → Email Job Alerts.", not_connected: true },
        { status: 403 }
      );
    }

    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Get email sources (active only) — used for sender-domain search and filtering
    const emailSources = await base44.asServiceRole.entities.EmailSource.filter({ owner_email: ownerEmail });
    const configuredSources = emailSources.filter((s: any) => s.active_status);
    // A newly connected account may not yet have EmailSource rows. Previously the
    // Gmail search still ran, but every returned message was then rejected by the
    // known-sender check. Use the shared built-in source catalogue as the effective
    // configuration so connecting Gmail is sufficient to run the first import.
    const activeSources = configuredSources.length > 0
      ? configuredSources
      : KNOWN_SOURCE_DEFAULTS.map((source) => ({ ...source, active_status: true }));

    // Determine which messages to process
    let messages: any[] = [];
    if (webhookMessageIds.length > 0) {
      // Webhook mode: process specific message IDs from the connector trigger
      messages = webhookMessageIds.map((id: string) => ({ id }));
    } else {
      // Manual mode: search recognised senders plus job-like subjects from other senders.
      const days = mode === "initial" ? INITIAL_DAYS : INCREMENTAL_DAYS;
      const afterDate = getDateString(days);
      const query = buildSearchQuery(activeSources, afterDate);
      messages = await listMessages(authHeader, query, MAX_EMAIL_CANDIDATES);
    }

    // Get existing data for duplicate detection
    const existingJobs = await base44.asServiceRole.entities.Job.filter({ owner_email: ownerEmail }, "-created_date", 500);
    const existingEmailImports = await base44.asServiceRole.entities.EmailImport.filter({ owner_email: ownerEmail }, "-created_date", 1000);
    const intakeStates = await base44.asServiceRole.entities.EmailIntakeState.filter({ owner_email: ownerEmail });
    const intakeState = intakeStates[0];
    const allCVs = await base44.asServiceRole.entities.CV.filter({ owner_email: ownerEmail });
    const usableCVs = allCVs.filter((cv: any) => cv.processing_status === "Ready" && cv.extracted_cv_text?.trim());
    const scoringSettings = await base44.asServiceRole.entities.ScoringSetting.filter({ owner_email: ownerEmail });
    const scoring = scoringSettings.find((s: any) => s.active) || scoringSettings[0];

    let jobsImported = 0;
    let duplicatesSkipped = 0;
    let jobsRejected = 0;
    let emailsProcessed = 0;
    let failedEmails = 0;
    let unknownQueued = 0;
    const errors: string[] = [];

    for (const msg of messages) {
      if (mode === "initial" && jobsImported >= maxJobs) break;

      // Skip if already has an EmailImport record (deduplication without labels)
      if (existingEmailImports.some((ei: any) => ei.gmail_message_id === msg.id)) continue;

      try {
        const fullMessage = await getMessage(authHeader, msg.id);
        const headers = fullMessage.payload?.headers || [];
        const sender = extractSender(headers);
        const subject = extractHeader(headers, "subject");
        const receivedDate = extractHeader(headers, "date");

        // Recognised senders can be imported automatically. Other senders must first
        // look like a vacancy email and are always held for human review.
        const senderLower = (sender || "").toLowerCase();
        const knownSource = activeSources.find((s: any) => {
          if (!s.sender_domain) return false;
          return senderLower.includes(s.sender_domain.toLowerCase());
        });
        const bodyText = extractEmailBody(fullMessage.payload);
        if (!knownSource && !looksLikeJobEmail(subject, bodyText)) continue;

        const { sourceName: identifiedSource } = identifyEmailSource(sender, subject, activeSources);
        const sourceName = knownSource ? identifiedSource : "Unrecognised sender";
        const senderTrust = knownSource ? "Recognised" : "Unrecognised";

        // Extract individual vacancies using AI
        const vacancies = await extractVacanciesFromEmail(
          subject,
          bodyText,
          sourceName,
          (params: any) => base44.asServiceRole.integrations.Core.InvokeLLM(params)
        );

        let emailJobsImported = 0;
        let emailDuplicates = 0;
        let emailRejected = 0;

        for (const vacancy of vacancies) {
          if (mode === "initial" && jobsImported >= maxJobs) break;

          // Duplicate detection
          const dup = findDuplicate(vacancy, existingJobs);
          if (dup) {
            emailDuplicates++;
            duplicatesSkipped++;
            const additionalSources = dup.additional_sources || [];
            if (!additionalSources.includes(sourceName)) {
              additionalSources.push(sourceName);
            }
            await base44.asServiceRole.entities.Job.update(dup.id, {
              additional_sources: additionalSources,
              last_seen_date: new Date().toISOString(),
            });
            continue;
          }

          // Relevance pre-filter. Angel has explicitly chosen LinkedIn and Indeed
          // as allow-all discovery sources: keep every extracted vacancy from
          // either source while retaining its honest relevance label for review.
          const tier = filterRelevance(vacancy, candidate);
          const allowAllSource = ["linkedin", "indeed"].some((source) =>
            sourceName.toLowerCase().includes(source)
          );
          if (tier === "Unlikely Relevant" && !allowAllSource) {
            emailRejected++;
            jobsRejected++;
            continue;
          }

          // ─── Full pipeline: fetch page → isolate → structure → validate ───
          const sourceJobId = vacancy.source_job_id || extractSourceJobId(vacancy.job_url, sourceName);

          // Start with email-extracted data as the base
          let structuredJob: any = {
            job_title: vacancy.job_title || "",
            employer: vacancy.employer || "",
            location: vacancy.location || "",
            salary_min: vacancy.salary_min || 0,
            salary_max: vacancy.salary_max || 0,
            salary_description: vacancy.salary_description || "",
            original_job_url: vacancy.job_url || "",
            job_reference: vacancy.job_reference || "",
            closing_date: vacancy.closing_date || "",
            work_arrangement: vacancy.work_arrangement || "Unspecified",
            employment_type: vacancy.employment_type || "",
            job_description: vacancy.summary || "",
          };
          let extractionStatus = "Partial";
          let extractionMethod = "Email Import";
          let emailImportStatus: string = "Needs Review";
          let contentStatus: string = "Partial";
          let enrichmentStatus: string = "Pending";
          let enrichmentMethod: string = "Email Snippet";
          let extractionConfidence: string = "Low";
          let enrichmentError: string = "";
          let canonicalUrl: string = "";
          let finalUrl: string = "";
          let urlResolutionStatus: string = "Not Attempted";

          // Steps 3-5: Retrieve full vacancy page → isolate primary job → structure advert
          if (vacancy.job_url) {
            try {
              const pageResult = await fetchJobPageContent(vacancy.job_url);
              if (pageResult.status === "success" && pageResult.content) {
                // Step 5: Structure the full job advert using AI
                const extracted = await extractJobFromText(
                  pageResult.content,
                  (params: any) => base44.asServiceRole.integrations.Core.InvokeLLM(params)
                );

                // Merge: page-extracted data takes precedence over email data
                for (const [key, value] of Object.entries(extracted)) {
                  if (value !== "" && value != null && !(typeof value === "number" && value === 0)) {
                    structuredJob[key] = value;
                  }
                }

                // Use the full page content as job description if AI didn't extract one
                if (!structuredJob.job_description && pageResult.content) {
                  structuredJob.job_description = pageResult.content;
                }

                extractionStatus = "Success";
                const enrichmentMethodMap: Record<string, string> = {
                  structured_jobposting: "Structured JobPosting",
                  website_adapter: "Website Adapter",
                  generic_container: "Generic Page Extraction",
                  generic_text: "Generic Page Extraction",
                };
                enrichmentMethod = enrichmentMethodMap[pageResult.extractionSource || ""] || "Generic Page Extraction";
                canonicalUrl = pageResult.finalUrl || vacancy.job_url || "";
                finalUrl = pageResult.finalUrl || "";
                urlResolutionStatus = "Resolved";

                // Step 6: Assess content quality
                const quality = assessContentQuality(structuredJob);
                contentStatus = quality.status;
                enrichmentStatus = quality.status === "Complete" ? "Completed" : "Partial";
                extractionConfidence = quality.confidence;
                if (quality.issues.length > 0) {
                  enrichmentError = quality.issues.join("; ");
                }
                if (quality.status === "Complete") {
                  emailImportStatus = "Complete";
                } else if (quality.status === "Needs Manual Review") {
                  emailImportStatus = "Needs Review";
                } else {
                  emailImportStatus = "Partial";
                }
              } else if (pageResult.status === "restricted") {
                // Restricted site (LinkedIn, Indeed, etc.) — use email data only
                extractionStatus = "Partial";
                extractionMethod = `Email Import (page restricted: ${pageResult.restrictedDomain || "unknown"})`;
                emailImportStatus = "URL Restricted";
                contentStatus = "Restricted Source";
                enrichmentStatus = "Restricted";
                enrichmentMethod = "Email Snippet";
                urlResolutionStatus = "Restricted";
              }
              // If page fetch errors, fall back to email data silently
            } catch (pageError: any) {
              errors.push(`Page fetch failed for ${vacancy.job_url}: ${pageError.message}`);
            }
          }

          // Source trust and content quality are separate decisions. Even a complete
          // advert from a new sender remains in review until Angel approves it.
          if (!knownSource) emailImportStatus = "Needs Review";

          // Create Job record with merged data (email + page)
          const jobData = {
            owner_email: ownerEmail,
            candidate_id: candidate.id,
            job_title: structuredJob.job_title || "",
            employer: structuredJob.employer || "",
            location: structuredJob.location || "",
            salary_min: structuredJob.salary_min || 0,
            salary_max: structuredJob.salary_max || 0,
            salary_description: structuredJob.salary_description || "",
            original_job_url: structuredJob.original_job_url || vacancy.job_url || "",
            job_reference: structuredJob.job_reference || "",
            closing_date: structuredJob.closing_date || "",
            work_arrangement: structuredJob.work_arrangement || "Unspecified",
            employment_type: structuredJob.employment_type || "",
            job_description: structuredJob.job_description || "",
            responsibilities: structuredJob.responsibilities || "",
            essential_requirements: structuredJob.essential_requirements || "",
            desirable_requirements: structuredJob.desirable_requirements || "",
            required_years_experience: structuredJob.required_years_experience || 0,
            required_qualifications: structuredJob.required_qualifications || "",
            required_certifications: structuredJob.required_certifications || "",
            required_technologies: structuredJob.required_technologies || "",
            required_sector_experience: structuredJob.required_sector_experience || "",
            right_to_work_requirements: structuredJob.right_to_work_requirements || "",
            security_clearance_requirement: structuredJob.security_clearance_requirement || "",
            contact_person: structuredJob.contact_person || "",
            contact_email: structuredJob.contact_email || "",
            sector: structuredJob.sector || "",
            job_source_name: sourceName,
            date_discovered: new Date().toISOString().slice(0, 10),
            import_method: "Email",
            extraction_status: extractionStatus,
            extraction_method: extractionMethod,
            discovered_from_email: true,
            email_source: sourceName,
            email_message_id: msg.id,
            email_alert_date: receivedDate,
            source_job_id: sourceJobId,
            first_discovered_date: new Date().toISOString(),
            last_seen_date: new Date().toISOString(),
            relevance_tier: tier,
            email_import_status: emailImportStatus,
            email_sender_trust: senderTrust,
            job_status: "New",
            currency: structuredJob.currency || "GBP",
            job_content_status: contentStatus,
            enrichment_status: enrichmentStatus,
            enrichment_method: enrichmentMethod,
            enrichment_attempted_at: new Date().toISOString(),
            enrichment_completed_at: new Date().toISOString(),
            extraction_confidence: extractionConfidence,
            enrichment_error: enrichmentError || undefined,
            canonical_job_url: canonicalUrl || undefined,
            email_source_url: vacancy.job_url || "",
            final_redirected_url: finalUrl || undefined,
            url_resolution_status: urlResolutionStatus,
            ignored_section_count: 0,
            source_content_length: 0,
            cleaned_content_length: 0,
            content_hash: computeContentHash(structuredJob),
            role_summary: structuredJob.role_summary || "",
            required_skills: structuredJob.required_skills || "",
            required_experience: structuredJob.required_experience || "",
            seniority: structuredJob.seniority || "",
            inside_or_outside_ir35: structuredJob.inside_or_outside_ir35 || "Not Stated",
            salary_period: structuredJob.salary_period || "not_stated",
            salary_text: structuredJob.salary_text || "",
            region: structuredJob.region || "",
            language_requirements: structuredJob.language_requirements || "",
          };

          const created = await base44.asServiceRole.entities.Job.create(jobData);
          existingJobs.push(created);
          emailJobsImported++;
          jobsImported++;

          // Automatic AI scoring — only for recognised sources with sufficient content.
          try {
            if (knownSource && candidate && usableCVs.length > 0 && contentStatus !== "Needs Manual Review" && contentStatus !== "Failed") {
              const matchResult = await runJobMatch(
                created, candidate, usableCVs, scoring,
                (params: any) => base44.asServiceRole.integrations.Core.InvokeLLM(params),
                contentStatus
              );
              await base44.asServiceRole.entities.JobMatch.create({
                owner_email: ownerEmail,
                candidate_id: candidate.id,
                job_id: created.id,
                ...matchResult,
              });
              await base44.asServiceRole.entities.Job.update(created.id, {
                match_score: matchResult.total_score,
                recommendation: matchResult.recommendation,
                last_match_date: new Date().toISOString(),
              });
            }
          } catch (matchError: any) {
            errors.push(`Match failed for job ${created.id}: ${matchError.message}`);
          }
        }

        // Create EmailImport record (replaces the "Processed" label for deduplication)
        await base44.asServiceRole.entities.EmailImport.create({
          owner_email: ownerEmail,
          candidate_id: candidate.id,
          gmail_message_id: msg.id,
          gmail_thread_id: fullMessage.threadId || "",
          sender,
          subject,
          received_date: receivedDate,
          source: sourceName,
          processing_status: !knownSource && vacancies.length > 0
            ? "Needs Review"
            : emailJobsImported > 0 || emailDuplicates > 0 ? "Completed" : "Skipped",
          sender_trust: senderTrust,
          jobs_detected: vacancies.length,
          jobs_imported: emailJobsImported,
          duplicates_skipped: emailDuplicates,
          jobs_rejected: emailRejected,
          processed_date: new Date().toISOString(),
        });

        emailsProcessed++;
        if (!knownSource && vacancies.length > 0) unknownQueued++;
      } catch (err: any) {
        failedEmails++;
        errors.push(`Email ${msg.id}: ${err.message}`);
      }
    }

    const checkedAt = new Date().toISOString();
    // Seed the persistent counters from existing records on the first upgraded run,
    // so deploying this fix does not make Angel's historical totals appear to reset.
    const historicalProcessed = intakeState
      ? intakeState.total_emails_processed || 0
      : await countOwnedEntity(base44.asServiceRole.entities.EmailImport, ownerEmail);
    const historicalJobs = intakeState
      ? intakeState.total_jobs_imported || 0
      : existingJobs.filter((job: any) => job.discovered_from_email).length - jobsImported;
    const historicalDuplicates = intakeState
      ? intakeState.total_duplicates_skipped || 0
      : existingEmailImports.reduce((sum: number, item: any) => sum + (item.duplicates_skipped || 0), 0);
    const historicalFailures = intakeState
      ? intakeState.total_failed_emails || 0
      : existingEmailImports.filter((item: any) => item.processing_status === "Failed").length;
    const stateUpdate = {
      owner_email: ownerEmail,
      candidate_id: candidate.id,
      last_checked_at: checkedAt,
      last_scan_status: failedEmails > 0 ? "Completed with errors" : "Completed",
      last_emails_scanned: messages.length,
      total_emails_processed: historicalProcessed + emailsProcessed,
      total_jobs_imported: historicalJobs + jobsImported,
      total_duplicates_skipped: historicalDuplicates + duplicatesSkipped,
      total_failed_emails: historicalFailures + failedEmails,
      total_unknown_reviewed: (intakeState?.total_unknown_reviewed || 0) + unknownQueued,
    };
    if (intakeState?.id) {
      await base44.asServiceRole.entities.EmailIntakeState.update(intakeState.id, stateUpdate);
    } else {
      await base44.asServiceRole.entities.EmailIntakeState.create(stateUpdate);
    }

    return Response.json({
      summary: {
        mode,
        checked_at: checkedAt,
        emails_scanned: messages.length,
        emails_processed: emailsProcessed,
        jobs_imported: jobsImported,
        duplicates_skipped: duplicatesSkipped,
        jobs_rejected: jobsRejected,
        failed_emails: failedEmails,
        unknown_queued: unknownQueued,
        errors: errors.slice(0, 5),
        message: messages.length === 0
          ? "No job-alert candidates were found in this search window."
          : emailsProcessed === 0
            ? "The candidate emails found had already been processed or were not job-related."
            : undefined,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Gmail API helpers (gmail.readonly only — no label management) ───

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10).replace(/-/g, "/");
}

function buildSearchQuery(sources: any[], afterDate: string): string {
  const domains = sources
    .filter((s: any) => s.sender_domain)
    .map((s: any) => s.sender_domain);

  const fromPart = domains.map((d: string) => `from:${d}`).join(" OR ");
  const subjectPart = ["job alert", "vacancy", "new role", "career opportunity", "contract role", "consulting opportunity"]
    .map((term) => `subject:"${term}"`)
    .join(" OR ");
  const candidates = [fromPart, subjectPart].filter(Boolean).join(" OR ");
  return `(${candidates}) after:${afterDate}`;
}

async function listMessages(authHeader: any, query: string, maxResults: number): Promise<any[]> {
  const messages: any[] = [];
  let pageToken = "";
  while (messages.length < maxResults) {
    const pageSize = Math.min(100, maxResults - messages.length);
    const tokenPart = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=${pageSize}${tokenPart}`;
    const res = await fetch(url, { headers: authHeader });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Gmail search error: ${err.error?.message || res.statusText}`);
    }
    const data = await res.json();
    messages.push(...(data.messages || []));
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return messages;
}

function looksLikeJobEmail(subject: string, bodyText: string): boolean {
  const text = `${subject || ""} ${bodyText || ""}`.toLowerCase().slice(0, 20000);
  const roleSignal = /\b(job|vacanc(?:y|ies)|position|role|career|opportunit(?:y|ies)|contract|consult(?:ant|ing))\b/.test(text);
  const advertSignal = /\b(apply|salary|location|closing date|job description|requirements?|responsibilities|hiring)\b/.test(text);
  return roleSignal && advertSignal;
}

async function countOwnedEntity(entity: any, ownerEmail: string): Promise<number> {
  const pageSize = 500;
  let total = 0;
  let skip = 0;
  while (true) {
    const page = await entity.filter({ owner_email: ownerEmail }, "-created_date", pageSize, skip, ["id"]);
    total += page.length;
    if (page.length < pageSize) return total;
    skip += page.length;
  }
}

async function getMessage(authHeader: any, messageId: string): Promise<any> {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, { headers: authHeader });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to get message: ${err.error?.message || res.statusText}`);
  }
  return res.json();
}

// ─── Duplicate detection ───

function findDuplicate(vacancy: any, existingJobs: any[]): any | null {
  const normalizedUrl = normalizeJobUrl(vacancy.job_url);
  const sourceJobId = vacancy.source_job_id || "";
  const jobRef = (vacancy.job_reference || "").toLowerCase().trim();
  const employer = (vacancy.employer || "").toLowerCase().trim();
  const title = (vacancy.job_title || "").toLowerCase().trim();
  const location = (vacancy.location || "").toLowerCase().trim();

  for (const job of existingJobs) {
    if (normalizedUrl && normalizeJobUrl(job.original_job_url) === normalizedUrl) return job;
    if (sourceJobId && job.source_job_id === sourceJobId) return job;
    if (jobRef && (job.job_reference || "").toLowerCase().trim() === jobRef) return job;
    if (
      employer && title && location &&
      (job.employer || "").toLowerCase().trim() === employer &&
      (job.job_title || "").toLowerCase().trim() === title &&
      (job.location || "").toLowerCase().trim() === location
    ) {
      return job;
    }
  }
  return null;
}

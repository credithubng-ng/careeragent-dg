import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  identifyEmailSource,
  extractEmailBody,
  extractSender,
  extractHeader,
  normalizeJobUrl,
  extractSourceJobId,
  extractVacanciesFromEmail,
} from "../../shared/emailParsers.ts";
import { filterRelevance } from "../../shared/relevanceFilter.ts";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CONNECTOR_ID = "6a6da7ec647be01f097732d5";
const JOB_ALERTS_LABEL = "CareerAgent/Job Alerts";
const PROCESSED_LABEL = "CareerAgent/Processed";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "incremental";
    const maxJobs = Number(body.maxJobs) || 20;

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

    // Get candidate record
    const candidates = await base44.asServiceRole.entities.Candidate.list();
    const candidate = candidates[0];
    if (!candidate) {
      return Response.json(
        { error: "No candidate profile found. Please create your candidate profile first." },
        { status: 400 }
      );
    }

    const ownerEmail = candidate.owner_email || user?.email;
    if (!ownerEmail) {
      return Response.json(
        { error: "Unable to determine owner email. Please log in and try again." },
        { status: 401 }
      );
    }

    // Get Gmail connection (APP_USER mode)
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

    // List/create labels
    const labels = await listLabels(authHeader);
    const jobAlertsLabelId = await ensureLabel(authHeader, labels, JOB_ALERTS_LABEL);
    const processedLabelId = await ensureLabel(authHeader, labels, PROCESSED_LABEL);

    // Search for emails with Job Alerts label
    const afterDate = mode === "initial" ? getDateString(30) : getDateString(90);
    const messages = await listMessages(authHeader, jobAlertsLabelId, afterDate, 50);

    if (!messages.length) {
      return Response.json({
        summary: {
          mode,
          emails_processed: 0,
          jobs_imported: 0,
          duplicates_skipped: 0,
          jobs_rejected: 0,
          failed_emails: 0,
          errors: [],
          message: "No new job-alert emails found. Make sure your Gmail filter applies the 'CareerAgent/Job Alerts' label to job-alert emails.",
        },
      });
    }

    // Get existing data for duplicate detection
    const existingJobs = await base44.asServiceRole.entities.Job.list("-created_date", 500);
    const existingEmailImports = await base44.asServiceRole.entities.EmailImport.list("-created_date", 200);
    const emailSources = await base44.asServiceRole.entities.EmailSource.list();

    let jobsImported = 0;
    let duplicatesSkipped = 0;
    let jobsRejected = 0;
    let emailsProcessed = 0;
    let failedEmails = 0;
    const errors: string[] = [];

    for (const msg of messages) {
      if (mode === "initial" && jobsImported >= maxJobs) break;

      // Skip if already has an EmailImport record
      if (existingEmailImports.some((ei: any) => ei.gmail_message_id === msg.id)) continue;

      try {
        const fullMessage = await getMessage(authHeader, msg.id);

        // Skip if already has Processed label
        if (fullMessage.labelIds?.includes(processedLabelId)) continue;

        const headers = fullMessage.payload?.headers || [];
        const sender = extractSender(headers);
        const subject = extractHeader(headers, "subject");
        const receivedDate = extractHeader(headers, "date");

        const { sourceName } = identifyEmailSource(sender, subject, emailSources);
        const bodyText = extractEmailBody(fullMessage.payload);

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

          // Relevance pre-filter
          const tier = filterRelevance(vacancy, candidate);
          if (tier === "Unlikely Relevant") {
            emailRejected++;
            jobsRejected++;
            continue;
          }

          // Create Job record
          const sourceJobId = vacancy.source_job_id || extractSourceJobId(vacancy.job_url, sourceName);
          const jobData = {
            owner_email: ownerEmail,
            candidate_id: candidate.id,
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
            job_source_name: sourceName,
            date_discovered: new Date().toISOString().slice(0, 10),
            import_method: "Email",
            extraction_status: "Partial",
            extraction_method: "Email Import",
            discovered_from_email: true,
            email_source: sourceName,
            email_message_id: msg.id,
            email_alert_date: receivedDate,
            source_job_id: sourceJobId,
            first_discovered_date: new Date().toISOString(),
            last_seen_date: new Date().toISOString(),
            relevance_tier: tier,
            email_import_status: "Needs Review",
            job_status: "New",
            currency: "GBP",
          };

          const created = await base44.asServiceRole.entities.Job.create(jobData);
          existingJobs.push(created);
          emailJobsImported++;
          jobsImported++;
        }

        // Create EmailImport record
        await base44.asServiceRole.entities.EmailImport.create({
          owner_email: ownerEmail,
          candidate_id: candidate.id,
          gmail_message_id: msg.id,
          gmail_thread_id: msg.threadId,
          sender,
          subject,
          received_date: receivedDate,
          source: sourceName,
          processing_status: emailJobsImported > 0 || emailDuplicates > 0 ? "Completed" : "Skipped",
          jobs_detected: vacancies.length,
          jobs_imported: emailJobsImported,
          duplicates_skipped: emailDuplicates,
          jobs_rejected: emailRejected,
          processed_date: new Date().toISOString(),
        });

        // Apply Processed label
        await modifyMessageLabels(authHeader, msg.id, [processedLabelId], []);

        emailsProcessed++;
      } catch (err: any) {
        failedEmails++;
        errors.push(`Email ${msg.id}: ${err.message}`);
      }
    }

    return Response.json({
      summary: {
        mode,
        emails_processed: emailsProcessed,
        jobs_imported: jobsImported,
        duplicates_skipped: duplicatesSkipped,
        jobs_rejected: jobsRejected,
        failed_emails: failedEmails,
        errors: errors.slice(0, 5),
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Gmail API helpers ───

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10).replace(/-/g, "/");
}

async function listLabels(authHeader: any): Promise<any[]> {
  const res = await fetch(`${GMAIL_API}/labels`, { headers: authHeader });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gmail API error: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.labels || [];
}

async function ensureLabel(authHeader: any, labels: any[], name: string): Promise<string> {
  const existing = labels.find((l: any) => l.name === name);
  if (existing) return existing.id;

  const res = await fetch(`${GMAIL_API}/labels`, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      messageListVisibility: "show",
      labelListVisibility: "labelShow",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to create Gmail label "${name}": ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.id;
}

async function listMessages(authHeader: any, labelId: string, afterDate: string, maxResults: number): Promise<any[]> {
  const url = `${GMAIL_API}/messages?labelIds=${labelId}&maxResults=${maxResults}&q=after:${afterDate}`;
  const res = await fetch(url, { headers: authHeader });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gmail search error: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.messages || [];
}

async function getMessage(authHeader: any, messageId: string): Promise<any> {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, { headers: authHeader });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to get message: ${err.error?.message || res.statusText}`);
  }
  return res.json();
}

async function modifyMessageLabels(authHeader: any, messageId: string, addLabels: string[], removeLabels: string[]): Promise<void> {
  await fetch(`${GMAIL_API}/messages/${messageId}/modify`, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: addLabels, removeLabelIds: removeLabels }),
  });
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
    // Canonical URL match
    if (normalizedUrl && normalizeJobUrl(job.original_job_url) === normalizedUrl) {
      return job;
    }
    // Source-specific job ID match
    if (sourceJobId && job.source_job_id === sourceJobId) {
      return job;
    }
    // Job reference match
    if (jobRef && (job.job_reference || "").toLowerCase().trim() === jobRef) {
      return job;
    }
    // Employer + title + location match
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
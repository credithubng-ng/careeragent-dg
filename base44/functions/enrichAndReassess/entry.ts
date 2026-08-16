import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { fetchJobPageContent } from "../../shared/jobPageFetcher.ts";
import { extractJobFromText, assessContentQuality, computeContentHash } from "../../shared/jobExtraction.ts";
import { runJobMatch } from "../../shared/jobMatching.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const jobId = body.job_id;
    const filter = body.filter || "incomplete";
    const maxJobs = Number(body.max_jobs) || 10;

    // Get candidate (owned by this user only)
    const candidates = await base44.asServiceRole.entities.Candidate.list();
    const candidate = candidates.find((c: any) => c.owner_email === user.email);
    if (!candidate) {
      return Response.json({ error: "No candidate profile found." }, { status: 400 });
    }

    // Get CVs (owned by this user only)
    const allCVs = await base44.asServiceRole.entities.CV.list();
    const usableCVs = allCVs.filter((cv: any) =>
      cv.owner_email === user.email &&
      cv.processing_status === "Ready" &&
      cv.extracted_cv_text?.trim()
    );

    // Get scoring settings (owned by this user only)
    const scoringSettings = await base44.asServiceRole.entities.ScoringSetting.list();
    const scoring = scoringSettings.find((s: any) => s.owner_email === user.email && s.active) || scoringSettings[0];

    // Get jobs to process
    let jobs: any[] = [];
    if (jobId) {
      const job = await base44.asServiceRole.entities.Job.get(jobId);
      if (job.owner_email !== user.email) {
        return Response.json({ error: "Not authorized" }, { status: 403 });
      }
      jobs = [job];
    } else {
      const allJobs = await base44.asServiceRole.entities.Job.list("-created_date", 500);
      jobs = allJobs.filter((j: any) => j.owner_email === user.email);

      if (filter === "incomplete") {
        jobs = jobs.filter((j: any) =>
          j.job_content_status !== "Complete" || !j.match_score || j.enrichment_method === "Email Snippet"
        );
      } else if (filter === "restricted") {
        jobs = jobs.filter((j: any) => j.job_content_status === "Restricted Source");
      } else if (filter === "partial") {
        jobs = jobs.filter((j: any) => j.job_content_status === "Partial");
      } else if (filter === "low_coverage") {
        const matches = await base44.asServiceRole.entities.JobMatch.list();
        const lowCoverageJobIds = new Set(
          matches.filter((m: any) => m.owner_email === user.email && (m.assessment_coverage || 0) < 75).map((m: any) => m.job_id)
        );
        jobs = jobs.filter((j: any) => lowCoverageJobIds.has(j.id));
      }
      jobs = jobs.slice(0, maxJobs);
    }

    let enriched = 0;
    let reassessed = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const job of jobs) {
      try {
        const url = job.canonical_job_url || job.original_job_url;
        if (!url) {
          skipped++;
          continue;
        }

        // Content hash check — skip if unchanged and already complete
        const pageResult = await fetchJobPageContent(url);
        if (pageResult.status !== "success") {
          await base44.asServiceRole.entities.Job.update(job.id, {
            job_content_status: pageResult.status === "restricted" ? "Restricted Source" : "Partial",
            enrichment_status: pageResult.status === "restricted" ? "Restricted" : "Failed",
            enrichment_error: pageResult.error || pageResult.message,
            enrichment_attempted_at: new Date().toISOString(),
          });
          errors.push(`Job ${job.id}: ${pageResult.error || pageResult.message}`);
          failed++;
          continue;
        }

        const extracted = await extractJobFromText(
          pageResult.content,
          (params: any) => base44.asServiceRole.integrations.Core.InvokeLLM(params)
        );

        const quality = assessContentQuality(extracted);
        const newHash = computeContentHash(extracted);

        // Skip if content unchanged
        if (job.content_hash === newHash && job.job_content_status === "Complete" && job.match_score) {
          skipped++;
          continue;
        }

        const updateData: any = {
          job_content_status: quality.status,
          enrichment_status: quality.status === "Complete" ? "Completed" : "Partial",
          enrichment_method: pageResult.extractionSource === "structured_jobposting" ? "Structured JobPosting" :
            pageResult.adapterUsed ? "Website Adapter" : "Generic Page Extraction",
          enrichment_attempted_at: new Date().toISOString(),
          enrichment_completed_at: new Date().toISOString(),
          extraction_confidence: quality.confidence,
          enrichment_error: quality.issues.join("; ") || undefined,
          canonical_job_url: pageResult.finalUrl || url,
          url_resolution_status: "Resolved",
          ignored_section_count: pageResult.sectionsIgnored || 0,
          source_content_length: pageResult.rawContent?.length || 0,
          cleaned_content_length: pageResult.content?.length || 0,
          content_hash: newHash,
        };

        // Field-level precedence: don't overwrite existing non-empty values
        for (const [key, value] of Object.entries(extracted)) {
          if (value === "" || value == null || (typeof value === "number" && value === 0)) continue;
          const existing = job[key];
          if (existing && String(existing).trim().length > 0) continue;
          updateData[key] = value;
        }

        // Always update job_description if the page content is better
        if (pageResult.content && pageResult.content.length > (job.job_description?.length || 0)) {
          updateData.job_description = extracted.job_description || pageResult.content;
        }

        await base44.asServiceRole.entities.Job.update(job.id, updateData);
        enriched++;

        // Run matching if content is sufficient
        if (usableCVs.length > 0 && quality.status !== "Needs Manual Review" && quality.status !== "Failed") {
          try {
            const updatedJob = { ...job, ...updateData };
            const matchResult = await runJobMatch(
              updatedJob, candidate, usableCVs, scoring,
              (params: any) => base44.asServiceRole.integrations.Core.InvokeLLM(params),
              quality.status
            );

            // Delete old JobMatch records (avoid duplicates)
            const oldMatches = await base44.asServiceRole.entities.JobMatch.list();
            const userOldMatches = oldMatches.filter((m: any) => m.owner_email === user.email && m.job_id === job.id);
            for (const oldMatch of userOldMatches) {
              await base44.asServiceRole.entities.JobMatch.delete(oldMatch.id);
            }

            await base44.asServiceRole.entities.JobMatch.create({
              owner_email: user.email,
              candidate_id: candidate.id,
              job_id: job.id,
              ...matchResult,
            });

            await base44.asServiceRole.entities.Job.update(job.id, {
              match_score: matchResult.total_score,
              recommendation: matchResult.recommendation,
              last_match_date: new Date().toISOString(),
            });
            reassessed++;
          } catch (matchError: any) {
            errors.push(`Match failed for job ${job.id}: ${matchError.message}`);
          }
        }
      } catch (err: any) {
        errors.push(`Job ${job.id}: ${err.message}`);
        failed++;
      }
    }

    return Response.json({
      summary: {
        total: jobs.length,
        enriched,
        reassessed,
        skipped,
        failed,
        errors: errors.slice(0, 5),
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
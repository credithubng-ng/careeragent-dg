import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";

const STAGES = new Set([
  "Identified", "Reviewing", "Preparing", "Ready to Apply", "Applied",
  "Recruiter Contact", "First Interview", "Further Interview", "Assessment",
  "Reference Check", "Offer", "Rejected", "Withdrawn",
]);

const JOB_STATUS_BY_STAGE: Record<string, string> = {
  Identified: "Identified",
  Reviewing: "Reviewing",
  Preparing: "Preparing Application",
  "Ready to Apply": "Apply",
  Applied: "Applied",
  "Recruiter Contact": "Applied",
  "First Interview": "Interview",
  "Further Interview": "Interview",
  Assessment: "Interview",
  "Reference Check": "Interview",
  Offer: "Offer",
  Rejected: "Rejected",
  Withdrawn: "Withdrawn",
};

function normaliseEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const ownerEmail = normaliseEmail(user?.email);
    if (!ownerEmail) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id || "");
    const candidateId = String(body.candidate_id || "");
    const stage = String(body.stage || "");
    if (!jobId || !candidateId || !STAGES.has(stage)) {
      return Response.json({ error: "A valid job, candidate and application stage are required." }, { status: 400 });
    }

    const jobs = await base44.asServiceRole.entities.Job.filter({ id: jobId, owner_email: ownerEmail });
    const candidates = await base44.asServiceRole.entities.Candidate.filter({ id: candidateId, owner_email: ownerEmail });
    const job = jobs[0];
    const candidate = candidates[0];
    if (!job || !candidate) return Response.json({ error: "Owned job or candidate not found." }, { status: 404 });

    const existing = await base44.asServiceRole.entities.Application.filter(
      { owner_email: ownerEmail, job_id: jobId },
      "-created_date",
      1
    );
    const previous = existing[0] || null;
    const dateApplied = stage === "Applied"
      ? String(body.date_applied || previous?.date_applied || new Date().toISOString().slice(0, 10))
      : previous?.date_applied;
    const applicationData: Record<string, unknown> = {
      candidate_id: candidateId,
      job_id: jobId,
      job_title: job.job_title,
      employer: job.employer,
      contact_person: job.contact_person || "",
      stage,
      ...(dateApplied ? { date_applied: dateApplied } : {}),
      ...(body.cv_id ? { cv_id: body.cv_id, cv_name: body.cv_name || "" } : {}),
    };

    let application: any;
    let created = false;
    if (previous) {
      application = await base44.asServiceRole.entities.Application.update(previous.id, applicationData);
    } else {
      application = await base44.asServiceRole.entities.Application.create({
        owner_email: ownerEmail,
        application_document_ids: [],
        ...applicationData,
      });
      created = true;
    }

    try {
      const jobStatus = JOB_STATUS_BY_STAGE[stage];
      await base44.asServiceRole.entities.Job.update(jobId, { job_status: jobStatus });
      return Response.json({ application, job_status: jobStatus, created });
    } catch (error) {
      // Compensate so a partial two-record update is not left behind.
      if (created) {
        await base44.asServiceRole.entities.Application.delete(application.id).catch(() => undefined);
      } else if (previous) {
        await base44.asServiceRole.entities.Application.update(previous.id, {
          stage: previous.stage,
          date_applied: previous.date_applied,
          candidate_id: previous.candidate_id,
          cv_id: previous.cv_id,
          cv_name: previous.cv_name,
        }).catch(() => undefined);
      }
      throw error;
    }
  } catch (error: any) {
    return Response.json({ error: error?.message || "Application workflow update failed." }, { status: 500 });
  }
}

import { classifyOpportunityType } from "./opportunityType.js";

const JOB_FIELDS = [
  "candidate_id",
  "job_title",
  "employer",
  "recruitment_agency",
  "job_source_id",
  "job_source_name",
  "original_job_url",
  "job_reference",
  "date_discovered",
  "date_posted",
  "closing_date",
  "opportunity_type",
  "employment_type",
  "contract_length",
  "location",
  "country",
  "work_arrangement",
  "salary_min",
  "salary_max",
  "salary_description",
  "currency",
  "job_description",
  "job_description_file_url",
  "job_description_character_count",
  "job_description_truncated",
  "responsibilities",
  "essential_requirements",
  "desirable_requirements",
  "required_years_experience",
  "required_qualifications",
  "required_certifications",
  "required_technologies",
  "required_sector_experience",
  "right_to_work_requirements",
  "security_clearance_requirement",
  "contact_person",
  "contact_email",
  "recruiter_linkedin_url",
  "job_status",
  "duplicate_job_reference",
  "expired_status",
  "candidate_notes",
  "match_score",
  "recommendation",
  "sector",
  "import_method",
  "extraction_status",
  "extraction_method",
  "last_match_date",
];

const NUMBER_FIELDS = new Set([
  "salary_min",
  "salary_max",
  "required_years_experience",
  "match_score",
]);

function normaliseText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normaliseUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|tracking)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return normaliseText(value).replace(/\/$/, "");
  }
}

export function normaliseJobPayload(job = {}) {
  const payload = {};
  for (const field of JOB_FIELDS) {
    if (!(field in job)) continue;
    const value = job[field];
    if (NUMBER_FIELDS.has(field)) {
      payload[field] = value === "" || value == null ? undefined : Number(value);
    } else if (typeof value === "string") {
      payload[field] = value.trim();
    } else {
      payload[field] = value;
    }
  }
  payload.opportunity_type = classifyOpportunityType({ ...job, ...payload });
  return payload;
}

export function validateJob(job = {}) {
  if (!job.job_title?.trim()) return "Job title is required.";
  if (!job.employer?.trim() && !job.recruitment_agency?.trim()) {
    return "Enter the employer or recruitment agency.";
  }
  if (job.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.contact_email)) {
    return "Enter a valid contact email address.";
  }
  for (const field of ["original_job_url", "recruiter_linkedin_url"]) {
    if (!job[field]) continue;
    try {
      const url = new URL(job[field]);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      return `${field === "original_job_url" ? "Original job URL" : "Recruiter LinkedIn URL"} must be a valid web address.`;
    }
  }
  for (const field of NUMBER_FIELDS) {
    if (job[field] === "" || job[field] == null) continue;
    const value = Number(job[field]);
    if (!Number.isFinite(value) || value < 0) return `${field.replace(/_/g, " ")} must be zero or greater.`;
  }
  if (
    job.salary_min !== "" &&
    job.salary_min != null &&
    job.salary_max !== "" &&
    job.salary_max != null &&
    Number(job.salary_max) < Number(job.salary_min)
  ) {
    return "Maximum salary cannot be lower than minimum salary.";
  }
  if (job.date_posted && job.closing_date && job.closing_date < job.date_posted) {
    return "Closing date cannot be before the posting date.";
  }
  return "";
}

export function findDuplicateJob(jobs = [], candidate = {}, excludedId = "") {
  const url = normaliseUrl(candidate.original_job_url);
  const reference = normaliseText(candidate.job_reference);
  const source = normaliseText(candidate.job_source_name || candidate.employer);
  const title = normaliseText(candidate.job_title);
  const employer = normaliseText(candidate.employer || candidate.recruitment_agency);
  const location = normaliseText(candidate.location);

  return jobs.find((job) => {
    if (job.id === excludedId) return false;
    if (url && normaliseUrl(job.original_job_url) === url) return true;
    if (
      reference &&
      normaliseText(job.job_reference) === reference &&
      normaliseText(job.job_source_name || job.employer) === source
    ) {
      return true;
    }
    return Boolean(
      title &&
      employer &&
      normaliseText(job.job_title) === title &&
      normaliseText(job.employer || job.recruitment_agency) === employer &&
      normaliseText(job.location) === location &&
      normaliseText(job.closing_date) === normaliseText(candidate.closing_date)
    );
  });
}

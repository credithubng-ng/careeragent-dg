import { base44 } from "@/api/base44Client";
import {
  getOwnedRecord,
  updateOwnedRecord,
  createOwnedRecord,
  listOwnedRecords,
  getOwnedCandidate,
} from "./ownedEntities";
import { findDuplicateJob, normaliseJobPayload, validateJob } from "./jobCapture";

// ─── Constants ──────────────────────────────────────────────────────────────

export const MATERIAL_FIELDS = [
  "job_title",
  "employer",
  "job_description",
  "responsibilities",
  "essential_requirements",
  "desirable_requirements",
  "required_technologies",
  "salary_min",
  "salary_max",
  "location",
  "right_to_work_requirements",
  "security_clearance_requirement",
];

export const CORRECTION_REASONS = [
  "Wrong Job Captured",
  "Related Jobs Mixed",
  "Incomplete Description",
  "Incorrect Employer",
  "Incorrect Job Title",
  "Incorrect Salary",
  "Incorrect Location",
  "Source Page Changed",
  "Better Source Available",
  "Manual Correction",
  "Other",
];

export const EDIT_METHODS = {
  manual: "Manual Edit",
  url: "Replacement URL",
  paste: "Paste Replacement",
  pdf: "PDF Replacement",
  aiReextract: "AI Re-extraction",
  wrongJob: "Wrong Job Captured",
};

// All fields that can be manually edited in the Edit Fields tab
export const EDITABLE_FIELD_SECTIONS = [
  {
    section: "Basic Details",
    fields: [
      ["job_title", "Job Title", "text", true],
      ["employer", "Employer", "text"],
      ["recruitment_agency", "Recruitment Agency", "text"],
      ["job_source_name", "Source Name", "text"],
      ["original_job_url", "Original Job URL", "text"],
      ["job_reference", "Job Reference", "text"],
    ],
  },
  {
    section: "Location & Working Pattern",
    fields: [
      ["location", "Location", "text"],
      ["country", "Country", "text"],
      ["work_arrangement", "Work Arrangement", "select", ["", "Remote", "Hybrid", "Office", "Unspecified"]],
      ["employment_type", "Employment Type", "select", ["", "Permanent", "Contract", "Interim", "Fixed Term", "Part-time"]],
      ["contract_length", "Contract Length", "text"],
    ],
  },
  {
    section: "Salary",
    fields: [
      ["salary_min", "Salary Minimum", "number"],
      ["salary_max", "Salary Maximum", "number"],
      ["currency", "Currency", "text"],
      ["salary_description", "Salary Description", "text"],
    ],
  },
  {
    section: "Dates",
    fields: [
      ["date_posted", "Date Posted", "date"],
      ["closing_date", "Closing Date", "date"],
      ["sector", "Sector", "text"],
    ],
  },
  {
    section: "Job Content",
    fields: [
      ["job_description", "Job Description", "textarea"],
      ["responsibilities", "Responsibilities", "textarea"],
      ["essential_requirements", "Essential Requirements", "textarea"],
      ["desirable_requirements", "Desirable Requirements", "textarea"],
    ],
  },
  {
    section: "Requirements",
    fields: [
      ["required_qualifications", "Required Qualifications", "textarea"],
      ["required_certifications", "Required Certifications", "textarea"],
      ["required_technologies", "Required Technologies", "textarea"],
      ["required_sector_experience", "Required Sector Experience", "textarea"],
      ["required_years_experience", "Required Years of Experience", "number"],
      ["right_to_work_requirements", "Right-to-Work Requirements", "textarea"],
      ["security_clearance_requirement", "Security Clearance Requirement", "textarea"],
    ],
  },
  {
    section: "Contact",
    fields: [
      ["contact_person", "Contact Person", "text"],
      ["contact_email", "Contact Email", "text"],
      ["candidate_notes", "Candidate Notes", "textarea"],
    ],
  },
];

// Flatten all editable field names
export const ALL_EDITABLE_FIELDS = EDITABLE_FIELD_SECTIONS.flatMap((s) =>
  s.fields.map((f) => f[0])
);

// Fields to show in the comparison view (URL/Paste/PDF extraction)
export const COMPARISON_FIELDS = [
  "job_title",
  "employer",
  "recruitment_agency",
  "job_source_name",
  "original_job_url",
  "job_reference",
  "location",
  "country",
  "work_arrangement",
  "employment_type",
  "contract_length",
  "salary_min",
  "salary_max",
  "salary_description",
  "currency",
  "date_posted",
  "closing_date",
  "sector",
  "job_description",
  "responsibilities",
  "essential_requirements",
  "desirable_requirements",
  "required_qualifications",
  "required_certifications",
  "required_technologies",
  "required_sector_experience",
  "required_years_experience",
  "right_to_work_requirements",
  "security_clearance_requirement",
  "contact_person",
  "contact_email",
];

export const FIELD_LABELS = {
  job_title: "Job Title",
  employer: "Employer",
  recruitment_agency: "Recruitment Agency",
  job_source_name: "Source Name",
  original_job_url: "Original Job URL",
  job_reference: "Job Reference",
  location: "Location",
  country: "Country",
  work_arrangement: "Work Arrangement",
  employment_type: "Employment Type",
  contract_length: "Contract Length",
  salary_min: "Salary Minimum",
  salary_max: "Salary Maximum",
  salary_description: "Salary Description",
  currency: "Currency",
  date_posted: "Date Posted",
  closing_date: "Closing Date",
  sector: "Sector",
  job_description: "Job Description",
  responsibilities: "Responsibilities",
  essential_requirements: "Essential Requirements",
  desirable_requirements: "Desirable Requirements",
  required_qualifications: "Required Qualifications",
  required_certifications: "Required Certifications",
  required_technologies: "Required Technologies",
  required_sector_experience: "Required Sector Experience",
  required_years_experience: "Required Years of Experience",
  right_to_work_requirements: "Right-to-Work Requirements",
  security_clearance_requirement: "Security Clearance Requirement",
  contact_person: "Contact Person",
  contact_email: "Contact Email",
  candidate_notes: "Candidate Notes",
};

// ─── Comparison Logic ──────────────────────────────────────────────────────

/**
 * Build a field-by-field comparison between current job and new extracted data.
 * Returns an array of { field, label, currentValue, newValue, isDifferent }
 */
export function compareJobFields(currentJob, newJob) {
  return COMPARISON_FIELDS.map((field) => {
    const currentVal = currentJob?.[field] ?? "";
    const newVal = newJob?.[field] ?? "";
    const isDifferent = !valuesEqual(currentVal, newVal);
    return {
      field,
      label: FIELD_LABELS[field] || field,
      currentValue: currentVal,
      newValue: newVal,
      isDifferent,
    };
  });
}

function valuesEqual(a, b) {
  const na = a == null || a === "" ? "" : String(a).trim();
  const nb = b == null || b === "" ? "" : String(b).trim();
  return na === nb;
}

/**
 * Apply field decisions to build the final update payload.
 * decisions: { [field]: { decision: "keep"|"use_new"|"edit", editValue?: string } }
 */
export function buildUpdatePayload(currentJob, newJob, decisions) {
  const payload = {};
  for (const field of COMPARISON_FIELDS) {
    const decision = decisions[field];
    if (!decision || decision.decision === "keep") continue;
    let value;
    if (decision.decision === "use_new") {
      value = newJob?.[field] ?? "";
    } else if (decision.decision === "edit") {
      value = decision.editValue ?? "";
    }
    // Convert number fields
    if (["salary_min", "salary_max", "required_years_experience"].includes(field)) {
      payload[field] = value === "" || value == null ? undefined : Number(value);
    } else {
      payload[field] = typeof value === "string" ? value.trim() : value;
    }
  }
  return payload;
}

/**
 * Detect which fields actually changed between current job and the update payload.
 */
export function detectChangedFields(currentJob, updatePayload) {
  return Object.keys(updatePayload).filter((field) => {
    const oldVal = currentJob?.[field] ?? "";
    const newVal = updatePayload[field] ?? "";
    return !valuesEqual(oldVal, newVal);
  });
}

/**
 * Check if any material fields are in the changed fields list.
 */
export function hasMaterialChanges(changedFields) {
  return changedFields.some((f) => MATERIAL_FIELDS.includes(f));
}

// ─── Validation ────────────────────────────────────────────────────────────

export function validateCorrection(job) {
  const errors = [];
  if (!job.job_title?.trim()) {
    errors.push("Job title is required.");
  }
  if (!job.employer?.trim() && !job.recruitment_agency?.trim()) {
    errors.push("Enter the employer or recruitment agency.");
  }
  if (job.original_job_url) {
    try {
      const url = new URL(job.original_job_url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      errors.push("Original job URL must be a valid http or https address.");
    }
  }
  if (
    job.salary_min != null &&
    job.salary_max != null &&
    Number(job.salary_max) < Number(job.salary_min) &&
    job.salary_max !== "" &&
    job.salary_min !== ""
  ) {
    errors.push("Maximum salary cannot be lower than minimum salary.");
  }
  if (job.closing_date) {
    const today = new Date().toISOString().slice(0, 10);
    if (job.closing_date < today) {
      // Warning, not blocking
    }
  }
  return errors;
}

export function isClosingDateExpired(closingDate) {
  if (!closingDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return closingDate < today;
}

// ─── Save Logic ────────────────────────────────────────────────────────────

/**
 * Save a job correction. Updates the existing job (same ID), creates a
 * JobSourceHistory record, and invalidates the match if material fields changed.
 * Does NOT delete or disconnect any linked records.
 */
export async function saveJobCorrection({
  jobId,
  updatePayload,
  editMethod,
  reason,
  notes,
  previousSourceType,
  previousUrl,
  newSourceType,
  newUrl,
  extractionStatus,
  extractionConfidence,
  rerunMatch = false,
  candidate,
  cvs,
  scoring,
}) {
  const job = await getOwnedRecord("Job", jobId);
  if (!job) throw new Error("The job could not be found or you do not have permission to edit it.");

  const changedFields = detectChangedFields(job, updatePayload);
  const previousValues = {};
  const newValues = {};
  for (const field of changedFields) {
    previousValues[field] = job[field] ?? "";
    newValues[field] = updatePayload[field] ?? "";
  }

  // Validate the merged result
  const mergedJob = { ...job, ...updatePayload };
  const validationErrors = validateCorrection(mergedJob);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors[0]);
  }

  // Check for duplicates (excluding self)
  const allJobs = await listOwnedRecords("Job", {}, "-created_date", 500);
  const duplicate = findDuplicateJob(allJobs, mergedJob, jobId);
  if (duplicate) {
    throw new Error(
      `This correction matches an existing job: ${duplicate.job_title} at ${duplicate.employer || duplicate.recruitment_agency}.`
    );
  }

  // Determine new version number
  const currentVersion = job.job_version || 1;
  const newVersion = currentVersion + (changedFields.length > 0 ? 1 : 0);

  // Build the final update payload with version + match status
  const finalPayload = { ...updatePayload };
  const materialChanged = hasMaterialChanges(changedFields);
  if (changedFields.length > 0) {
    finalPayload.job_version = newVersion;
    if (materialChanged) {
      finalPayload.match_status = "Needs Reanalysis";
    }
  }

  // Update the job (same ID preserved)
  const updatedJob = await updateOwnedRecord("Job", jobId, finalPayload);

  // Create source history record (only if something changed)
  if (changedFields.length > 0) {
    await createOwnedRecord("JobSourceHistory", {
      job_id: jobId,
      candidate_id: job.candidate_id,
      version_number: newVersion,
      previous_source_type: previousSourceType || job.source_type || "",
      previous_url: previousUrl || job.original_job_url || "",
      new_source_type: newSourceType || "",
      new_url: newUrl || updatePayload.original_job_url || "",
      edit_method: editMethod,
      edited_by: job.owner_email || "",
      edit_date: new Date().toISOString(),
      fields_changed: changedFields,
      previous_values: previousValues,
      new_values: newValues,
      reason_for_correction: reason,
      correction_notes: notes || "",
      extraction_status: extractionStatus || "Manual",
      extraction_confidence: extractionConfidence || "",
      job_snapshot: {
        job_title: mergedJob.job_title,
        employer: mergedJob.employer,
        location: mergedJob.location,
        original_job_url: mergedJob.original_job_url,
      },
    });
  }

  // Optionally re-run match
  let matchResult = null;
  if (rerunMatch && materialChanged) {
    matchResult = await rerunJobMatch(updatedJob, candidate, cvs, scoring);
  }

  return {
    updatedJob,
    changedFields,
    materialChanged,
    newVersion,
    matchResult,
  };
}

/**
 * Save the corrected data as a completely new, separate Job opportunity.
 * The original job is left untouched.
 */
export async function saveAsSeparateOpportunity({
  sourceJobId,
  newJobData,
  editMethod,
  reason,
  notes,
  newSourceType,
  newUrl,
  extractionStatus,
  extractionConfidence,
}) {
  const sourceJob = await getOwnedRecord("Job", sourceJobId);
  if (!sourceJob) throw new Error("The source job could not be found.");

  // Build the new job payload from source + overrides
  const payload = normaliseJobPayload({
    ...sourceJob,
    ...newJobData,
    candidate_id: sourceJob.candidate_id,
    // Reset match-related fields for the new job
    match_score: undefined,
    recommendation: undefined,
    last_match_date: undefined,
    match_status: "Not Scored",
    job_version: 1,
    // Clear source-specific fields that shouldn't carry over
    id: undefined,
    created_date: undefined,
    updated_date: undefined,
  });

  const validationErrors = validateJob(payload);
  if (validationErrors) throw new Error(validationErrors);

  // Check for duplicates
  const allJobs = await listOwnedRecords("Job", {}, "-created_date", 500);
  const duplicate = findDuplicateJob(allJobs, payload, sourceJobId);
  if (duplicate) {
    throw new Error(
      `This would create a duplicate of: ${duplicate.job_title} at ${duplicate.employer || duplicate.recruitment_agency}.`
    );
  }

  const newJob = await createOwnedRecord("Job", payload);

  // Record in source history (linked to the NEW job)
  await createOwnedRecord("JobSourceHistory", {
    job_id: newJob.id,
    candidate_id: sourceJob.candidate_id,
    version_number: 1,
    previous_source_type: sourceJob.source_type || "",
    previous_url: sourceJob.original_job_url || "",
    new_source_type: newSourceType || "",
    new_url: newUrl || newJobData.original_job_url || "",
    edit_method: editMethod,
    edited_by: sourceJob.owner_email || "",
    edit_date: new Date().toISOString(),
    fields_changed: Object.keys(newJobData),
    previous_values: {},
    new_values: newJobData,
    reason_for_correction: reason,
    correction_notes: (notes || "") + " (Saved as separate opportunity from job " + sourceJobId + ")",
    extraction_status: extractionStatus || "Manual",
    extraction_confidence: extractionConfidence || "",
    job_snapshot: {
      job_title: newJob.job_title,
      employer: newJob.employer,
      location: newJob.location,
      original_job_url: newJob.original_job_url,
    },
  });

  return { newJob };
}

/**
 * Re-run the AI job match after a correction.
 */
async function rerunJobMatch(job, candidate, cvs, scoring) {
  if (!candidate) {
    candidate = await getOwnedCandidate();
  }
  if (!candidate) throw new Error("Create your candidate profile before re-running match analysis.");

  if (!cvs || cvs.length === 0) {
    cvs = await listOwnedRecords("CV");
  }
  const usableCVs = (cvs || []).filter(
    (cv) => cv.processing_status === "Ready" && cv.extracted_cv_text?.trim()
  );
  if (usableCVs.length === 0) {
    throw new Error("Upload and process a Master CV before re-running match analysis.");
  }

  if (!scoring) {
    const settings = await listOwnedRecords("ScoringSetting", { active: true });
    scoring = settings[0] || null;
  }

  const { analyseJobMatch } = await import("./careerAI");
  const result = await analyseJobMatch(
    job,
    candidate,
    cvs,
    scoring,
    job.job_content_status || "Complete"
  );

  const matchPayload = {
    candidate_id: candidate.id,
    job_id: job.id,
    ...result,
  };
  const created = await createOwnedRecord("JobMatch", matchPayload);

  // Update job with new match score + status
  await updateOwnedRecord("Job", job.id, {
    match_score: result.total_score,
    recommendation: result.recommendation,
    last_match_date: new Date().toISOString(),
    match_status: "Current",
  });

  return created;
}

/**
 * Mark the current JobMatch as needing reanalysis (without deleting it).
 * Preserves the previous match for audit history.
 */
export async function invalidateMatch(jobId) {
  const matches = await listOwnedRecords("JobMatch", { job_id: jobId }, "-created_date", 1);
  if (matches[0]) {
    await updateOwnedRecord("JobMatch", matches[0].id, {
      assessment_status: "Needs Reanalysis",
    });
  }
  await updateOwnedRecord("Job", jobId, { match_status: "Needs Reanalysis" });
}

/**
 * Check if application documents exist for this job.
 */
export async function checkExistingDocuments(jobId) {
  const docs = await listOwnedRecords("ApplicationDocument", { job_id: jobId });
  return docs;
}
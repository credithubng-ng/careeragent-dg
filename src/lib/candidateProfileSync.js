import { base44 } from "@/api/base44Client";
import { createOwnedRecord } from "@/lib/ownedEntities";

const SCALAR_FIELDS = [
  "full_name",
  "email",
  "telephone",
  "current_location",
  "linkedin_url",
  "current_job_title",
  "current_employer",
  "years_total_experience",
  "years_leadership",
  "years_data_governance",
  "current_industry",
  "executive_profile",
  "career_achievements",
  "leadership_experience",
  "regulatory_experience",
  "transformation_experience",
  "stakeholder_management_experience",
  "team_management_experience",
  "budget_management_experience",
];

function isBlank(value) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

function mergeUnique(existing = [], incoming = [], key) {
  const merged = [...existing];
  const seen = new Set(existing.map((item) => String(item?.[key] || "").trim().toLowerCase()));
  for (const item of incoming || []) {
    const identity = String(item?.[key] || "").trim().toLowerCase();
    if (identity && !seen.has(identity)) {
      merged.push(item);
      seen.add(identity);
    }
  }
  return merged;
}

export function buildCandidateProfileUpdate(candidate, extracted = {}) {
  const update = {};
  for (const field of SCALAR_FIELDS) {
    if (isBlank(candidate?.[field]) && !isBlank(extracted[field])) {
      update[field] = extracted[field];
    }
  }

  const skills = mergeUnique(candidate?.skills, extracted.skills, "name");
  const certifications = mergeUnique(candidate?.certifications, extracted.certifications, "qualification");
  const education = mergeUnique(candidate?.education, extracted.education, "qualification");
  const employmentHistory = mergeUnique(candidate?.employment_history, extracted.employment_history, "job_title");

  if (skills.length > (candidate?.skills || []).length) update.skills = skills;
  if (certifications.length > (candidate?.certifications || []).length) update.certifications = certifications;
  if (education.length > (candidate?.education || []).length) update.education = education;
  if (employmentHistory.length > (candidate?.employment_history || []).length) {
    update.employment_history = employmentHistory;
  }
  return update;
}

export async function syncCandidateProfileFromCV(candidate, extracted) {
  if (!extracted || typeof extracted !== "object") return { updated: false };
  const update = buildCandidateProfileUpdate(candidate, extracted);
  if (Object.keys(update).length === 0) return { updated: false };

  if (candidate?.id) {
    await base44.entities.Candidate.update(candidate.id, update);
    return { updated: true };
  }

  if (!update.full_name) return { updated: false };
  await createOwnedRecord("Candidate", {
    ...update,
    skills: update.skills || [],
    certifications: update.certifications || [],
    education: update.education || [],
    employment_history: update.employment_history || [],
  });
  return { updated: true };
}

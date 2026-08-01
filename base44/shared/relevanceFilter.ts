/**
 * Lightweight relevance pre-filter for email-imported vacancies.
 * Runs BEFORE the expensive full AI Match to avoid wasting credits
 * on obviously irrelevant jobs.
 */

export const TARGET_TITLES = [
  "Data Governance Manager",
  "Senior Data Governance Manager",
  "Head of Data Governance",
  "Data Governance Lead",
  "Data Quality Manager",
  "Head of Data Quality",
  "Data Management Lead",
  "Data Governance Consultant",
  "Data Stewardship Lead",
  "Metadata Manager",
  "Data Controls Manager",
  "Data Risk and Controls Manager",
  "Information Governance Manager",
  "Master Data Management Lead",
  "Data Policy Manager",
  "Data Standards Manager",
  "Data Assurance Manager",
  "Chief Data Office Governance",
];

export const EXCLUDED_TITLES = [
  "Graduate",
  "Intern",
  "Junior",
  "Data Engineer",
  "Software Engineer",
  "BI Developer",
  "Data Scientist",
  "Machine Learning Engineer",
  "Database Administrator",
  "Data Analyst",
];

export type RelevanceTier = "Relevant" | "Possibly Relevant" | "Unlikely Relevant";

/**
 * Filter a vacancy's relevance based on title, salary, location, and candidate preferences.
 * This is a lightweight heuristic — the full AI Match runs separately for Relevant/Possibly jobs.
 */
export function filterRelevance(vacancy: any, candidate: any): RelevanceTier {
  const title = (vacancy.job_title || "").toLowerCase();
  const salaryMin = Number(vacancy.salary_min) || 0;
  const location = (vacancy.location || "").toLowerCase();

  // Check excluded titles first
  for (const excluded of EXCLUDED_TITLES) {
    if (title.includes(excluded.toLowerCase())) {
      return "Unlikely Relevant";
    }
  }

  // Check candidate's excluded job titles
  const candidateExcluded = (candidate?.excluded_job_titles || []).map((t: string) => t.toLowerCase());
  for (const excluded of candidateExcluded) {
    if (excluded && title.includes(excluded)) {
      return "Unlikely Relevant";
    }
  }

  // Check target titles
  let titleMatch = false;
  for (const target of TARGET_TITLES) {
    if (title.includes(target.toLowerCase())) {
      titleMatch = true;
      break;
    }
  }

  // Check candidate's preferred job titles
  const candidatePreferred = (candidate?.preferred_job_titles || []).map((t: string) => t.toLowerCase());
  for (const preferred of candidatePreferred) {
    if (preferred && title.includes(preferred)) {
      titleMatch = true;
      break;
    }
  }

  // Check salary against candidate minimum
  const candidateMinSalary = Number(candidate?.min_salary) || 0;
  let salaryOk = true;
  if (candidateMinSalary > 0 && salaryMin > 0 && salaryMin < candidateMinSalary * 0.8) {
    salaryOk = false;
  }

  // Check location
  const preferredLocations = (candidate?.preferred_locations || []).map((l: string) => l.toLowerCase());
  let locationOk = true;
  if (preferredLocations.length > 0 && location) {
    locationOk = preferredLocations.some((loc: string) => location.includes(loc) || loc.includes(location));
    // Remote is always OK if candidate prefers remote
    if (!locationOk && (location.includes("remote") || location.includes("anywhere"))) {
      locationOk = true;
    }
  }

  // Determine relevance
  if (titleMatch && salaryOk && locationOk) {
    return "Relevant";
  }
  if (titleMatch || (salaryOk && locationOk)) {
    return "Possibly Relevant";
  }
  return "Unlikely Relevant";
}
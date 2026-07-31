/**
 * Job extraction utilities: structured-data merge, coherence validation,
 * and extraction-confidence assessment.
 *
 * These functions run on the frontend after the backend (fetchJobPage) has
 * isolated the primary vacancy content and returned any JSON-LD JobPosting
 * structured data.
 */

const RELATED_JOBS_HEADINGS = [
  "similar jobs",
  "related jobs",
  "recommended jobs",
  "other vacancies",
  "jobs you may like",
  "more jobs",
  "latest jobs",
  "featured jobs",
  "search results",
  "people also viewed",
  "you may also be interested",
  "other opportunities",
  "jobs from this employer",
  "recently viewed jobs",
  "suggested roles",
];

/**
 * Merge structured JobPosting data with AI-extracted fields.
 * Structured data takes priority; AI fills gaps.
 */
export function mergeExtraction(aiFields, structuredData) {
  if (!structuredData || typeof structuredData !== "object") return aiFields;
  const merged = { ...aiFields };
  for (const [key, value] of Object.entries(structuredData)) {
    if (value == null || String(value).trim() === "") continue;
    const existing = merged[key];
    if (existing == null || String(existing).trim() === "") {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Validate that the extracted content represents one coherent job.
 * Returns warnings and a contamination flag.
 */
export function validateJobCoherence(extracted, rawContent) {
  const warnings = [];
  let contaminated = false;

  const contentLower = String(rawContent || "").toLowerCase();

  // Check for related-jobs headings in the raw content
  for (const heading of RELATED_JOBS_HEADINGS) {
    if (contentLower.includes(heading)) {
      warnings.push(`Related-jobs section detected: "${heading}"`);
      contaminated = true;
    }
  }

  // Check for multiple "Apply" sections (different roles)
  const applyMatches = contentLower.match(/apply\s+(now|for this|today|for this role|for this job)/g);
  if (applyMatches && applyMatches.length > 1) {
    warnings.push("Multiple Apply sections detected — possible multiple vacancies");
    contaminated = true;
  }

  // Check for multiple job-reference numbers
  const refMatches = contentLower.match(/(?:job\s*ref(?:erence)?|ref(?:erence)?\s*(?:no|number|#))[:\s]*([a-z0-9][-a-z0-9]{3,})/gi);
  if (refMatches && refMatches.length > 1) {
    warnings.push("Multiple job-reference numbers detected — possible multiple vacancies");
    contaminated = true;
  }

  // Check job description length
  if (extracted.job_description && extracted.job_description.trim().length < 100) {
    warnings.push("Job description is very short — extraction may be incomplete");
  }

  // Check for missing primary title
  if (!extracted.job_title || !extracted.job_title.trim()) {
    warnings.push("Primary job title is missing");
    contaminated = true;
  }

  // Check for missing employer
  if (
    (!extracted.employer || !extracted.employer.trim()) &&
    (!extracted.recruitment_agency || !extracted.recruitment_agency.trim())
  ) {
    warnings.push("Employer or recruitment agency is missing");
  }

  return { warnings, contaminated };
}

/**
 * Assess extraction confidence based on source and field completeness.
 */
export function assessConfidence(extractionSource, extracted, contaminated) {
  if (contaminated) return "Low";

  const keyFields = [
    "job_title",
    "employer",
    "job_description",
    "location",
  ];
  const filled = keyFields.filter(
    (f) => extracted[f] != null && String(extracted[f]).trim() !== ""
  ).length;

  if (extractionSource === "structured_jobposting" && filled >= 3) return "High";
  if (extractionSource === "website_adapter" && filled >= 3) return "High";
  if (filled >= 3) return "Medium";
  if (filled >= 1) return "Low";
  return "Low";
}

/**
 * Determine whether AI Match should be blocked based on extraction quality.
 */
export function shouldBlockMatching(extracted, confidence, contaminated) {
  if (contaminated) return true;
  if (confidence === "Low") return true;
  if (!extracted.job_title || !extracted.job_title.trim()) return true;
  if (
    (!extracted.employer || !extracted.employer.trim()) &&
    (!extracted.recruitment_agency || !extracted.recruitment_agency.trim())
  )
    return true;
  if (!extracted.job_description || extracted.job_description.trim().length < 100)
    return true;
  return false;
}

/**
 * Human-readable label for extraction source.
 */
export function extractionSourceLabel(source) {
  const labels = {
    structured_jobposting: "Structured JobPosting",
    website_adapter: "Website Adapter",
    generic_container: "Generic Page Extraction",
    generic_text: "Generic Page Extraction",
    ai_isolation: "AI Isolation",
  };
  return labels[source] || "Generic Page Extraction";
}
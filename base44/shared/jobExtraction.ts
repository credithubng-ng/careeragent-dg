/**
 * AI-powered job structuring and content quality assessment.
 * Used by the email intake pipeline, URL import, paste import, and
 * the enrich-and-reassess action.
 */

export interface StructuredJob {
  job_title: string;
  employer: string;
  recruitment_agency: string;
  job_source_name: string;
  original_job_url: string;
  canonical_job_url: string;
  job_reference: string;
  date_posted: string;
  location: string;
  country: string;
  region: string;
  work_arrangement: string;
  employment_type: string;
  opportunity_type: string;
  contract_length: string;
  inside_or_outside_ir35: string;
  salary_min: number;
  salary_max: number;
  salary_description: string;
  salary_period: string;
  salary_text: string;
  currency: string;
  role_summary: string;
  job_description: string;
  responsibilities: string;
  essential_requirements: string;
  desirable_requirements: string;
  required_skills: string;
  required_experience: string;
  required_years_experience: number;
  required_qualifications: string;
  required_certifications: string;
  required_technologies: string;
  required_sector_experience: string;
  seniority: string;
  sector: string;
  right_to_work_requirements: string;
  language_requirements: string;
  security_clearance_requirement: string;
  closing_date: string;
  contact_person: string;
  contact_email: string;
  extraction_confidence: string;
  ambiguity_warning: boolean;
}

export async function extractJobFromText(
  text: string,
  invokeLLM: (params: any) => Promise<any>
): Promise<Partial<StructuredJob>> {
  const today = new Date().toISOString().slice(0, 10);
  const res = await invokeLLM({
    prompt: `You are an opportunity-extraction engine for UK Data Governance employment, interim and consulting work. The text below has been isolated from a recruitment or procurement webpage to contain only the primary opportunity. Extract only facts stated in the text that belong to the primary opportunity. If the text appears to contain multiple opportunities, set ambiguity_warning to true and extract only the primary one. Do not merge requirements from different opportunities. Leave unknown fields empty ("" or 0); do not infer missing employer, salary, dates, requirements or contact details. Parse salary, day-rate or project-budget ranges into numeric min/max without converting currencies. Use YYYY-MM-DD for dates. Classify opportunity_type as Permanent Employment, Contract or Interim, or Consulting Engagement from the advert's commercial relationship. Set work_arrangement and employment_type only to one of the schema values. Identify the stated sector where possible. Set extraction_confidence to "High", "Medium", or "Low" based on how complete and coherent the extraction is.\n\nToday: ${today}\n\nOPPORTUNITY TEXT:\n${text}`,
    response_json_schema: {
      type: "object",
      properties: {
        job_title: { type: "string" },
        employer: { type: "string" },
        recruitment_agency: { type: "string" },
        job_source_name: { type: "string" },
        original_job_url: { type: "string" },
        canonical_job_url: { type: "string" },
        job_reference: { type: "string" },
        date_posted: { type: "string" },
        location: { type: "string" },
        country: { type: "string" },
        region: { type: "string" },
        work_arrangement: { type: "string", enum: ["", "Remote", "Hybrid", "Office", "Unspecified"] },
        employment_type: { type: "string", enum: ["", "Permanent", "Contract", "Interim", "Fixed Term", "Part-time"] },
        opportunity_type: { type: "string", enum: ["", "Permanent Employment", "Contract or Interim", "Consulting Engagement"] },
        contract_length: { type: "string" },
        inside_or_outside_ir35: { type: "string", enum: ["", "Inside IR35", "Outside IR35", "Not Stated"] },
        salary_min: { type: "number" },
        salary_max: { type: "number" },
        salary_description: { type: "string" },
        salary_period: { type: "string", enum: ["", "annual", "daily", "hourly", "monthly", "not_stated"] },
        salary_text: { type: "string" },
        currency: { type: "string" },
        role_summary: { type: "string" },
        job_description: { type: "string" },
        responsibilities: { type: "string" },
        essential_requirements: { type: "string" },
        desirable_requirements: { type: "string" },
        required_skills: { type: "string" },
        required_experience: { type: "string" },
        required_years_experience: { type: "number" },
        required_qualifications: { type: "string" },
        required_certifications: { type: "string" },
        required_technologies: { type: "string" },
        required_sector_experience: { type: "string" },
        seniority: { type: "string" },
        sector: { type: "string" },
        right_to_work_requirements: { type: "string" },
        language_requirements: { type: "string" },
        security_clearance_requirement: { type: "string" },
        closing_date: { type: "string" },
        contact_person: { type: "string" },
        contact_email: { type: "string" },
        extraction_confidence: { type: "string", enum: ["High", "Medium", "Low"] },
        ambiguity_warning: { type: "boolean" },
      },
    },
  });
  return res || {};
}

// ─── Content Quality Assessment ───

export interface ContentQualityResult {
  status: "Complete" | "Partial" | "Restricted Source" | "Needs Manual Review" | "Failed";
  issues: string[];
  confidence: string;
}

export function detectContamination(job: Partial<StructuredJob>): { contaminated: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const description = String(job.job_description || "");

  // Check for related-jobs sections remaining in the cleaned description
  const relatedPatterns = [
    /related\s+(jobs|vacancies|positions|roles)/i,
    /similar\s+(jobs|vacancies|positions|roles)/i,
    /recommended\s+(jobs|vacancies|roles)/i,
    /other\s+(jobs|vacancies|opportunities|roles)/i,
    /people\s+also\s+(viewed|applied|browsed)/i,
    /more\s+(jobs|vacancies|roles)\s+like/i,
  ];
  for (const pattern of relatedPatterns) {
    if (pattern.test(description)) {
      reasons.push(`Related-jobs section detected in description`);
      break;
    }
  }

  // Check for multiple distinct job titles in the description
  const titleMarkers = description.match(/(?:job title|position|role)\s*:\s*([^\n]{5,80})/gi);
  if (titleMarkers && titleMarkers.length > 1) {
    reasons.push("Multiple job titles detected — possible mixed content");
  }

  // Check for multiple employers
  const employerMarkers = description.match(/(?:employer|company|organisation)\s*:\s*([^\n]{3,80})/gi);
  if (employerMarkers && employerMarkers.length > 1) {
    reasons.push("Multiple employers detected — possible mixed content");
  }

  // Check for multiple job references
  const refMarkers = description.match(/(?:reference|ref)\s*[:#]\s*([A-Z0-9-]{4,20})/gi);
  if (refMarkers && refMarkers.length > 1) {
    reasons.push("Multiple job references detected — possible mixed content");
  }

  // Check if the page looks like a search-results page
  if (/^(jobs|results|search results)/i.test(description.slice(0, 100)) && /\d+\s+jobs?\s+(found|matched|listed)/i.test(description)) {
    reasons.push("Page appears to be a search-results page rather than a single vacancy");
  }

  return { contaminated: reasons.length > 0, reasons };
}

export function assessContentQuality(job: Partial<StructuredJob>): ContentQualityResult {
  const issues: string[] = [];

  // Check for contamination first — this overrides everything
  const contamination = detectContamination(job);
  if (contamination.contaminated) {
    return {
      status: "Needs Manual Review",
      issues: contamination.reasons,
      confidence: "Low",
    };
  }

  // Check for required fields per the "Complete" definition
  if (!job.job_title || job.job_title.trim().length < 3) {
    issues.push("Missing or incomplete job title");
  }
  if (!job.employer && !job.recruitment_agency) {
    issues.push("Missing employer or recruitment agency");
  }
  if (!job.job_description || job.job_description.trim().length < 200) {
    issues.push("Job description is too short or missing");
  }
  if (!job.responsibilities && !job.essential_requirements && !job.required_skills && !job.required_experience) {
    issues.push("No responsibilities, requirements or skills extracted");
  }
  if (!job.location && job.work_arrangement !== "Remote" && job.work_arrangement !== "Unspecified") {
    issues.push("Missing location and no explicit remote status");
  }

  // Determine status
  if (issues.length === 0) {
    return { status: "Complete", issues: [], confidence: job.extraction_confidence || "High" };
  }

  // Has title and description but missing some sections → Partial
  if (job.job_title && job.job_description && job.job_description.trim().length >= 100) {
    return { status: "Partial", issues, confidence: job.extraction_confidence || "Medium" };
  }

  // Very incomplete
  return { status: "Partial", issues, confidence: "Low" };
}

export function validateJobCompleteness(job: Partial<StructuredJob>): {
  valid: boolean;
  confidence: string;
  issues: string[];
} {
  const quality = assessContentQuality(job);
  return {
    valid: quality.status === "Complete",
    confidence: quality.confidence,
    issues: quality.issues,
  };
}

// ─── Content Hash ───

export function computeContentHash(job: Partial<StructuredJob>): string {
  const fields = [
    job.job_title, job.employer, job.job_description, job.responsibilities,
    job.essential_requirements, job.required_skills, job.location, job.salary_min,
    job.salary_max, job.employment_type, job.work_arrangement,
  ].map((v) => String(v || "").trim().toLowerCase()).join("|");
  let hash = 0;
  for (let i = 0; i < fields.length; i++) {
    const char = fields.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return String(Math.abs(hash));
}

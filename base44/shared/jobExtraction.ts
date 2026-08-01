/**
 * AI-powered job structuring — takes raw page text and extracts a structured
 * job advert using the LLM. Used by the email intake pipeline after the
 * full vacancy page has been retrieved.
 */

export interface StructuredJob {
  job_title: string;
  employer: string;
  recruitment_agency: string;
  job_source_name: string;
  original_job_url: string;
  job_reference: string;
  date_posted: string;
  location: string;
  country: string;
  work_arrangement: string;
  employment_type: string;
  contract_length: string;
  salary_min: number;
  salary_max: number;
  salary_description: string;
  currency: string;
  job_description: string;
  responsibilities: string;
  essential_requirements: string;
  desirable_requirements: string;
  required_years_experience: number;
  required_qualifications: string;
  required_certifications: string;
  required_technologies: string;
  required_sector_experience: string;
  right_to_work_requirements: string;
  security_clearance_requirement: string;
  closing_date: string;
  contact_person: string;
  contact_email: string;
  sector: string;
  extraction_confidence: string;
  ambiguity_warning: boolean;
}

export async function extractJobFromText(
  text: string,
  invokeLLM: (params: any) => Promise<any>
): Promise<Partial<StructuredJob>> {
  const today = new Date().toISOString().slice(0, 10);
  const res = await invokeLLM({
    prompt: `You are a job-description extraction engine for UK Data Governance roles. The text below has been isolated from a recruitment webpage to contain only the primary vacancy. Extract only facts stated in the text that belong to the primary vacancy. If the text appears to contain multiple job vacancies, set ambiguity_warning to true and extract only the primary vacancy (the one matching the page title or main heading). Do not merge requirements from different vacancies. Leave unknown fields empty ("" or 0); do not infer missing employer, salary, dates, requirements or contact details. Parse salary ranges into numeric min/max without converting currencies. Use YYYY-MM-DD for dates. Set work_arrangement and employment_type only to one of the schema values. Identify the stated sector where possible. Set extraction_confidence to "High", "Medium", or "Low" based on how complete and coherent the extraction is.\n\nToday: ${today}\n\nJOB TEXT:\n${text}`,
    response_json_schema: {
      type: "object",
      properties: {
        job_title: { type: "string" },
        employer: { type: "string" },
        recruitment_agency: { type: "string" },
        job_source_name: { type: "string" },
        original_job_url: { type: "string" },
        job_reference: { type: "string" },
        date_posted: { type: "string" },
        location: { type: "string" },
        country: { type: "string" },
        work_arrangement: { type: "string", enum: ["", "Remote", "Hybrid", "Office", "Unspecified"] },
        employment_type: { type: "string", enum: ["", "Permanent", "Contract", "Interim", "Fixed Term", "Part-time"] },
        contract_length: { type: "string" },
        salary_min: { type: "number" },
        salary_max: { type: "number" },
        salary_description: { type: "string" },
        currency: { type: "string" },
        job_description: { type: "string" },
        responsibilities: { type: "string" },
        essential_requirements: { type: "string" },
        desirable_requirements: { type: "string" },
        required_years_experience: { type: "number" },
        required_qualifications: { type: "string" },
        required_certifications: { type: "string" },
        required_technologies: { type: "string" },
        required_sector_experience: { type: "string" },
        right_to_work_requirements: { type: "string" },
        security_clearance_requirement: { type: "string" },
        closing_date: { type: "string" },
        contact_person: { type: "string" },
        contact_email: { type: "string" },
        sector: { type: "string" },
        extraction_confidence: { type: "string", enum: ["High", "Medium", "Low"] },
        ambiguity_warning: { type: "boolean" },
      },
    },
  });
  return res || {};
}

export interface ValidationResult {
  valid: boolean;
  confidence: string;
  issues: string[];
}

export function validateJobCompleteness(job: Partial<StructuredJob>): ValidationResult {
  const issues: string[] = [];
  const confidence = job.extraction_confidence || "Low";

  if (!job.job_title || job.job_title.trim().length < 3) {
    issues.push("Missing or incomplete job title");
  }
  if (!job.employer || job.employer.trim().length < 2) {
    issues.push("Missing employer name");
  }
  if (!job.job_description || job.job_description.trim().length < 200) {
    issues.push("Job description is too short or missing");
  }
  if (!job.essential_requirements && !job.responsibilities) {
    issues.push("No requirements or responsibilities extracted");
  }

  const valid = issues.length === 0 || (job.job_title && job.job_description && job.job_description.length >= 100);
  return { valid, confidence, issues };
}
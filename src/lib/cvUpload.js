import { base44 } from "@/api/base44Client";
import { extractDocxText } from "@/lib/docxExtract";

export const MAX_CV_FILE_SIZE = 10 * 1024 * 1024;
export const CV_FILE_ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const ALLOWED_EXTENSIONS = new Set(["pdf", "docx"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const CANDIDATE_PROFILE_SCHEMA = {
  type: "object",
  properties: {
        full_name: { type: "string" },
        email: { type: "string" },
        telephone: { type: "string" },
        current_location: { type: "string" },
        linkedin_url: { type: "string" },
        right_to_work: {
          type: "string",
          enum: ["UK Citizen", "UK ILR/Settled", "UK Visa Sponsorship Required", "EU Right to Work", "Other"],
        },
        preferred_contact_method: { type: "string", enum: ["Email", "Phone", "LinkedIn"] },
        current_job_title: { type: "string" },
        current_employer: { type: "string" },
        years_total_experience: { type: "number" },
        years_leadership: { type: "number" },
        years_data_governance: { type: "number" },
        current_industry: { type: "string" },
        current_salary: { type: "number" },
        salary_currency: {
          type: "string",
          enum: ["GBP", "EUR", "USD", "NGN", "CAD", "AUD", "CHF"],
        },
        notice_period: { type: "string" },
        notice_period_unit: { type: "string", enum: ["Days", "Weeks", "Months"] },
        current_employment_status: {
          type: "string",
          enum: ["Employed", "Self-employed", "Noticed", "Contract Ending", "Available Immediately", "Unemployed"],
        },
        preferred_job_titles: { type: "array", items: { type: "string" } },
        alternative_job_titles: { type: "array", items: { type: "string" } },
        excluded_job_titles: { type: "array", items: { type: "string" } },
        min_salary: { type: "number" },
        preferred_salary: { type: "number" },
        employment_type_preference: {
          type: "string",
          enum: ["Permanent", "Contract", "Interim", "Open to All"],
        },
        working_pattern_preference: {
          type: "string",
          enum: ["Full-time", "Part-time", "Flexible"],
        },
        preferred_locations: { type: "array", items: { type: "string" } },
        max_commute_distance: { type: "number" },
        work_arrangement_preference: {
          type: "string",
          enum: ["Remote", "Hybrid", "Office", "Open"],
        },
        willing_to_travel: { type: "boolean" },
        willing_to_relocate: { type: "boolean" },
        preferred_industries: { type: "array", items: { type: "string" } },
        excluded_industries: { type: "array", items: { type: "string" } },
        region_preference: { type: "string", enum: ["UK Only", "Europe", "Global Remote"] },
        deal_breakers: { type: "string" },
        executive_profile: { type: "string" },
        career_achievements: { type: "string" },
        leadership_experience: { type: "string" },
        regulatory_experience: { type: "string" },
        transformation_experience: { type: "string" },
        stakeholder_management_experience: { type: "string" },
        team_management_experience: { type: "string" },
        budget_management_experience: { type: "string" },
        skills: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              category: { type: "string" },
              evidence: { type: "string" },
            },
          },
        },
        certifications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              qualification: { type: "string" },
              institution: { type: "string" },
              date_completed: { type: "string" },
              notes: { type: "string" },
            },
          },
        },
        education: {
          type: "array",
          items: {
            type: "object",
            properties: {
              qualification: { type: "string" },
              institution: { type: "string" },
              date_completed: { type: "string" },
              notes: { type: "string" },
            },
          },
        },
        employment_history: {
          type: "array",
          items: {
            type: "object",
            properties: {
              job_title: { type: "string" },
              employer: { type: "string" },
              start_date: { type: "string" },
              end_date: { type: "string" },
              summary: { type: "string" },
            },
          },
        },
  },
};

const CV_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    extracted_cv_text: { type: "string" },
    professional_summary: { type: "string" },
    key_skills: { type: "array", items: { type: "string" } },
    key_achievements: { type: "array", items: { type: "string" } },
    employment_history: { type: "string" },
    education: { type: "string" },
    certifications: { type: "string" },
    candidate_profile: CANDIDATE_PROFILE_SCHEMA,
  },
  required: ["extracted_cv_text"],
};

export async function extractCandidateProfileFromCVText(text) {
  if (!text?.trim()) return {};
  /** @type {any} */
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Extract every candidate-profile field supported by the schema from the CV below. Use only facts explicitly stated in the CV. Do not infer preferences, experience duration, skill proficiency, contact details, industry, salary, right-to-work status or achievements. Leave unknown fields empty. Boolean fields must be omitted unless the CV explicitly states them.\n\nCV TEXT:\n"""${text}"""`,
    response_json_schema: CANDIDATE_PROFILE_SCHEMA,
  });
  return result || {};
}

export function validateCVFile(file) {
  if (!file) return "Choose a PDF or DOCX file.";

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension) || (file.type && !ALLOWED_MIME_TYPES.has(file.type))) {
    return "Only PDF and DOCX files are supported.";
  }
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_CV_FILE_SIZE) return "The file must be 10 MB or smaller.";
  return null;
}

/**
 * @param {File} file
 * @param {(stage: string) => void} [onStageChange]
 */
export async function uploadAndExtractCV(file, onStageChange = () => {}) {
  const validationError = validateCVFile(file);
  if (validationError) throw new Error(validationError);

  const ext = file.name.split(".").pop()?.toLowerCase();

  onStageChange("Uploading document securely");
  const upload = await base44.integrations.Core.UploadPrivateFile({ file });
  if (!upload?.file_uri) throw new Error("The document could not be uploaded. Please try again.");

  let extracted;
  if (ext === "docx") {
    // The platform file extractor does not support DOCX, so we read the document
    // text in the browser and ask the LLM to pull out the structured CV fields.
    onStageChange("Reading CV content");
    const text = await extractDocxText(file);
    if (!text.trim()) throw new Error("No CV text could be read. Check the document and try again.");

    onStageChange("Analysing CV content");
    /** @type {any} */
    const llm = await base44.integrations.Core.InvokeLLM({
      prompt: `Extract the structured CV and every candidate-profile field supported by the schema from the candidate's CV below. Use only facts explicitly stated in the CV. Do not infer preferences, experience duration, proficiency, industry, contact details, salary, right-to-work status or achievements. Leave unknown fields empty. Boolean fields must be omitted unless the CV explicitly states them. Return only the JSON object matching the schema.\n\nCV TEXT:\n"""${text}"""`,
      response_json_schema: CV_EXTRACTION_SCHEMA,
    });
    extracted = { ...llm, extracted_cv_text: text };
  } else {
    onStageChange("Reading CV content");
    const signed = await base44.integrations.Core.CreateFileSignedUrl({
      file_uri: upload.file_uri,
      expires_in: 900,
    });
    if (!signed?.signed_url) throw new Error("The uploaded document could not be opened for processing.");

    /** @type {any} */
    const response = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url: signed.signed_url,
      json_schema: CV_EXTRACTION_SCHEMA,
    });
    // ExtractDataFromUploadedFile returns { status, details, output }; the schema
    // fields live under `output`. Fall back to the top level for safety.
    extracted = response?.output ?? response;
    if (response?.status === "error" || !extracted?.extracted_cv_text?.trim()) {
      throw new Error(
        response?.details || "No CV text could be read. Check the document and try again."
      );
    }
  }

  return {
    file_uri: upload.file_uri,
    file_name: file.name,
    file_type: file.type || file.name.split(".").pop()?.toLowerCase(),
    file_size: file.size,
    processing_status: "Ready",
    processing_error: "",
    extracted_at: new Date().toISOString(),
    extracted_cv_text: extracted.extracted_cv_text.trim(),
    professional_summary: extracted.professional_summary || "",
    key_skills: Array.isArray(extracted.key_skills) ? extracted.key_skills : [],
    key_achievements: Array.isArray(extracted.key_achievements) ? extracted.key_achievements : [],
    employment_history: extracted.employment_history || "",
    education: extracted.education || "",
    certifications: extracted.certifications || "",
    candidate_profile: extracted.candidate_profile || {},
  };
}

export async function createCVDownloadUrl(fileUri) {
  if (!fileUri) throw new Error("No source document is attached to this CV.");
  const result = await base44.integrations.Core.CreateFileSignedUrl({
    file_uri: fileUri,
    expires_in: 300,
  });
  if (!result?.signed_url) throw new Error("The document could not be opened.");
  return result.signed_url;
}

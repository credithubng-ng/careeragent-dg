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
  },
  required: ["extracted_cv_text"],
};

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
    const llm = await base44.integrations.Core.InvokeLLM({
      prompt: `Extract the structured CV fields from the candidate's CV below. Return only the JSON object matching the schema.\n\nCV TEXT:\n"""${text}"""`,
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
import { base44 } from "@/api/base44Client";
import { extractJobFromText } from "./careerAI";
import { extractDocxText } from "./docxExtract";
import {
  mergeExtraction,
  validateJobCoherence,
  assessConfidence,
} from "./jobExtraction";
import { extractTextResponse } from "./aiResponse";

export class RestrictedSourceError extends Error {
  constructor(message, domain, originalUrl) {
    super(message);
    this.name = "RestrictedSourceError";
    this.restrictedSource = true;
    this.domain = domain;
    this.originalUrl = originalUrl;
  }
}

export function validateJobUrl(url) {
  if (!url || typeof url !== "string" || !url.trim()) {
    return "Enter a job URL.";
  }
  try {
    const parsed = new URL(url.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Only http and https URLs are accepted.";
    }
    return null;
  } catch {
    return "The URL is not valid.";
  }
}

export const JOB_URL_EXAMPLES = [
  "https://company.com/jobs/12345",
  "https://careers.company.com/...",
  "https://www.linkedin.com/jobs/view/...",
  "https://jobs.lever.co/...",
  "https://boards.greenhouse.io/...",
  "https://workday...",
];

export const SUPPORTED_SOURCES = [
  "Company Career Sites",
  "Greenhouse",
  "Lever",
  "Workday",
  "SmartRecruiters",
  "NHS Jobs",
  "Civil Service Jobs",
  "Reed",
  "CV Library",
  "TotalJobs",
];

export const PASTE_ONLY_SOURCES = ["LinkedIn", "Indeed", "Glassdoor"];

export const MATCH_PROGRESS_STEPS = [
  "Retrieving job…",
  "Extracting details…",
  "Saving job…",
  "Running AI Match…",
  "Saving match result…",
  "Complete",
];

export const URL_IMPORT_TIMEOUT_MS = 60_000;

export async function importJobFromUrl(url, onProgress) {
  const error = validateJobUrl(url);
  if (error) throw new Error(error);

  const trimmedUrl = url.trim();

  if (onProgress) onProgress("retrieve");
  let pageData;
  try {
    const response = await base44.functions.invoke("fetchJobPage", { url: trimmedUrl });
    pageData = response.data || response;
  } catch (invokeError) {
    const extractedError = invokeError?.response?.data?.error || invokeError?.response?.data;
    throw new Error(
      (typeof extractedError === "string" ? extractedError : extractedError?.error) ||
      invokeError?.message ||
      "Unable to retrieve the job page."
    );
  }

  if (pageData && (pageData.status === "restricted" || pageData.restricted_source)) {
    throw new RestrictedSourceError(
      pageData.message || "This source restricts automatic job retrieval.",
      pageData.domain || "",
      pageData.original_url || trimmedUrl
    );
  }

  if (!pageData || pageData.status === "error" || pageData.error) {
    throw new Error(pageData?.error || "Unable to retrieve the job page.");
  }

  if (typeof pageData.content !== "string" || pageData.content.trim().length < 100) {
    throw new Error("The job page did not contain enough readable vacancy text. Try pasting the advert instead.");
  }

  if (onProgress) onProgress("extract");
  const aiFields = await extractJobFromText(pageData.content);

  // Merge structured JobPosting data (takes priority) with AI-extracted fields
  const structuredData = pageData.structured_data || null;
  const merged = mergeExtraction(aiFields, structuredData);

  // Use the isolated content as the job description (not the raw page text)
  const jobDescription = pageData.content;

  // Run coherence validation against the raw page content
  const { warnings, contaminated } = validateJobCoherence(merged, pageData.raw_content || pageData.content);

  // Assess extraction confidence
  const confidence = assessConfidence(
    pageData.extraction_source,
    merged,
    contaminated
  );

  return {
    ...merged,
    job_description: jobDescription,
    original_job_url: trimmedUrl,
    page_title: pageData.page_title || "",
    final_url: pageData.final_url || trimmedUrl,
    _extractionMeta: {
      source: pageData.extraction_source || "generic_text",
      adapterUsed: pageData.adapter_used || null,
      confidence,
      contaminated,
      coherenceWarnings: warnings,
      relatedJobsDetected: pageData.related_jobs_detected || 0,
      sectionsIgnored: pageData.sections_ignored || 0,
      multipleJobpostings: pageData.multiple_jobpostings || false,
      jobpostingCount: pageData.jobposting_count || 0,
      rawContent: pageData.raw_content || "",
    },
  };
}

const PDF_TEXT_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
  },
};

export function validateJobFile(file) {
  if (!file) return "Choose a PDF or DOCX file.";
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["pdf", "docx"].includes(ext)) {
    return "Only PDF and DOCX files are supported.";
  }
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > 10 * 1024 * 1024) return "The file must be 10 MB or smaller.";
  return null;
}

export async function importJobFromPdf(file, onProgress) {
  const validationError = validateJobFile(file);
  if (validationError) throw new Error(validationError);

  const ext = file.name.split(".").pop()?.toLowerCase();

  let rawText = "";

  if (ext === "docx") {
    if (onProgress) onProgress("extract");
    rawText = await extractDocxText(file);
    if (!rawText?.trim()) {
      throw new Error("No text could be read from this document.");
    }
  } else {
    if (onProgress) onProgress("upload");
    const upload = await base44.integrations.Core.UploadFile({ file });
    if (!upload?.file_url) throw new Error("The document could not be uploaded.");

    if (onProgress) onProgress("extract");
    const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url: upload.file_url,
      json_schema: PDF_TEXT_SCHEMA,
    });
    rawText = extractTextResponse(extracted);
    if (!rawText?.trim()) {
      throw new Error("No text could be read from this PDF. Try pasting the job description instead.");
    }
  }

  if (rawText.length > 15000) rawText = rawText.slice(0, 15000);

  if (onProgress) onProgress("ai");
  const jobData = await extractJobFromText(rawText);

  return {
    ...jobData,
    job_description: rawText,
  };
}

const KEY_EXTRACTION_FIELDS = [
  "job_title",
  "employer",
  "recruitment_agency",
  "location",
  "salary_min",
  "salary_max",
  "closing_date",
  "employment_type",
  "work_arrangement",
  "job_description",
  "essential_requirements",
];

export function computeExtractionStatus(review) {
  if (!review) return "Manual";
  const filled = KEY_EXTRACTION_FIELDS.filter((field) => {
    const value = review[field];
    return value != null && String(value).trim() !== "";
  }).length;
  if (filled === KEY_EXTRACTION_FIELDS.length) return "Success";
  if (filled <= 2) return "Partial";
  return "Partial";
}

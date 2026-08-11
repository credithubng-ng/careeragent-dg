import { base44 } from "@/api/base44Client";

export const INLINE_JOB_DESCRIPTION_LIMIT = 12_000;

export function jobDescriptionPreview(value, limit = INLINE_JOB_DESCRIPTION_LIMIT) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}\n\n[Full description stored in the attached text file]`;
}

export async function prepareJobDescriptionForStorage(job = {}) {
  const fullText = String(job.job_description || "").trim();
  const characterCount = fullText.length;

  if (characterCount <= INLINE_JOB_DESCRIPTION_LIMIT) {
    return {
      storedJob: {
        ...job,
        job_description: fullText,
        job_description_file_url: "",
        job_description_character_count: characterCount,
        job_description_truncated: false,
      },
      fullText,
    };
  }

  const file = new File(
    [fullText],
    `job-description-${Date.now()}.txt`,
    { type: "text/plain;charset=utf-8" }
  );
  const uploaded = await base44.integrations.Core.UploadFile({ file });
  if (!uploaded?.file_url) {
    throw new Error("The full job description could not be uploaded. Please try again.");
  }

  return {
    storedJob: {
      ...job,
      job_description: jobDescriptionPreview(fullText),
      job_description_file_url: uploaded.file_url,
      job_description_character_count: characterCount,
      job_description_truncated: true,
    },
    fullText,
  };
}

export async function hydrateJobDescription(job = {}) {
  if (!job.job_description_file_url) return job;
  try {
    const response = await fetch(job.job_description_file_url);
    if (!response.ok) return job;
    const fullText = (await response.text()).trim();
    return fullText ? { ...job, job_description: fullText } : job;
  } catch {
    return job;
  }
}

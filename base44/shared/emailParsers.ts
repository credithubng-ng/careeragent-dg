/**
 * Email parsing utilities for the Email Intake Agent.
 * Identifies email sources, extracts email body text, and uses AI
 * to extract individual vacancies from job-alert emails.
 */

export const KNOWN_SOURCE_DEFAULTS = [
  { source_name: "Indeed", sender_domain: "indeed.com", subject_pattern: "job alert", parser_type: "Indeed" },
  { source_name: "Totaljobs", sender_domain: "totaljobs.com", subject_pattern: "job alert", parser_type: "Totaljobs" },
  { source_name: "Civil Service Jobs", sender_domain: "civijobs.com", subject_pattern: "job alert", parser_type: "CivilServiceJobs" },
  { source_name: "Adzuna", sender_domain: "adzuna.com", subject_pattern: "job alert", parser_type: "Adzuna" },
  { source_name: "Reed", sender_domain: "reed.co.uk", subject_pattern: "job alert", parser_type: "Reed" },
  { source_name: "CV-Library", sender_domain: "cv-library.co.uk", subject_pattern: "job alert", parser_type: "CVLibrary" },
  { source_name: "LinkedIn Job Alerts", sender_domain: "linkedin.com", subject_pattern: "job alert", parser_type: "LinkedIn" },
  { source_name: "NHS Jobs", sender_domain: "nhs.uk", subject_pattern: "job alert", parser_type: "NHSJobs" },
  { source_name: "JobSwipe", sender_domain: "jobswipe.com", subject_pattern: "job alert", parser_type: "JobSwipe" },
  { source_name: "ExecThread", sender_domain: "execthread.com", subject_pattern: "job alert", parser_type: "ExecThread" },
];

/**
 * Identify the email source from sender, subject, and configured EmailSource records.
 */
export function identifyEmailSource(sender: string, subject: string, emailSources: any[]): { sourceName: string; parserType: string } {
  const senderLower = (sender || "").toLowerCase();
  const subjectLower = (subject || "").toLowerCase();

  // Check configured EmailSource records first
  for (const src of emailSources || []) {
    if (!src.active_status) continue;
    const domain = (src.sender_domain || "").toLowerCase();
    const email = (src.sender_email || "").toLowerCase();
    const pattern = (src.subject_pattern || "").toLowerCase();

    const domainMatch = domain && (senderLower.includes("@" + domain) || senderLower.includes(domain));
    const emailMatch = email && senderLower.includes(email);
    const patternMatch = pattern && subjectLower.includes(pattern);

    if ((domainMatch || emailMatch) && (!pattern || patternMatch)) {
      return { sourceName: src.source_name, parserType: src.parser_type || "Generic" };
    }
    if (domainMatch && patternMatch) {
      return { sourceName: src.source_name, parserType: src.parser_type || "Generic" };
    }
  }

  // Fall back to built-in defaults
  for (const src of KNOWN_SOURCE_DEFAULTS) {
    const domain = src.sender_domain.toLowerCase();
    if (senderLower.includes("@" + domain) || senderLower.includes(domain)) {
      return { sourceName: src.source_name, parserType: src.parser_type };
    }
  }

  return { sourceName: "Generic", parserType: "Generic" };
}

/**
 * Extract plain-text body from a Gmail message payload.
 * Prefers text/plain, falls back to text/html stripped of tags.
 */
export function extractEmailBody(payload: any): string {
  if (!payload) return "";

  // Simple (non-multipart) message
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data, payload.mimeType);
  }

  // Multipart message — find text/plain part
  const parts = payload.parts || [];
  let textPart = parts.find((p: any) => p.mimeType === "text/plain" && p.body?.data);
  if (textPart) {
    return decodeBase64Url(textPart.body.data, "text/plain");
  }

  // Fall back to text/html
  let htmlPart = parts.find((p: any) => p.mimeType === "text/html" && p.body?.data);
  if (htmlPart) {
    return stripHtml(decodeBase64Url(htmlPart.body.data, "text/html"));
  }

  // Recursive search in nested parts
  for (const part of parts) {
    if (part.parts) {
      const nested = extractEmailBody(part);
      if (nested) return nested;
    }
  }

  return "";
}

function decodeBase64Url(data: string, mimeType: string): string {
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64);
    if (mimeType === "text/html") return stripHtml(decoded);
    return decoded;
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract the sender email address from a Gmail message header.
 */
export function extractSender(headers: any[]): string {
  const fromHeader = headers.find((h: any) => h.name.toLowerCase() === "from");
  if (!fromHeader) return "";
  const match = fromHeader.value.match(/<([^>]+)>/);
  return match ? match[1] : fromHeader.value;
}

/**
 * Extract a header value by name from Gmail message headers.
 */
export function extractHeader(headers: any[], name: string): string {
  const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : "";
}

/**
 * Normalize a job URL for duplicate detection.
 * Strips tracking parameters and normalizes the domain.
 */
export function normalizeJobUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    // Remove common tracking params
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "source", "campaign_id"];
    trackingParams.forEach((p) => u.searchParams.delete(p));
    // Normalize: remove trailing slash, lowercase host
    let normalized = u.protocol + "//" + u.hostname.toLowerCase().replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
    if (u.search) normalized += u.search;
    return normalized;
  } catch {
    return url;
  }
}

/**
 * Extract a source-specific job ID from a URL.
 */
export function extractSourceJobId(url: string, sourceName: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const source = sourceName.toLowerCase();

    if (source.includes("indeed")) {
      const jk = u.searchParams.get("jk") || u.searchParams.get("id");
      if (jk) return "indeed:" + jk;
    }
    if (source.includes("totaljobs")) {
      const id = u.pathname.match(/\/jobs\/(\d+)/);
      if (id) return "totaljobs:" + id[1];
    }
    if (source.includes("reed")) {
      const id = u.pathname.match(/\/jobs\/(\d+)/);
      if (id) return "reed:" + id[1];
    }
    if (source.includes("cv-library")) {
      const id = u.pathname.match(/\/jobs\/(\d+)/);
      if (id) return "cvlibrary:" + id[1];
    }
    if (source.includes("linkedin")) {
      const id = u.pathname.match(/\/jobs\/view\/(\d+)/);
      if (id) return "linkedin:" + id[1];
    }
    if (source.includes("adzuna")) {
      const id = u.pathname.match(/\/p\/(\d+)/);
      if (id) return "adzuna:" + id[1];
    }
    if (source.includes("nhs")) {
      const id = u.pathname.match(/\/job\/(\d+)/);
      if (id) return "nhs:" + id[1];
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Use AI to extract individual vacancies from a job-alert email.
 * Returns an array of vacancy objects.
 */
export async function extractVacanciesFromEmail(
  subject: string,
  bodyText: string,
  sourceName: string,
  invokeLLM: (params: any) => Promise<any>
): Promise<any[]> {
  if (!bodyText || bodyText.trim().length < 50) return [];

  // Truncate very long emails to avoid token limits
  const truncatedBody = bodyText.slice(0, 12000);

  const res = await invokeLLM({
    prompt: `You are a job-alert email parser for UK Data Governance roles. The text below is the content of a job-alert email from ${sourceName}. Extract EACH individual vacancy as a separate object — do not combine multiple vacancies into one record. For each vacancy, extract only what is stated in the email. Leave unknown fields empty ("") or 0. Parse salary ranges into numeric min/max (GBP). Use YYYY-MM-DD for dates. Set work_arrangement and employment_type only to the schema values or empty. Extract the source-specific job ID from the URL where possible (e.g., Indeed "jk" param, LinkedIn job ID in path). If the email contains no job vacancies, return an empty array.

EMAIL SUBJECT: ${subject}

EMAIL BODY:
${truncatedBody}`,
    response_json_schema: {
      type: "object",
      properties: {
        vacancies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              job_title: { type: "string" },
              employer: { type: "string" },
              location: { type: "string" },
              salary_min: { type: "number" },
              salary_max: { type: "number" },
              salary_description: { type: "string" },
              job_url: { type: "string" },
              summary: { type: "string" },
              closing_date: { type: "string" },
              job_reference: { type: "string" },
              work_arrangement: { type: "string", enum: ["", "Remote", "Hybrid", "Office", "Unspecified"] },
              employment_type: { type: "string", enum: ["", "Permanent", "Contract", "Interim", "Fixed Term", "Part-time"] },
              source_job_id: { type: "string" },
            },
          },
        },
      },
      required: ["vacancies"],
    },
  });

  return res?.vacancies || [];
}
// Cross-source duplicate detection for Job records.
// Compares canonical URL, original URL, job reference, employer, job title, location,
// job description similarity, and closing date to identify duplicate vacancies.

export interface DuplicateMatch {
  existingJobId: string;
  confidence: "High" | "Medium" | "Low";
  matchedFields: string[];
  existingJob: any;
}

function normalise(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normaliseUrl(url: string): string {
  try {
    const u = new URL(String(url || ""));
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return normalise(url);
  }
}

function titleSimilarity(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const tokensA = new Set(na.split(" "));
  const tokensB = new Set(nb.split(" "));
  let shared = 0;
  tokensA.forEach((t) => { if (tokensB.has(t)) shared++; });
  return (2 * shared) / (tokensA.size + tokensB.size);
}

function descriptionSimilarity(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return 0;
  if (na.length < 50 || nb.length < 50) return 0;
  const tokensA = na.match(/[a-z0-9]+/g) || [];
  const tokensB = nb.match(/[a-z0-9]+/g) || [];
  if (tokensA.length < 10 || tokensB.length < 10) return 0;
  const setA = new Map<string, number>();
  tokensA.forEach((t) => setA.set(t, (setA.get(t) || 0) + 1));
  const setB = new Map<string, number>();
  tokensB.forEach((t) => setB.set(t, (setB.get(t) || 0) + 1));
  let shared = 0;
  setA.forEach((count, token) => { shared += Math.min(count, setB.get(token) || 0); });
  return (2 * shared) / (tokensA.length + tokensB.length);
}

/**
 * Check a candidate job against a list of existing jobs for duplicates.
 * Returns the best match if confidence is Medium or High, otherwise null.
 */
export function findDuplicate(
  candidate: any,
  existingJobs: any[]
): DuplicateMatch | null {
  let bestMatch: DuplicateMatch | null = null;
  let bestScore = 0;

  for (const existing of existingJobs) {
    const matchedFields: string[] = [];
    let score = 0;

    // Canonical URL match — strongest signal
    if (candidate.canonical_job_url && existing.canonical_job_url) {
      if (normaliseUrl(candidate.canonical_job_url) === normaliseUrl(existing.canonical_job_url)) {
        matchedFields.push("Canonical URL");
        score += 40;
      }
    }

    // Original URL match
    if (candidate.original_job_url && existing.original_job_url) {
      if (normaliseUrl(candidate.original_job_url) === normaliseUrl(existing.original_job_url)) {
        matchedFields.push("Original URL");
        score += 30;
      }
    }

    // Job reference match
    if (candidate.job_reference && existing.job_reference) {
      if (normalise(candidate.job_reference) === normalise(existing.job_reference)) {
        matchedFields.push("Job Reference");
        score += 35;
      }
    }

    // Employer + Job Title + Location combination
    const employerMatch = candidate.employer && existing.employer &&
      normalise(candidate.employer) === normalise(existing.employer);
    const titleSim = titleSimilarity(candidate.job_title || "", existing.job_title || "");
    const locationMatch = candidate.location && existing.location &&
      normalise(candidate.location) === normalise(existing.location);

    if (employerMatch && titleSim >= 0.85 && locationMatch) {
      matchedFields.push("Employer + Title + Location");
      score += 35;
    } else if (employerMatch && titleSim >= 0.95) {
      matchedFields.push("Employer + Title");
      score += 20;
    }

    // Job description similarity
    const descSim = descriptionSimilarity(
      candidate.job_description || candidate.role_summary || "",
      existing.job_description || existing.role_summary || ""
    );
    if (descSim >= 0.75) {
      matchedFields.push("Description Similarity");
      score += 25;
    }

    // Closing date match (supplementary)
    if (candidate.closing_date && existing.closing_date &&
        candidate.closing_date === existing.closing_date && employerMatch) {
      matchedFields.push("Closing Date");
      score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      const confidence: "High" | "Medium" | "Low" =
        score >= 60 ? "High" : score >= 35 ? "Medium" : "Low";
      if (confidence !== "Low") {
        bestMatch = {
          existingJobId: existing.id,
          confidence,
          matchedFields,
          existingJob: existing,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Merge source references from a duplicate into the existing job's additional_sources.
 */
export function mergeSourceReferences(existing: any, duplicate: any): string[] {
  const sources = new Set<string>(existing.additional_sources || []);
  if (duplicate.original_job_url) sources.add(duplicate.original_job_url);
  if (duplicate.job_source_name) sources.add(duplicate.job_source_name);
  if (duplicate.email_source) sources.add(duplicate.email_source);
  return Array.from(sources);
}
function parseJsonText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    return null;
  }
}

/**
 * Base44 integrations may return structured output directly or inside a
 * data/output/result envelope. Normalise those variants in one place so the
 * import and matching workflows fail clearly instead of saving malformed data.
 */
export function unwrapAIObject(response) {
  let current = response;

  for (let depth = 0; depth < 4; depth += 1) {
    const parsed = parseJsonText(current);
    if (parsed) {
      current = parsed;
      continue;
    }

    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    const envelopeKey = ["data", "output", "result"].find(
      (key) => current[key] != null && (typeof current[key] === "object" || typeof current[key] === "string")
    );
    if (!envelopeKey) return current;
    current = current[envelopeKey];
  }

  return current && typeof current === "object" && !Array.isArray(current)
    ? current
    : null;
}

export function requireAIObject(response, purpose = "request") {
  const value = unwrapAIObject(response);
  if (!value) {
    throw new Error(`The AI returned an unreadable response for this ${purpose}. Please try again.`);
  }
  return value;
}

export function requireJobExtraction(response) {
  const value = requireAIObject(response, "job extraction");
  const hasUsefulField = [
    "job_title",
    "employer",
    "job_description",
    "responsibilities",
    "essential_requirements",
  ].some((field) => typeof value[field] === "string" && value[field].trim());

  if (!hasUsefulField) {
    throw new Error("The AI could not identify a job in that content. Check the advert and try again.");
  }
  return value;
}

export function extractTextResponse(response) {
  const value = unwrapAIObject(response);
  if (typeof response === "string") return response.trim();
  if (!value) return "";

  for (const field of ["text", "content"]) {
    if (typeof value[field] === "string" && value[field].trim()) {
      return value[field].trim();
    }
  }
  return "";
}

export function requireMatchResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error("The match assessment was incomplete. Please run it again.");
  }

  const score = Number(result.total_score);
  if (!Number.isFinite(score) || score < 0 || score > 100 || !result.recommendation) {
    throw new Error("The match assessment did not contain a valid score and recommendation. Please run it again.");
  }

  return { ...result, total_score: score };
}

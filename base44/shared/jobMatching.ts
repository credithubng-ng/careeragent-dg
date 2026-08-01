// Shared job matching logic — usable in both frontend (careerAI.js) and backend (processGmailAlerts).
// The invokeLLM parameter abstracts the difference between frontend and backend SDK calls.
import { getCoachingInstruction, getPersonaConfig } from "./persona.ts";

export const DEFAULT_WEIGHTS = {
  weight_experience: 25,
  weight_essential_skills: 20,
  weight_seniority_leadership: 15,
  weight_sector: 10,
  weight_responsibilities: 10,
  weight_location: 8,
  weight_salary: 7,
  weight_qualifications: 5,
};

export const DEFAULT_HARD_STOPS = [
  "You do not have the required right to work",
  "Mandatory security clearance cannot be obtained",
  "Salary is materially below your minimum",
  "Location is outside your accepted area and remote work is unavailable",
  "Role is primarily technical data engineering rather than Data Governance",
  "Role requires a mandatory qualification you do not possess",
  "Job is expired",
];

const SCORING_CATEGORIES = Object.keys(DEFAULT_WEIGHTS);
const EVIDENCE_SIMILARITY_THRESHOLD = 0.72;

// Material questions that prevent an "Excellent Match" classification
const MATERIAL_QUESTIONS = [
  "right to work", "work authorisation", "visa", "sponsorship",
  "security clearance", "clearance", "language requirement",
  "mandatory qualification", "relocation", "relocate",
  "essential skill", "core responsibility", "expired",
];

export function recommendationBand(score: number): string | null {
  if (score == null) return null;
  if (score >= 90) return "Excellent Match";
  if (score >= 80) return "Good Match";
  if (score >= 70) return "Worth Reviewing";
  if (score >= 50) return "Possible Match";
  return "Poor Match";
}

export function getUsableCVs(cvs: any[]): any[] {
  return (cvs || []).filter(
    (cv: any) => cv.processing_status === "Ready" && cv.extracted_cv_text?.trim()
  );
}

function buildCandidateContextData(candidate: any, cvs: any[]) {
  const readyCVs = getUsableCVs(cvs);
  const master = readyCVs.find((cv: any) => cv.is_master) || readyCVs[0];
  return {
    profile: {
      full_name: candidate?.full_name,
      current_job_title: candidate?.current_job_title,
      years_total_experience: candidate?.years_total_experience,
      years_leadership: candidate?.years_leadership,
      years_data_governance: candidate?.years_data_governance,
      current_industry: candidate?.current_industry,
      right_to_work: candidate?.right_to_work,
      salary_currency: candidate?.salary_currency,
      min_salary: candidate?.min_salary,
      preferred_salary: candidate?.preferred_salary,
      employment_type_preference: candidate?.employment_type_preference,
      work_arrangement_preference: candidate?.work_arrangement_preference,
      preferred_locations: candidate?.preferred_locations,
      preferred_industries: candidate?.preferred_industries,
      excluded_industries: candidate?.excluded_industries,
      region_preference: candidate?.region_preference,
      preferred_job_titles: candidate?.preferred_job_titles,
      excluded_job_titles: candidate?.excluded_job_titles,
      deal_breakers: candidate?.deal_breakers,
      executive_profile: candidate?.executive_profile,
      career_achievements: candidate?.career_achievements,
      leadership_experience: candidate?.leadership_experience,
      regulatory_experience: candidate?.regulatory_experience,
      transformation_experience: candidate?.transformation_experience,
      stakeholder_management_experience: candidate?.stakeholder_management_experience,
      team_management_experience: candidate?.team_management_experience,
      budget_management_experience: candidate?.budget_management_experience,
      skills: candidate?.skills,
      certifications: candidate?.certifications,
      education: candidate?.education,
    },
    master_cv: {
      name: master?.cv_name || "",
      type: master?.cv_type || "",
      text: master?.extracted_cv_text || "",
    },
  };
}

function normaliseEvidence(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[""'']/g, "'")
    .replace(/[^a-z0-9£%+.'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceTokens(value: string): string[] {
  return normaliseEvidence(value).match(/[a-z0-9£%+]+(?:['.-][a-z0-9£%+]+)*/g) || [];
}

function tokenOverlap(left: string[], right: string[]): number {
  const leftCounts = new Map();
  const rightCounts = new Map();
  left.forEach((token) => leftCounts.set(token, (leftCounts.get(token) || 0) + 1));
  right.forEach((token) => rightCounts.set(token, (rightCounts.get(token) || 0) + 1));
  let shared = 0;
  leftCounts.forEach((count, token) => {
    shared += Math.min(count, rightCounts.get(token) || 0);
  });
  return shared;
}

function hasGroundedEvidence(evidence: string, sourceText: string): boolean {
  const normalisedEvidence = normaliseEvidence(evidence);
  const normalisedSource = normaliseEvidence(sourceText);
  if (!normalisedEvidence || !normalisedSource) return false;
  if (normalisedSource.includes(normalisedEvidence)) return true;

  const expected = evidenceTokens(normalisedEvidence);
  const source = evidenceTokens(normalisedSource);
  if (expected.length < 4 || source.length < expected.length) return false;

  const minimumWindow = Math.max(4, expected.length - 2);
  const maximumWindow = Math.min(source.length, expected.length + 2);
  for (let size = minimumWindow; size <= maximumWindow; size += 1) {
    for (let start = 0; start <= source.length - size; start += 1) {
      const candidate = source.slice(start, start + size);
      const shared = tokenOverlap(expected, candidate);
      const evidenceCoverage = shared / expected.length;
      const similarity = (2 * shared) / (expected.length + candidate.length);
      if (evidenceCoverage >= 0.75 && similarity >= EVIDENCE_SIMILARITY_THRESHOLD) {
        return true;
      }
    }
  }
  return false;
}

function verifyEvidenceItems(items: any[], contextData: any) {
  const profileText = JSON.stringify(contextData.profile);
  const cvText = contextData.master_cv.text;
  const verified: string[] = [];
  const rejected: string[] = [];
  const verifiedCategories = new Set<string>();
  const partiallyVerifiedCategories = new Set<string>();

  for (const item of Array.isArray(items) ? items : []) {
    const claim = String(item?.claim || "").trim();
    const evidence = String(item?.evidence || "").trim();
    const matchType = String(item?.match_type || "strong"); // strong, partial, transferable
    const preferredSource = item?.source === "Master CV" ? "Master CV" : "Candidate Profile";
    const category = SCORING_CATEGORIES.includes(item?.category) ? item.category : "";
    const sources = preferredSource === "Master CV"
      ? [["Master CV", cvText], ["Candidate Profile", profileText]]
      : [["Candidate Profile", profileText], ["Master CV", cvText]];
    const verifiedSource = sources.find(([, sourceText]) =>
      hasGroundedEvidence(evidence, sourceText)
    )?.[0];

    if (claim && evidence.length >= 4 && verifiedSource) {
      verified.push(`${claim} — Evidence: "${evidence}" (${verifiedSource})`);
      if (category) {
        verifiedCategories.add(category);
        if (matchType === "partial" || matchType === "transferable") {
          partiallyVerifiedCategories.add(category);
        }
      }
    } else if (claim) {
      rejected.push(claim);
    }
  }

  return { verified, rejected, verifiedCategories, partiallyVerifiedCategories };
}

function matchEvidenceSchema() {
  return {
    type: "array",
    items: {
      type: "object",
      properties: {
        claim: { type: "string" },
        evidence: { type: "string" },
        source: { type: "string", enum: ["Candidate Profile", "Master CV"] },
        category: { type: "string", enum: SCORING_CATEGORIES },
        match_type: { type: "string", enum: ["strong", "partial", "transferable"] },
      },
      required: ["claim", "evidence", "source", "category"],
    },
  };
}

function resolveScoringWeights(scoring: any) {
  const configured: Record<string, number> = Object.fromEntries(
    Object.keys(DEFAULT_WEIGHTS).map((key) => {
      const value = Number(scoring?.[key]);
      return [key, Number.isFinite(value) && value >= 0 ? value : DEFAULT_WEIGHTS[key]];
    })
  );
  const total = Object.values(configured).reduce((sum, value) => sum + value, 0);
  if (!total) return DEFAULT_WEIGHTS;
  return Object.fromEntries(
    Object.entries(configured).map(([key, value]) => [key, Math.round((value / total) * 1000) / 10])
  );
}

// ─── Category status determination ───

type CategoryStatus = "Verified" | "Partially Verified" | "Gap" | "Requirement Not Stated" | "Insufficient Job Information" | "Not Applicable";

function determineCategoryStatus(
  category: string,
  llmAnalysis: any,
  verifiedCategories: Set<string>,
  partiallyVerifiedCategories: Set<string>,
  jobContentStatus: string
): { status: CategoryStatus; score: number; maximum: number; requirement: string; explanation: string; pointsWithheldReason: string; unresolvedQuestion: string } {
  const maximum = Number(DEFAULT_WEIGHTS[category]) || 0;
  const requirement = String(llmAnalysis?.requirement || "");
  const requirementStated = llmAnalysis?.requirement_stated !== false;
  const llmStatus = String(llmAnalysis?.preliminary_status || "");
  const explanation = String(llmAnalysis?.explanation || "");
  const pointsWithheldReason = String(llmAnalysis?.points_withheld_reason || "");
  const unresolvedQuestion = String(llmAnalysis?.unresolved_question || "");
  const llmPoints = Number(llmAnalysis?.awarded_points) || 0;

  // If the job content is incomplete and the LLM couldn't assess this category
  if (llmStatus === "Insufficient Job Information" || (jobContentStatus !== "Complete" && !requirementStated && !llmStatus)) {
    return { status: "Insufficient Job Information", score: 0, maximum, requirement, explanation: explanation || "The extracted vacancy is too incomplete to determine the requirement in this category.", pointsWithheldReason: "", unresolvedQuestion };
  }

  // If the LLM says Not Applicable, respect it (with the explanation)
  if (llmStatus === "Not Applicable") {
    return { status: "Not Applicable", score: 0, maximum: 0, requirement: "", explanation: explanation || "This category does not apply to this vacancy.", pointsWithheldReason: "", unresolvedQuestion };
  }

  // If the job doesn't state a requirement in this category
  if (!requirementStated || llmStatus === "Requirement Not Stated") {
    return { status: "Requirement Not Stated", score: 0, maximum, requirement: "", explanation: "The vacancy does not state a requirement in this category.", pointsWithheldReason: "", unresolvedQuestion: "" };
  }

  // If the requirement is stated, check for verified evidence
  const hasVerified = verifiedCategories.has(category);
  const hasPartial = partiallyVerifiedCategories.has(category);

  if (hasVerified && !hasPartial) {
    // Fully verified — use LLM points capped at maximum
    const score = Math.min(maximum, Math.max(0, llmPoints));
    return { status: "Verified", score: Math.round(score * 10) / 10, maximum, requirement, explanation, pointsWithheldReason, unresolvedQuestion };
  }

  if (hasVerified && hasPartial) {
    // Partially verified — some evidence but not all
    const score = Math.min(maximum, Math.max(0, llmPoints * 0.7));
    return { status: "Partially Verified", score: Math.round(score * 10) / 10, maximum, requirement, explanation, pointsWithheldReason: unresolvedQuestion || "Some requirements supported by verified evidence, others not.", unresolvedQuestion };
  }

  // Requirement stated but no verified evidence → Gap
  return { status: "Gap", score: 0, maximum, requirement, explanation: explanation || "The requirement is clear but you lack verified evidence.", pointsWithheldReason: "No verified evidence for this requirement.", unresolvedQuestion };
}

function normaliseMatchResult(
  result: any,
  contextData: any,
  weights: any,
  jobContentStatus: string
) {
  const strong = verifyEvidenceItems(
    (result?.strong_matches || []).map((m: any) => ({ ...m, match_type: "strong" })),
    contextData
  );
  const partial = verifyEvidenceItems(
    (result?.partial_matches || []).map((m: any) => ({ ...m, match_type: "partial" })),
    contextData
  );
  const transferable = verifyEvidenceItems(
    (result?.transferable_matches || []).map((m: any) => ({ ...m, match_type: "transferable" })),
    contextData
  );
  const verifiedCategories = new Set([
    ...strong.verifiedCategories,
    ...partial.verifiedCategories,
    ...transferable.verifiedCategories,
  ]);
  const partiallyVerifiedCategories = new Set([
    ...partial.partiallyVerifiedCategories,
    ...transferable.partiallyVerifiedCategories,
  ]);
  const rejected = [...strong.rejected, ...partial.rejected, ...transferable.rejected];
  const questions = Array.isArray(result?.questions) ? result.questions : [];
  const hardStops = Array.isArray(result?.hard_stops) ? result.hard_stops : [];
  const hasHardStop = hardStops.length > 0;

  // Build per-category analysis
  const llmCategoryAnalysis = Array.isArray(result?.category_analysis) ? result.category_analysis : [];
  const categoryAnalysisMap = new Map<string, any>();
  for (const ca of llmCategoryAnalysis) {
    if (ca?.category && SCORING_CATEGORIES.includes(ca.category)) {
      categoryAnalysisMap.set(ca.category, ca);
    }
  }

  const breakdown: Record<string, any> = {};
  const categoryAnalysis: Record<string, any> = {};
  let awardedPoints = 0;
  let denominatorWeight = 0;
  let assessedCategories = 0;
  let totalCategories = SCORING_CATEGORIES.length;

  for (const category of SCORING_CATEGORIES) {
    const llmAnalysis = categoryAnalysisMap.get(category) || {};
    const { status, score, maximum, requirement, explanation, pointsWithheldReason, unresolvedQuestion } =
      determineCategoryStatus(category, llmAnalysis, verifiedCategories, partiallyVerifiedCategories, jobContentStatus);

    breakdown[category] = { score, maximum, status };
    categoryAnalysis[category] = {
      requirement,
      status,
      score,
      maximum: maximum,
      explanation,
      points_withheld_reason: pointsWithheldReason,
      unresolved_question: unresolvedQuestion,
      evidence_source: verifiedCategories.has(category) ? "Candidate Profile / Master CV" : "",
    };

    awardedPoints += score;

    // Denominator: exclude "Requirement Not Stated" and "Not Applicable"
    if (status !== "Requirement Not Stated" && status !== "Not Applicable") {
      denominatorWeight += maximum;
    }

    // Coverage: categories with a definitive status
    if (status !== "Insufficient Job Information") {
      assessedCategories++;
    }
  }

  // Calculate total score using the full model
  const totalScore = denominatorWeight > 0
    ? Math.round((awardedPoints / denominatorWeight) * 100)
    : 0;

  // Calculate coverage
  const coverage = Math.round((assessedCategories / totalCategories) * 100);

  // Check for unresolved material questions
  const allQuestions = [...questions, ...rejected.map((claim) => `Unverified AI claim — confirm before use: ${claim}`)];
  const hasMaterialQuestions = allQuestions.some((q) => {
    const lower = q.toLowerCase();
    return MATERIAL_QUESTIONS.some((mq) => lower.includes(mq));
  });

  // Determine assessment status
  let assessmentStatus: string;
  if (hasHardStop) {
    assessmentStatus = "Needs Review";
  } else if (jobContentStatus === "Restricted Source") {
    assessmentStatus = "Restricted Source";
  } else if (jobContentStatus !== "Complete") {
    assessmentStatus = "Preliminary";
  } else if (coverage < 75) {
    assessmentStatus = "Preliminary";
  } else {
    // Check required categories for Final
    const essentialSkillsStatus = breakdown.weight_essential_skills?.status;
    const responsibilitiesStatus = breakdown.weight_responsibilities?.status;
    const locationStatus = breakdown.weight_location?.status;
    const requiredAssessed = essentialSkillsStatus && essentialSkillsStatus !== "Insufficient Job Information"
      && responsibilitiesStatus && responsibilitiesStatus !== "Insufficient Job Information"
      && locationStatus && locationStatus !== "Insufficient Job Information";

    if (requiredAssessed && !hasMaterialQuestions) {
      assessmentStatus = "Final";
    } else {
      assessmentStatus = "Preliminary";
    }
  }

  // Apply score caps
  let finalScore = totalScore;
  let recommendation: string;

  if (hasHardStop) {
    recommendation = "Reject";
  } else if (assessmentStatus === "Preliminary" || hasMaterialQuestions) {
    // Cap at 79 — cannot be "Excellent Match"
    finalScore = Math.min(finalScore, 79);
    recommendation = recommendationBand(finalScore) || "Do Not Apply";
  } else {
    recommendation = recommendationBand(finalScore) || "Do Not Apply";
  }

  // Verified fit: points from Verified categories only
  const verifiedFit = Math.round(
    Object.values(breakdown)
      .filter((b: any) => b.status === "Verified")
      .reduce((sum: number, b: any) => sum + b.score, 0)
  );

  return {
    total_score: finalScore,
    verified_fit: verifiedFit,
    assessment_coverage: coverage,
    assessment_status: assessmentStatus,
    recommendation,
    confidence: !assessedCategories
      ? "Insufficient evidence"
      : rejected.length
        ? "Low"
        : String(result?.confidence || "Medium"),
    strong_reasons: strong.verified,
    partial_reasons: partial.verified,
    transferable_strengths: transferable.verified,
    missing_requirements: Array.isArray(result?.missing_requirements) ? result.missing_requirements : [],
    concerns: Array.isArray(result?.concerns) ? result.concerns : [],
    questions: allQuestions,
    hard_stops: hardStops,
    suggested_cv: String(result?.suggested_cv || contextData.master_cv.name || ""),
    application_priority: String(result?.application_priority || ""),
    suggested_deadline: String(result?.suggested_deadline || ""),
    recommended_action: assessmentStatus === "Preliminary"
      ? "This is a preliminary review because the available job information is incomplete. A final assessment requires the full vacancy details."
      : assessmentStatus === "Restricted Source"
        ? "This is a restricted-source review. Full vacancy content is required for a final assessment."
        : String(result?.recommended_action || ""),
    breakdown,
    category_analysis: categoryAnalysis,
  };
}

/**
 * Run AI job matching. Works in both frontend and backend.
 * @param invokeLLM - Function that calls InvokeLLM
 * @param jobContentStatus - The content quality status of the job
 */
export async function runJobMatch(
  job: any,
  candidate: any,
  cvs: any[],
  scoring: any,
  invokeLLM: (params: any) => Promise<any>,
  jobContentStatus: string = "Complete"
): Promise<any> {
  const contextData = buildCandidateContextData(candidate, cvs);
  const ctx = JSON.stringify(contextData, null, 2);
  const weights = resolveScoringWeights(scoring);

  const res = await invokeLLM({
    prompt: `${getCoachingInstruction()}

You are a specialist Data Governance career matching engine. Evaluate how well the applicant matches the job and present your analysis as direct coaching to them using second person (you, your). Be strictly evidence-based: NEVER claim the applicant has a skill, qualification or experience that is not present in their profile or master CV. For every positive claim, copy a short evidence phrase from the named source and assign the scoring category it supports. Prefer an exact quotation and do not introduce facts that are absent from the source. If no supporting phrase exists, do not make the positive claim.

Distinguish genuine Data Governance roles from roles that are primarily data engineering, software engineering, BI development, data science, ML or database administration. Related technical roles should score lower unless governance/quality/controls/stewardship/metadata/regulatory/leadership responsibilities are substantial.

Apply these scoring weights (they sum to 100):
${JSON.stringify(weights)}

For EACH of the 8 scoring categories, return a category_analysis entry with:
- category: the scoring category key
- requirement: the specific requirement stated in the job (or empty if not stated)
- requirement_stated: true if the job mentions a requirement in this category, false if it does not
- preliminary_status: one of "Verified" (you meet the requirement with evidence), "Partially Verified" (some but not all), "Gap" (requirement clear but you lack evidence), "Requirement Not Stated" (job does not mention this), "Insufficient Job Information" (extracted vacancy too incomplete to determine), "Not Applicable" (genuinely does not apply)
- explanation: brief explanation of the assessment, addressed to the applicant in second person (e.g. "Your Master CV confirms...")
- points_withheld_reason: why points were withheld if applicable
- unresolved_question: any material question that must be resolved before a final assessment
- awarded_points: points awarded for this category (0 if gap, requirement not stated, or insufficient info)

Also return strong_matches, partial_matches, and transferable_matches with evidence items. Each evidence item must include the category it supports. A category may receive positive points only when at least one verified evidence item supports it.

Apply hard-stop rules where relevant (flag in hard_stops, do not delete the job). Hard stops include:
${JSON.stringify(DEFAULT_HARD_STOPS)}

For missing_requirements list only requirements the available evidence shows you lack. Put unknowns in questions instead. Suggested CV must be the supplied master CV name. Suggested deadline should be the closing date if known else within 7 days.

IMPORTANT: If the job content is incomplete (short description, missing sections), use "Insufficient Job Information" for categories that cannot be assessed. Do not guess or infer requirements that are not stated in the job text.

${getPersonaConfig().candidateDataLabel}:
${ctx}

JOB:
${JSON.stringify(job)}`,
    response_json_schema: {
      type: "object",
      properties: {
        confidence: { type: "string" },
        strong_matches: matchEvidenceSchema(),
        partial_matches: matchEvidenceSchema(),
        missing_requirements: { type: "array", items: { type: "string" } },
        transferable_matches: matchEvidenceSchema(),
        concerns: { type: "array", items: { type: "string" } },
        questions: { type: "array", items: { type: "string" } },
        hard_stops: { type: "array", items: { type: "string" } },
        suggested_cv: { type: "string" },
        application_priority: { type: "string" },
        suggested_deadline: { type: "string" },
        recommended_action: { type: "string" },
        category_analysis: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string", enum: SCORING_CATEGORIES },
              requirement: { type: "string" },
              requirement_stated: { type: "boolean" },
              preliminary_status: {
                type: "string",
                enum: ["Verified", "Partially Verified", "Gap", "Requirement Not Stated", "Insufficient Job Information", "Not Applicable"],
              },
              explanation: { type: "string" },
              points_withheld_reason: { type: "string" },
              unresolved_question: { type: "string" },
              awarded_points: { type: "number" },
            },
            required: ["category", "requirement_stated", "preliminary_status"],
          },
        },
      },
      required: ["strong_matches", "partial_matches", "transferable_matches", "category_analysis"],
    },
  });

  if (
    !res ||
    typeof res !== "object" ||
    !Array.isArray(res.category_analysis) ||
    res.category_analysis.length === 0
  ) {
    throw new Error("The AI returned an incomplete match assessment. Please run the analysis again.");
  }

  return normaliseMatchResult(res, contextData, weights, jobContentStatus);
}
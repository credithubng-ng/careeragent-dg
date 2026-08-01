// Shared job matching logic — usable in both frontend (careerAI.js) and backend (processGmailAlerts).
// The invokeLLM parameter abstracts the difference between frontend and backend SDK calls.

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
  "Candidate does not have the required right to work",
  "Mandatory security clearance cannot be obtained",
  "Salary is materially below the candidate's minimum",
  "Location is outside the accepted area and remote work is unavailable",
  "Role is primarily technical data engineering rather than Data Governance",
  "Role requires a mandatory qualification the candidate does not possess",
  "Job is expired",
];

const SCORING_CATEGORIES = Object.keys(DEFAULT_WEIGHTS);
const EVIDENCE_SIMILARITY_THRESHOLD = 0.72;

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

  for (const item of Array.isArray(items) ? items : []) {
    const claim = String(item?.claim || "").trim();
    const evidence = String(item?.evidence || "").trim();
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
      if (category) verifiedCategories.add(category);
    } else if (claim) {
      rejected.push(claim);
    }
  }

  return { verified, rejected, verifiedCategories };
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

function normaliseBreakdown(result: any, weights: any, verifiedCategories: Set<string>) {
  const assessable = new Set(
    (Array.isArray(result?.assessable_categories) ? result.assessable_categories : [])
      .filter((category: string) => SCORING_CATEGORIES.includes(category))
  );
  const rawBreakdown = result?.breakdown && typeof result.breakdown === "object"
    ? result.breakdown
    : {};
  const breakdown: Record<string, any> = {};
  let awardedPoints = 0;
  let assessableWeight = 0;
  let verifiedAssessableCategories = 0;

  for (const category of SCORING_CATEGORIES) {
    const maximum = Number(weights[category]) || 0;
    const isAssessable = assessable.has(category);
    const requested = Number(rawBreakdown[category]);
    const hasVerifiedEvidence = verifiedCategories.has(category);
    const score = isAssessable && hasVerifiedEvidence && Number.isFinite(requested)
      ? Math.min(maximum, Math.max(0, requested))
      : 0;

    breakdown[category] = {
      score: Math.round(score * 10) / 10,
      maximum,
      status: !isAssessable
        ? "Not assessed"
        : hasVerifiedEvidence
          ? "Verified"
          : "Needs evidence",
    };
    if (isAssessable) assessableWeight += maximum;
    if (isAssessable && hasVerifiedEvidence) verifiedAssessableCategories += 1;
    awardedPoints += score;
  }

  return {
    breakdown,
    totalScore: assessableWeight && verifiedAssessableCategories
      ? Math.round((awardedPoints / assessableWeight) * 100)
      : null,
  };
}

function normaliseMatchResult(result: any, contextData: any, weights: any) {
  const strong = verifyEvidenceItems(result?.strong_matches, contextData);
  const partial = verifyEvidenceItems(result?.partial_matches, contextData);
  const transferable = verifyEvidenceItems(result?.transferable_matches, contextData);
  const verifiedCategories = new Set([
    ...strong.verifiedCategories,
    ...partial.verifiedCategories,
    ...transferable.verifiedCategories,
  ]);
  const rejected = [...strong.rejected, ...partial.rejected, ...transferable.rejected];
  const { breakdown, totalScore } = normaliseBreakdown(result, weights, verifiedCategories);
  const hasScore = totalScore !== null;
  const questions = Array.isArray(result?.questions) ? result.questions : [];

  // Check for hard stops — if any, recommendation is "Reject"
  const hardStops = Array.isArray(result?.hard_stops) ? result.hard_stops : [];
  const hasHardStop = hardStops.length > 0;

  return {
    total_score: hasScore ? totalScore : 0,
    recommendation: hasHardStop
      ? "Reject"
      : hasScore
        ? recommendationBand(totalScore)
        : "Do Not Apply",
    confidence: !hasScore
      ? "Insufficient evidence"
      : rejected.length
        ? "Low"
        : String(result?.confidence || "Medium"),
    strong_reasons: strong.verified,
    partial_reasons: partial.verified,
    transferable_strengths: transferable.verified,
    missing_requirements: Array.isArray(result?.missing_requirements) ? result.missing_requirements : [],
    concerns: Array.isArray(result?.concerns) ? result.concerns : [],
    questions: [
      ...questions,
      ...rejected.map((claim) => `Unverified AI claim — confirm before use: ${claim}`),
    ],
    hard_stops: hardStops,
    suggested_cv: String(result?.suggested_cv || contextData.master_cv.name || ""),
    application_priority: String(result?.application_priority || ""),
    suggested_deadline: String(result?.suggested_deadline || ""),
    recommended_action: !hasScore
      ? "Review the Candidate Profile and Master CV evidence before making an application decision."
      : String(result?.recommended_action || ""),
    breakdown,
  };
}

/**
 * Run AI job matching. Works in both frontend and backend.
 * @param invokeLLM - Function that calls InvokeLLM (frontend: base44.integrations.Core.InvokeLLM, backend: base44.asServiceRole.integrations.Core.InvokeLLM)
 */
export async function runJobMatch(
  job: any,
  candidate: any,
  cvs: any[],
  scoring: any,
  invokeLLM: (params: any) => Promise<any>
): Promise<any> {
  const contextData = buildCandidateContextData(candidate, cvs);
  const ctx = JSON.stringify(contextData, null, 2);
  const weights = resolveScoringWeights(scoring);

  const res = await invokeLLM({
    prompt: `You are a specialist Data Governance career matching engine. Evaluate how well the candidate matches the job. Be strictly evidence-based: NEVER claim the candidate has a skill, qualification or experience that is not present in the candidate profile or master CV. For every positive claim, copy a short evidence phrase from the named source and assign the scoring category it supports. Prefer an exact quotation and do not introduce facts that are absent from the source. If no supporting phrase exists, do not make the positive claim.

Distinguish genuine Data Governance roles from roles that are primarily data engineering, software engineering, BI development, data science, ML or database administration. Related technical roles should score lower unless governance/quality/controls/stewardship/metadata/regulatory/leadership responsibilities are substantial.

Apply these scoring weights (they sum to 100):
${JSON.stringify(weights)}

For breakdown, return the awarded points for every category, capped at that category's configured weight. A category may receive positive points only when at least one returned positive evidence item supports that category. List every category that can be compared from the supplied job and candidate information in assessable_categories. A job description plus a populated Candidate Profile or Master CV must produce at least one assessable category; do not return an empty assessment merely because some fields are unknown. In particular, assess experience, essential skills, seniority/leadership and responsibilities whenever the supplied texts discuss them. Do not treat an unknown salary, qualification, location or other missing fact as a mismatch. The application will independently verify the evidence, calculate the final normalised score across assessable categories and derive the recommendation.

Apply hard-stop rules where relevant (do not delete the job, just flag in hard_stops and lower the relevant category scores). Hard stops include:
${JSON.stringify(DEFAULT_HARD_STOPS)}

For missing_requirements list only requirements the available evidence shows the candidate lacks. Put unknowns in questions instead. Suggested CV must be the supplied master CV name. Suggested deadline should be the closing date if known else within 7 days. Return JSON per schema.

CANDIDATE:
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
        assessable_categories: {
          type: "array",
          items: { type: "string", enum: SCORING_CATEGORIES },
          minItems: 1,
        },
        breakdown: {
          type: "object",
          properties: Object.fromEntries(
            SCORING_CATEGORIES.map((category) => [category, { type: "number" }])
          ),
          required: SCORING_CATEGORIES,
        },
      },
      required: [
        "strong_matches",
        "partial_matches",
        "transferable_matches",
        "assessable_categories",
        "breakdown",
      ],
    },
  });

  if (
    !res ||
    typeof res !== "object" ||
    !Array.isArray(res.assessable_categories) ||
    res.assessable_categories.length === 0
  ) {
    throw new Error("The AI returned an incomplete match assessment. Please run the analysis again.");
  }

  return normaliseMatchResult(res, contextData, weights);
}
// Shared job matching engine v2 — single authoritative scoring engine.
//
// KEY CHANGES FROM v1:
// - Evidence quotation verification no longer gates category scores.
// - Category statuses replaced with Strong/Partial/No Match model.
// - Deterministic structured scoring for location, salary, experience, right-to-work.
// - Structured results override contradictory LLM conclusions.
// - No automatic 70% discount on partial/transferable matches.
// - Evidence verification affects confidence and reasons only, not scores.
//
// Usable in both frontend (careerAI.js) and backend (processGmailAlerts).
import { getCoachingInstruction, getPersonaConfig } from "./persona.ts";

export const MATCHING_ENGINE_VERSION = 3;

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
const CATEGORY_LABELS: Record<string, string> = {
  weight_experience: "Relevant experience",
  weight_essential_skills: "Essential skills",
  weight_seniority_leadership: "Seniority and leadership",
  weight_sector: "Sector experience",
  weight_responsibilities: "Responsibilities",
  weight_location: "Location and working pattern",
  weight_salary: "Salary",
  weight_qualifications: "Qualifications",
};
const EVIDENCE_SIMILARITY_THRESHOLD = 0.72;

// Material questions that prevent a "Final" assessment
const MATERIAL_QUESTIONS = [
  "right to work", "work authorisation", "visa", "sponsorship",
  "security clearance", "clearance", "language requirement",
  "mandatory qualification", "relocation", "relocate",
  "essential skill", "core responsibility", "expired",
];

type CategoryStatus =
  | "Strong Match"
  | "Partial Match"
  | "No Match"
  | "Requirement Not Stated"
  | "Insufficient Information"
  | "Not Applicable";

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

// ─── Evidence verification (confidence + reasons filtering only, NOT scoring) ───

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

interface EvidenceVerification {
  verified: string[];
  rejected: string[];
  verifiedCount: number;
  totalCount: number;
}

function verifyEvidenceItems(items: any[], contextData: any): EvidenceVerification {
  const profileText = JSON.stringify(contextData.profile);
  const cvText = contextData.master_cv.text;
  const verified: string[] = [];
  const rejected: string[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    const claim = String(item?.claim || "").trim();
    const evidence = String(item?.evidence || "").trim();
    const preferredSource = item?.source === "Master CV" ? "Master CV" : "Candidate Profile";
    const sources = preferredSource === "Master CV"
      ? [["Master CV", cvText], ["Candidate Profile", profileText]]
      : [["Candidate Profile", profileText], ["Master CV", cvText]];
    const verifiedSource = sources.find(([, sourceText]) =>
      hasGroundedEvidence(evidence, sourceText)
    )?.[0];

    if (claim && evidence.length >= 4 && verifiedSource) {
      verified.push(`${claim} — Evidence: "${evidence}" (${verifiedSource})`);
    } else if (claim) {
      rejected.push(claim);
    }
  }

  return {
    verified,
    rejected,
    verifiedCount: verified.length,
    totalCount: verified.length + rejected.length,
  };
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

// ─── Deterministic structured scoring helpers ───

export function normaliseCountry(value: unknown): string {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .trim();
  const ukValues = new Set([
    "uk", "u k", "united kingdom", "great britain", "britain",
    "gb", "england", "scotland", "wales", "northern ireland",
  ]);
  if (ukValues.has(text)) return "united kingdom";
  return text;
}

function isUKText(text: string): boolean {
  const t = String(text || "").toLowerCase();
  return /uk|united kingdom|britain|england|scotland|wales|great britain/.test(t);
}

function isUnrestrictedUKRightToWork(rightToWork: string): boolean {
  const t = String(rightToWork || "").toLowerCase();
  return t.includes("uk citizen") || t.includes("uk ilr") || t.includes("settled")
    || t.includes("indefinite leave") || t.includes("british citizen");
}

interface StructuredAssessment {
  applicable: boolean;
  status: CategoryStatus;
  awarded_points: number;
  maximum: number;
  requirement: string;
  explanation: string;
  matched_facts: string[];
  conflicting_facts: string[];
}

// 6B. Location and working arrangement
export function assessLocation(job: any, candidate: any): StructuredAssessment | null {
  const maximum = Number(DEFAULT_WEIGHTS.weight_location) || 0;
  const jobCountry = normaliseCountry(job?.country);
  const jobLocation = String(job?.location || "");
  const workArrangement = String(job?.work_arrangement || "").toLowerCase();
  const candidateLocation = String(candidate?.current_location || "");
  const preferredLocations: string[] = (candidate?.preferred_locations || []).map((l: string) => String(l || ""));
  const regionPreference = String(candidate?.region_preference || "");
  const workPref = String(candidate?.work_arrangement_preference || "").toLowerCase();
  const candidateRightToWork = String(candidate?.right_to_work || "");

  const hasJobGeo = jobCountry || jobLocation;
  const hasCandidateGeo = candidateLocation || preferredLocations.length > 0 || regionPreference;
  if (!hasJobGeo || !hasCandidateGeo) return null;

  const isUKJob = jobCountry === "united kingdom" || isUKText(jobLocation);
  const isUKCandidate = isUKText(candidateLocation)
    || isUnrestrictedUKRightToWork(candidateRightToWork)
    || isUKText(regionPreference);
  const isRemote = workArrangement === "remote";
  const isHybrid = workArrangement === "hybrid";
  const candidateAcceptsRemote = !workPref || workPref === "remote" || workPref === "hybrid" || workPref === "open";

  const matchedFacts: string[] = [];
  const conflictingFacts: string[] = [];

  // Rule 1 & 2: Remote UK role + UK candidate → full points
  if (isRemote && isUKJob && isUKCandidate) {
    matchedFacts.push("The vacancy is a UK remote role and you are based in the UK.");
    if (candidateAcceptsRemote) matchedFacts.push("You accept remote working arrangements.");
    return {
      applicable: true,
      status: "Strong Match",
      awarded_points: maximum,
      maximum,
      requirement: `${jobLocation || "UK"} — ${workArrangement}`,
      explanation: "You are based in the UK and the vacancy is a UK remote role, which aligns with your location and working-pattern preference. Remote UK work does not require you to be in a specific town.",
      matched_facts: matchedFacts,
      conflicting_facts: [],
    };
  }

  // Rule 4: Remote role + candidate accepts remote
  if (isRemote && candidateAcceptsRemote && !isUKJob) {
    // Remote role in a non-UK country — check region preference
    if (regionPreference && !regionPreference.toLowerCase().includes("global")) {
      const region = regionPreference.toLowerCase();
      if (region.includes("uk only") && !isUKCandidate) {
        conflictingFacts.push("The vacancy is outside the UK but you prefer UK-only roles.");
      }
    }
    if (conflictingFacts.length === 0) {
      matchedFacts.push("The vacancy is remote and you accept remote working arrangements.");
      return {
        applicable: true,
        status: "Strong Match",
        awarded_points: maximum,
        maximum,
        requirement: `${jobLocation || jobCountry} — Remote`,
        explanation: "The vacancy is remote and you accept remote work, so the working arrangement aligns.",
        matched_facts: matchedFacts,
        conflicting_facts: [],
      };
    }
  }

  // Rule 3: Hybrid or office — check commuting/relocation
  if (isHybrid || workArrangement === "office") {
    const jobGeoLower = jobLocation.toLowerCase();
    const candidateGeoLower = candidateLocation.toLowerCase();
    const preferredLower = preferredLocations.map((l) => l.toLowerCase());

    // Check if candidate location or preferred locations match job location
    const locationMatches = isUKJob && isUKCandidate && (
      candidateGeoLower === jobGeoLower ||
      preferredLower.some((p) => p && (jobGeoLower.includes(p) || p.includes(jobGeoLower))) ||
      // Same country is sufficient for many roles
      (isUKText(candidateLocation) && isUKText(jobLocation))
    );

    if (locationMatches) {
      matchedFacts.push(`The vacancy is in ${jobLocation || jobCountry} and your location preferences are compatible.`);
      return {
        applicable: true,
        status: "Strong Match",
        awarded_points: Math.round(maximum * 0.9 * 10) / 10,
        maximum,
        requirement: `${jobLocation} — ${workArrangement}`,
        explanation: `The vacancy is in ${jobLocation || jobCountry} and your location is compatible. Hybrid/office attendance is feasible.`,
        matched_facts: matchedFacts,
        conflicting_facts: [],
      };
    }

    // Check willingness to relocate
    if (candidate?.willing_to_relocate) {
      matchedFacts.push("You have indicated willingness to relocate.");
      return {
        applicable: true,
        status: "Partial Match",
        awarded_points: Math.round(maximum * 0.5 * 10) / 10,
        maximum,
        requirement: `${jobLocation} — ${workArrangement}`,
        explanation: `The vacancy is in ${jobLocation || jobCountry} and you are willing to relocate, which partially aligns.`,
        matched_facts: matchedFacts,
        conflicting_facts: [],
      };
    }

    // Genuine geographical conflict
    conflictingFacts.push(`The vacancy is in ${jobLocation || jobCountry} and your location/preferences do not align for ${workArrangement} work.`);
    return {
      applicable: true,
      status: "No Match",
      awarded_points: 0,
      maximum,
      requirement: `${jobLocation} — ${workArrangement}`,
      explanation: `The vacancy requires ${workArrangement} work in ${jobLocation || jobCountry}, which conflicts with your location and you have not indicated willingness to relocate.`,
      matched_facts: [],
      conflicting_facts: conflictingFacts,
    };
  }

  // Insufficient work arrangement info but geographies align
  if (isUKJob && isUKCandidate) {
    matchedFacts.push("Both you and the vacancy are UK-based.");
    return {
      applicable: true,
      status: "Partial Match",
      awarded_points: Math.round(maximum * 0.7 * 10) / 10,
      maximum,
      requirement: jobLocation || "UK",
      explanation: "You are both UK-based. The working arrangement is not specified, so a partial alignment is assessed.",
      matched_facts: matchedFacts,
      conflicting_facts: [],
    };
  }

  return null;
}

// 6C. Salary and employment type
export function assessSalary(job: any, candidate: any): StructuredAssessment | null {
  const maximum = Number(DEFAULT_WEIGHTS.weight_salary) || 0;
  const jobMin = Number(job?.salary_min) || 0;
  const jobMax = Number(job?.salary_max) || 0;
  const salaryDescription = String(job?.salary_description || "").trim();
  const candidateMin = Number(candidate?.min_salary) || 0;
  const candidatePreferred = Number(candidate?.preferred_salary) || 0;

  // No salary stated on the job
  if (jobMin === 0 && jobMax === 0 && !salaryDescription) {
    return {
      applicable: true,
      status: "Partial Match",
      awarded_points: Math.round(maximum * 0.6 * 10) / 10,
      maximum,
      requirement: "Salary not advertised",
      explanation: "Salary is not advertised. A neutral provisional score is used; no market benchmark has been applied.",
      matched_facts: [],
      conflicting_facts: ["Requires a sourced salary benchmark before the salary fit can be confirmed"],
    };
  }

  // Need candidate salary expectation to assess
  if (!candidateMin && !candidatePreferred) return null;

  // Use the highest reliable job salary value
  const jobSalary = jobMax || jobMin;
  const benchmark = candidatePreferred || candidateMin;

  // Rule 1 & 2: Job salary >= candidate preferred → full/near-full
  if (jobSalary >= benchmark) {
    return {
      applicable: true,
      status: "Strong Match",
      awarded_points: maximum,
      maximum,
      requirement: salaryDescription || `${jobMin}${jobMax ? `–${jobMax}` : ""}`,
      explanation: `The vacancy salary (${jobSalary}) meets or exceeds your preferred salary (${benchmark}), so salary aligns well.`,
      matched_facts: [`Vacancy salary ${jobSalary} ≥ your preferred ${benchmark}`],
      conflicting_facts: [],
    };
  }

  // Rule 1: Job salary >= candidate minimum → not a gap, partial
  if (jobSalary >= candidateMin) {
    return {
      applicable: true,
      status: "Partial Match",
      awarded_points: Math.round(maximum * 0.7 * 10) / 10,
      maximum,
      requirement: salaryDescription || `${jobMin}${jobMax ? `–${jobMax}` : ""}`,
      explanation: `The vacancy salary (${jobSalary}) meets your minimum (${candidateMin}) but is below your preferred (${candidatePreferred}). Salary partially aligns.`,
      matched_facts: [`Vacancy salary ${jobSalary} ≥ your minimum ${candidateMin}`],
      conflicting_facts: [`Below preferred ${candidatePreferred}`],
    };
  }

  // Rule 4: Salary materially below minimum → No Match
  // Only treat as No Match if the gap is material (>15% below minimum)
  if (candidateMin > 0 && jobSalary < candidateMin * 0.85) {
    return {
      applicable: true,
      status: "No Match",
      awarded_points: 0,
      maximum,
      requirement: salaryDescription || `${jobMin}${jobMax ? `–${jobMax}` : ""}`,
      explanation: `The vacancy salary (${jobSalary}) is materially below your minimum expectation (${candidateMin}).`,
      matched_facts: [],
      conflicting_facts: [`Vacancy salary ${jobSalary} < your minimum ${candidateMin}`],
    };
  }

  // Close to minimum — partial
  return {
    applicable: true,
    status: "Partial Match",
    awarded_points: Math.round(maximum * 0.4 * 10) / 10,
    maximum,
    requirement: salaryDescription || `${jobMin}${jobMax ? `–${jobMax}` : ""}`,
    explanation: `The vacancy salary (${jobSalary}) is close to your minimum (${candidateMin}) but slightly below.`,
    matched_facts: [],
    conflicting_facts: [`Vacancy salary ${jobSalary} slightly below your minimum ${candidateMin}`],
  };
}

// 6D. Right-to-work assessment (used for hard stops + location context)
export function assessRightToWork(job: any, candidate: any): StructuredAssessment | null {
  const maximum = Number(DEFAULT_WEIGHTS.weight_location) || 0;
  const jobReq = String(job?.right_to_work_requirements || "").toLowerCase();
  const candidateRTW = String(candidate?.right_to_work || "");

  if (!jobReq) return null;

  const requiresUKRight = /right to work|uk citizen|british citizen|eligibility to work|must have|must be/.test(jobReq)
    && !/sponsorship|visa|sponsor/.test(jobReq);
  const requiresSponsorship = /sponsorship|visa|sponsor/.test(jobReq);
  const hasUnrestrictedUK = isUnrestrictedUKRightToWork(candidateRTW);

  if (requiresUKRight || (!requiresSponsorship && /uk|united kingdom|britain/.test(jobReq))) {
    if (hasUnrestrictedUK) {
      return {
        applicable: true,
        status: "Strong Match",
        awarded_points: maximum,
        maximum,
        requirement: jobReq,
        explanation: "You have unrestricted UK right to work, which satisfies the vacancy's right-to-work requirement.",
        matched_facts: ["Unrestricted UK right to work confirmed in profile"],
        conflicting_facts: [],
      };
    }
    if (candidateRTW.toLowerCase().includes("sponsorship")) {
      return {
        applicable: true,
        status: "No Match",
        awarded_points: 0,
        maximum,
        requirement: jobReq,
        explanation: "The vacancy requires UK right to work but your profile indicates sponsorship is required.",
        matched_facts: [],
        conflicting_facts: ["Sponsorship required but vacancy requires unrestricted UK right to work"],
      };
    }
  }

  return null;
}

// 6E. Years of experience
export function assessExperience(job: any, candidate: any): StructuredAssessment | null {
  const maximum = Number(DEFAULT_WEIGHTS.weight_experience) || 0;
  const requiredYears = Number(job?.required_years_experience) || 0;
  const totalYears = Number(candidate?.years_total_experience) || 0;
  const dgYears = Number(candidate?.years_data_governance) || 0;
  const leadershipYears = Number(candidate?.years_leadership) || 0;

  if (!requiredYears) return null;
  if (!totalYears && !dgYears) return null;

  // Use the most relevant experience measure
  const relevantYears = Math.max(dgYears, totalYears);

  if (relevantYears >= requiredYears) {
    const ratio = requiredYears > 0 ? Math.min(1, relevantYears / requiredYears) : 1;
    return {
      applicable: true,
      status: "Strong Match",
      awarded_points: maximum,
      maximum,
      requirement: `${requiredYears} years`,
      explanation: `You have ${relevantYears} years of relevant experience, which meets the ${requiredYears} years required.`,
      matched_facts: [`${relevantYears} years ≥ ${requiredYears} required`],
      conflicting_facts: [],
    };
  }

  if (relevantYears >= requiredYears * 0.7) {
    return {
      applicable: true,
      status: "Partial Match",
      awarded_points: Math.round(maximum * (relevantYears / requiredYears) * 10) / 10,
      maximum,
      requirement: `${requiredYears} years`,
      explanation: `You have ${relevantYears} years of relevant experience, which is close to but below the ${requiredYears} years required.`,
      matched_facts: [`${relevantYears} years vs ${requiredYears} required`],
      conflicting_facts: [`Shortfall of ${requiredYears - relevantYears} years`],
    };
  }

  return {
    applicable: true,
    status: "No Match",
    awarded_points: 0,
    maximum,
    requirement: `${requiredYears} years`,
    explanation: `You have ${relevantYears} years of relevant experience, which is materially below the ${requiredYears} years required.`,
    matched_facts: [],
    conflicting_facts: [`${relevantYears} years < ${requiredYears} required`],
  };
}

// ─── Category status determination (no evidence gate) ───

export function determineCategoryStatus(
  category: string,
  llmAnalysis: any,
  jobContentStatus: string,
  weights: Record<string, number> = DEFAULT_WEIGHTS
): {
  status: CategoryStatus;
  score: number;
  maximum: number;
  requirement: string;
  explanation: string;
  pointsWithheldReason: string;
  unresolvedQuestion: string;
} {
  const maximum = Number(weights[category]) || 0;
  const requirement = String(llmAnalysis?.requirement || "");
  const requirementStated = llmAnalysis?.requirement_stated !== false;
  const preliminaryStatus = String(llmAnalysis?.preliminary_status || "");
  const explanation = String(llmAnalysis?.explanation || "");
  const pointsWithheldReason = String(llmAnalysis?.points_withheld_reason || "");
  const unresolvedQuestion = String(llmAnalysis?.unresolved_question || "");

  // v3 scoring is deliberately stable: the AI classifies each semantic
  // category, while application code converts that class to fixed points.
  // This prevents identical evidence receiving different arbitrary points on
  // repeated runs. Structured categories are marked deterministic and retain
  // their calculated ratio.
  const requestedPoints = Number(llmAnalysis?.awarded_points);
  const deterministicScore = Number.isFinite(requestedPoints)
    ? Math.min(maximum, Math.max(0, requestedPoints))
    : 0;

  if (
    preliminaryStatus === "Insufficient Information" ||
    preliminaryStatus === "Insufficient Job Information" ||
    (jobContentStatus !== "Complete" && !requirementStated && !preliminaryStatus)
  ) {
    return {
      status: "Insufficient Information",
      score: 0,
      maximum,
      requirement,
      explanation: explanation || "The available information is insufficient to assess this category.",
      pointsWithheldReason: "",
      unresolvedQuestion,
    };
  }

  if (preliminaryStatus === "Not Applicable") {
    return {
      status: "Not Applicable",
      score: 0,
      maximum: 0,
      requirement: "",
      explanation: explanation || "This category does not apply to this vacancy.",
      pointsWithheldReason: "",
      unresolvedQuestion,
    };
  }

  if (!requirementStated || preliminaryStatus === "Requirement Not Stated") {
    return {
      status: "Requirement Not Stated",
      score: 0,
      maximum,
      requirement: "",
      explanation: explanation || "The vacancy does not state a requirement in this category.",
      pointsWithheldReason: "",
      unresolvedQuestion: "",
    };
  }

  let status: CategoryStatus;

  if (preliminaryStatus === "No Match" || preliminaryStatus === "Gap") {
    status = "No Match";
  } else if (preliminaryStatus === "Strong Match" || preliminaryStatus === "Verified") {
    status = "Strong Match";
  } else if (preliminaryStatus === "Partial Match" || preliminaryStatus === "Partially Verified") {
    status = "Partial Match";
  } else if (deterministicScore >= maximum * 0.8) {
    status = "Strong Match";
  } else if (deterministicScore > 0) {
    status = "Partial Match";
  } else {
    status = "No Match";
  }

  const score = llmAnalysis?.deterministic === true
    ? deterministicScore
    : status === "Strong Match"
      ? maximum
      : status === "Partial Match"
        ? maximum * 0.6
        : 0;

  return {
    status,
    score: Math.round(score * 10) / 10,
    maximum,
    requirement,
    explanation,
    pointsWithheldReason,
    unresolvedQuestion,
  };
}

// ─── Scoring weights resolution ───

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

// ─── Candidate context building ───

function buildCandidateContextData(candidate: any, cvs: any[]) {
  const readyCVs = getUsableCVs(cvs);
  const master = readyCVs.find((cv: any) => cv.is_master) || readyCVs[0];
  return {
    profile: {
      full_name: candidate?.full_name,
      current_job_title: candidate?.current_job_title,
      current_location: candidate?.current_location,
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

// ─── Build category analysis map with deterministic overrides ───

function buildCategoryAnalysisMap(
  llmCategoryAnalysis: any[],
  job: any,
  candidate: any,
  weights: Record<string, number>
): Map<string, any> {
  const map = new Map<string, any>();
  for (const ca of llmCategoryAnalysis) {
    if (ca?.category && SCORING_CATEGORIES.includes(ca.category)) {
      map.set(ca.category, ca);
    }
  }

  // Deterministic overrides — structured data takes precedence over contradictory LLM output
  const overrides: Array<{ category: string; assessment: StructuredAssessment | null }> = [
    { category: "weight_location", assessment: assessLocation(job, candidate) },
    { category: "weight_salary", assessment: assessSalary(job, candidate) },
    { category: "weight_experience", assessment: assessExperience(job, candidate) },
  ];

  for (const { category, assessment } of overrides) {
    if (assessment?.applicable) {
      const existing = map.get(category);
      const defaultMaximum = Number(DEFAULT_WEIGHTS[category]) || 0;
      const configuredMaximum = Number(weights[category]) || 0;
      const ratio = defaultMaximum > 0 ? assessment.awarded_points / defaultMaximum : 0;
      map.set(category, {
        category,
        requirement: assessment.requirement || existing?.requirement || "",
        requirement_stated: assessment.status !== "Requirement Not Stated",
        preliminary_status: assessment.status,
        awarded_points: Math.round(configuredMaximum * ratio * 10) / 10,
        explanation: assessment.explanation,
        points_withheld_reason: "",
        unresolved_question: "",
        deterministic: true,
      });
    }
  }

  return map;
}

// ─── Result normalisation ───

function normaliseMatchResult(
  result: any,
  contextData: any,
  weights: any,
  jobContentStatus: string,
  job: any,
  candidate: any
) {
  // Evidence verification — for confidence and reasons only, NOT scoring
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
  const rejected = [...strong.rejected, ...partial.rejected, ...transferable.rejected];
  const totalEvidenceItems = strong.totalCount + partial.totalCount + transferable.totalCount;
  const verifiedEvidenceItems = strong.verifiedCount + partial.verifiedCount + transferable.verifiedCount;

  const questions = Array.isArray(result?.questions) ? result.questions : [];
  const hardStops = Array.isArray(result?.hard_stops) ? result.hard_stops : [];

  // Right-to-work hard stop check
  const rtwAssessment = assessRightToWork(job, candidate);
  if (rtwAssessment?.status === "No Match" && !hardStops.includes("You do not have the required right to work")) {
    hardStops.push("You do not have the required right to work");
  }

  const hasHardStop = hardStops.length > 0;

  // Build per-category analysis with deterministic overrides
  const llmCategoryAnalysis = Array.isArray(result?.category_analysis) ? result.category_analysis : [];
  const categoryAnalysisMap = buildCategoryAnalysisMap(llmCategoryAnalysis, job, candidate, weights);

  const breakdown: Record<string, any> = {};
  const categoryAnalysis: Record<string, any> = {};
  let awardedPoints = 0;
  let assessedCategories = 0;
  const totalCategories = SCORING_CATEGORIES.length;

  for (const category of SCORING_CATEGORIES) {
    const llmAnalysis = categoryAnalysisMap.get(category) || {};
    const { status, score, maximum, requirement, explanation, pointsWithheldReason, unresolvedQuestion } =
      determineCategoryStatus(category, llmAnalysis, jobContentStatus, weights);

    breakdown[category] = { score, maximum, status };
    categoryAnalysis[category] = {
      requirement,
      status,
      score,
      maximum,
      explanation,
      points_withheld_reason: pointsWithheldReason,
      unresolved_question: unresolvedQuestion,
      deterministic: llmAnalysis?.deterministic === true,
    };

    awardedPoints += score;

    // Coverage: categories with a definitive status
    if (status !== "Insufficient Information") {
      assessedCategories++;
    }
  }

  // v3 total is the actual weighted points out of 100. Earlier versions
  // removed unstated categories from the denominator, which could inflate a
  // sparse advert to an apparently excellent score and made jobs difficult to
  // compare. Coverage now explains missing information separately.
  const totalScore = Math.min(100, Math.max(0, Math.round(awardedPoints)));

  // Coverage
  const coverage = Math.round((assessedCategories / totalCategories) * 100);

  // Check for unresolved material questions
  const allQuestions = [...questions, ...rejected.map((claim) => `Supporting evidence should be reviewed before using this claim in an application document: ${claim}`)];
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
    const essentialSkillsStatus = breakdown.weight_essential_skills?.status;
    const responsibilitiesStatus = breakdown.weight_responsibilities?.status;
    const locationStatus = breakdown.weight_location?.status;
    const requiredAssessed = essentialSkillsStatus && essentialSkillsStatus !== "Insufficient Information"
      && responsibilitiesStatus && responsibilitiesStatus !== "Insufficient Information"
      && locationStatus && locationStatus !== "Insufficient Job Information";

    if (requiredAssessed && !hasMaterialQuestions) {
      assessmentStatus = "Final";
    } else {
      assessmentStatus = "Preliminary";
    }
  }

  // Apply score caps for preliminary assessments
  let finalScore = totalScore;
  let recommendation: string;

  if (hasHardStop) {
    recommendation = "Reject";
  } else if (assessmentStatus === "Preliminary" || hasMaterialQuestions) {
    finalScore = Math.min(finalScore, 79);
    recommendation = recommendationBand(finalScore) || "Do Not Apply";
  } else {
    recommendation = recommendationBand(finalScore) || "Do Not Apply";
  }

  // Confidence: reduce when evidence can't be grounded, but never change a match to No Match
  let confidence: string;
  if (!assessedCategories) {
    confidence = "Insufficient evidence";
  } else if (totalEvidenceItems > 0 && verifiedEvidenceItems / totalEvidenceItems < 0.3) {
    confidence = "Low";
  } else if (rejected.length > 0) {
    confidence = "Medium";
  } else {
    confidence = String(result?.confidence || "Medium");
  }

  const readableReasons = (wantedStatus: CategoryStatus) => Object.entries(categoryAnalysis)
    .filter(([, analysis]: [string, any]) => analysis.status === wantedStatus && analysis.explanation)
    .sort(([, left]: [string, any], [, right]: [string, any]) => right.maximum - left.maximum)
    .slice(0, 4)
    .map(([category, analysis]: [string, any]) => `${CATEGORY_LABELS[category] || category}: ${analysis.explanation}`);

  const recommendedAction = hasHardStop
    ? `Do not apply until this blocking issue is resolved: ${hardStops[0]}`
    : finalScore >= 80
      ? "Strong fit. Prioritise this application after checking the remaining questions and tailoring the Master CV."
      : finalScore >= 70
        ? "Worth pursuing. Review the partial matches and close the most important evidence gaps before applying."
        : finalScore >= 50
          ? "Possible fit. Apply only if the missing requirements are non-essential or can be evidenced from Angel's experience."
          : "Low fit. Focus first on stronger opportunities unless there is important evidence missing from the profile or job advert.";

  return {
    matching_engine_version: MATCHING_ENGINE_VERSION,
    total_score: finalScore,
    verified_fit: Math.round(awardedPoints * 10) / 10,
    assessment_coverage: coverage,
    assessment_status: assessmentStatus,
    recommendation,
    confidence,
    strong_reasons: readableReasons("Strong Match"),
    partial_reasons: readableReasons("Partial Match"),
    transferable_strengths: transferable.verified,
    missing_requirements: Array.isArray(result?.missing_requirements) ? result.missing_requirements : [],
    concerns: Array.isArray(result?.concerns) ? result.concerns : [],
    questions: allQuestions,
    hard_stops: hardStops,
    suggested_cv: String(result?.suggested_cv || contextData.master_cv.name || ""),
    application_priority: String(result?.application_priority || ""),
    suggested_deadline: String(result?.suggested_deadline || ""),
    recommended_action: assessmentStatus === "Restricted Source"
      ? "This is a restricted-source review. Paste the complete vacancy text before relying on the score."
      : assessmentStatus === "Preliminary"
        ? `${recommendedAction} This remains preliminary because some job information is missing.`
        : recommendedAction,
    breakdown,
    category_analysis: categoryAnalysis,
  };
}

// ─── Main entry point ───

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

  // Compute deterministic assessments to supply to the AI prompt
  const detLocation = assessLocation(job, candidate);
  const detSalary = assessSalary(job, candidate);
  const detExperience = assessExperience(job, candidate);
  const detRightToWork = assessRightToWork(job, candidate);
  const structuredAssessments = {
    location: detLocation,
    salary: detSalary,
    experience: detExperience,
    right_to_work: detRightToWork,
  };

  const res = await invokeLLM({
    prompt: `${getCoachingInstruction()}

You are the CareerAgent DG job-matching engine.

Your task is to compare the complete Candidate Profile and Master CV against the complete Job Description and produce a fair, proportionate and explainable compatibility score.

This is semantic candidate-to-job matching. It is not verbatim quotation matching.

CORE RULES

1. Evaluate whether the candidate's actual experience, capabilities, preferences and circumstances satisfy the job requirements.
2. Use all supplied information: structured Candidate Profile fields, Master CV text, job description, responsibilities, essential requirements, desirable requirements, salary, location, work arrangement, employment type, sector, qualifications, right-to-work requirements.
3. Recognise semantic equivalence, synonyms and transferable capability.
4. Do not require identical wording between the vacancy and the candidate information.
5. Do not award zero merely because a verbatim supporting quotation cannot be found.
6. A No Match means available information positively indicates that the candidate does not meet the requirement.
7. Where the candidate meets part of a requirement, award proportionate points.
8. Do not treat desirable, preferred, beneficial or highly desirable experience as mandatory unless the vacancy expressly says it is essential.
9. Do not allow one missing requirement to erase other matched elements in the same category.
10. Never invent candidate experience, qualifications, technologies, achievements or work rights.

SEMANTIC EQUIVALENCE

Recognise reasonable equivalences including:
- UK, Britain, Great Britain and United Kingdom;
- British citizenship and unrestricted UK right to work;
- data governance, information governance, data controls, data policy, governance frameworks and related governance disciplines;
- professional-services experience at firms such as BDO as professional-services sector experience;
- governance, assurance, risk and oversight experience as transferable to emerging-technology governance where appropriate;
- strategic oversight of technical controls as relevant, but not identical, to hands-on technical configuration.

STRUCTURED CATEGORIES

For location, salary, employment type, right to work and years of experience, use the supplied deterministic structured assessment where available. Do not contradict a deterministic result unless the supplied input data contains an explicit conflict.

DETERMINISTIC STRUCTURED ASSESSMENTS (already computed from structured profile fields):
${JSON.stringify(structuredAssessments, null, 2)}

RESPONSIBILITIES

Break material job responsibilities into individual components. For each component, assess: direct match, transferable match, limited match, or no match. Calculate the overall responsibility score proportionately according to the importance of each component. One missing technical responsibility must not erase all other matched responsibilities.

ESSENTIAL vs DESIRABLE

Distinguish between mandatory, essential, required, desirable, preferred, beneficial, advantageous, and highly desirable. A desirable, beneficial or advantageous criterion must not be treated as a mandatory requirement. Absence of a desirable criterion may reduce a score modestly but must not normally create a hard stop or force a category to zero.

CATEGORY STATUSES

Use exactly these values for preliminary_status:
- "Strong Match" — the candidate substantially or fully meets the requirement.
- "Partial Match" — the candidate meets a meaningful part of the requirement or has materially relevant transferable experience.
- "No Match" — available information positively shows the candidate does not meet the requirement.
- "Requirement Not Stated" — the vacancy does not state a requirement for the category.
- "Insufficient Information" — the job description or candidate information is genuinely insufficient to assess.
- "Not Applicable" — the category does not apply to the vacancy.

Do not use "Verified", "Partially Verified", "Gap", or "Insufficient Job Information" — use the new values above.

SCORING

For each category:
- award a number between zero and the category maximum;
- award full or near-full points where the requirement is substantially met;
- award proportionate points for transferable or partial capability;
- award zero only where there is a genuine material mismatch;
- explain matched elements and missing elements;
- explain why points were withheld.

Suggested score interpretation:
- 80% to 100% of category maximum: Strong Match
- 30% to below 80%: Partial Match
- below 30%: No Match only where a genuine mismatch exists

Ensure awarded_points values already represent the final points to use. The application code will not apply a second percentage discount.

EVIDENCE

Provide concise evidence from the Candidate Profile or Master CV. Evidence supports the explanation and confidence rating. Failure to reproduce an exact quotation must not automatically remove otherwise justified points.

HARD STOPS

Apply hard-stop rules where relevant (flag in hard_stops, do not delete the job). Hard stops include:
${JSON.stringify(DEFAULT_HARD_STOPS)}

For missing_requirements list only requirements the available evidence shows the candidate lacks. Put unknowns in questions instead. Suggested CV must be the supplied master CV name. Suggested deadline should be the closing date if known else within 7 days.

Apply these scoring weights (they sum to 100):
${JSON.stringify(weights)}

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
                enum: ["Strong Match", "Partial Match", "No Match", "Requirement Not Stated", "Insufficient Information", "Not Applicable"],
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

  return normaliseMatchResult(res, contextData, weights, jobContentStatus, job, candidate);
}

import { base44 } from "@/api/base44Client";
import { recommendationBand } from "./format";

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

const GOVERNANCE_TITLES = [
  "Head of Data Governance", "Director of Data Governance", "Data Governance Manager",
  "Data Governance Lead", "Senior Data Governance Manager", "Data Quality Manager",
  "Head of Data Quality", "Data Management Lead", "Data Governance Consultant",
  "Data Stewardship Lead", "Metadata Manager", "Data Controls Manager", "Data Risk Manager",
  "Information Governance Manager", "Master Data Management Lead", "Data Policy Manager",
  "Chief Data Office Governance Lead", "Data Standards Manager", "Data Assurance Manager",
];

const TECHNICAL_TITLES = [
  "Data Engineer", "Software Engineer", "BI Developer", "Data Scientist",
  "Machine Learning Engineer", "Database Administrator", "Data Analyst",
];

export function classifyJob(job) {
  const title = (job.job_title || "").toLowerCase();
  const isGovernance = GOVERNANCE_TITLES.some((t) => title.includes(t.toLowerCase()));
  const isTechnical = TECHNICAL_TITLES.some((t) => title.includes(t.toLowerCase())) && !isGovernance;
  return { isGovernance, isTechnical };
}

export function getUsableCandidateCVs(cvs) {
  return (cvs || []).filter(
    (cv) => cv.processing_status === "Ready" && cv.extracted_cv_text?.trim()
  );
}

function buildCandidateContextData(candidate, cvs) {
  const readyCVs = getUsableCandidateCVs(cvs);
  const master = readyCVs.find((cv) => cv.is_master) || readyCVs[0];
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

export function buildCandidateContext(candidate, cvs) {
  return JSON.stringify(buildCandidateContextData(candidate, cvs), null, 2);
}

function normaliseEvidence(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[“”‘’]/g, "'")
    .replace(/[^a-z0-9£%+.'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceTokens(value) {
  return normaliseEvidence(value).match(/[a-z0-9£%+]+(?:['.-][a-z0-9£%+]+)*/g) || [];
}

function tokenOverlap(left, right) {
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

function hasGroundedEvidence(evidence, sourceText) {
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

function verifyEvidenceItems(items, contextData) {
  const profileText = JSON.stringify(contextData.profile);
  const cvText = contextData.master_cv.text;
  const verified = [];
  const rejected = [];
  const verifiedCategories = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    const claim = String(item?.claim || "").trim();
    const evidence = String(item?.evidence || "").trim();
    const source = item?.source === "Master CV" ? "Master CV" : "Candidate Profile";
    const category = SCORING_CATEGORIES.includes(item?.category) ? item.category : "";
    const sourceText = source === "Master CV" ? cvText : profileText;
    if (claim && evidence.length >= 4 && hasGroundedEvidence(evidence, sourceText)) {
      verified.push(`${claim} — Evidence: “${evidence}” (${source})`);
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

function resolveScoringWeights(scoring) {
  const configured = Object.fromEntries(
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

function normaliseBreakdown(result, weights, verifiedCategories) {
  const assessable = new Set(
    (Array.isArray(result?.assessable_categories) ? result.assessable_categories : [])
      .filter((category) => SCORING_CATEGORIES.includes(category))
  );
  const rawBreakdown = result?.breakdown && typeof result.breakdown === "object"
    ? result.breakdown
    : {};
  const breakdown = {};
  let awardedPoints = 0;
  let assessableWeight = 0;

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
    awardedPoints += score;
  }

  return {
    breakdown,
    totalScore: assessableWeight
      ? Math.round((awardedPoints / assessableWeight) * 100)
      : null,
  };
}

function normaliseMatchResult(result, contextData, weights) {
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

  return {
    total_score: hasScore ? totalScore : 0,
    recommendation: hasScore ? recommendationBand(totalScore) : "Do Not Apply",
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
    hard_stops: Array.isArray(result?.hard_stops) ? result.hard_stops : [],
    suggested_cv: String(result?.suggested_cv || contextData.master_cv.name || ""),
    application_priority: String(result?.application_priority || ""),
    suggested_deadline: String(result?.suggested_deadline || ""),
    recommended_action: !hasScore
      ? "Review the Candidate Profile and Master CV evidence before making an application decision."
      : String(result?.recommended_action || ""),
    breakdown,
  };
}

export async function extractJobFromText(text) {
  const today = new Date().toISOString().slice(0, 10);
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You are a job-description extraction engine for UK Data Governance roles. Extract only facts stated in the following job advert. Leave unknown fields empty ("" or 0); do not infer missing employer, salary, dates, requirements or contact details. Parse salary ranges into numeric min/max without converting currencies. Use YYYY-MM-DD for dates. Set work_arrangement and employment_type only to one of the schema values. Identify the stated sector where possible.\n\nToday: ${today}\n\nJOB TEXT:\n${text}`,
    response_json_schema: {
      type: "object",
      properties: {
        job_title: { type: "string" },
        employer: { type: "string" },
        recruitment_agency: { type: "string" },
        job_source_name: { type: "string" },
        original_job_url: { type: "string" },
        job_reference: { type: "string" },
        date_posted: { type: "string" },
        location: { type: "string" },
        country: { type: "string" },
        work_arrangement: {
          type: "string",
          enum: ["", "Remote", "Hybrid", "Office", "Unspecified"],
        },
        employment_type: {
          type: "string",
          enum: ["", "Permanent", "Contract", "Interim", "Fixed Term", "Part-time"],
        },
        contract_length: { type: "string" },
        salary_min: { type: "number" },
        salary_max: { type: "number" },
        salary_description: { type: "string" },
        currency: { type: "string" },
        job_description: { type: "string" },
        responsibilities: { type: "string" },
        essential_requirements: { type: "string" },
        desirable_requirements: { type: "string" },
        required_years_experience: { type: "number" },
        required_qualifications: { type: "string" },
        required_certifications: { type: "string" },
        required_technologies: { type: "string" },
        required_sector_experience: { type: "string" },
        right_to_work_requirements: { type: "string" },
        security_clearance_requirement: { type: "string" },
        closing_date: { type: "string" },
        contact_person: { type: "string" },
        contact_email: { type: "string" },
        sector: { type: "string" },
      },
    },
  });
  return res;
}

export async function analyseJobMatch(job, candidate, cvs, scoring) {
  const contextData = buildCandidateContextData(candidate, cvs);
  const ctx = JSON.stringify(contextData, null, 2);
  const weights = resolveScoringWeights(scoring);
  const res = await base44.integrations.Core.InvokeLLM({
    model: "claude_sonnet_4_6",
    prompt: `You are a specialist Data Governance career matching engine. Evaluate how well the candidate matches the job. Be strictly evidence-based: NEVER claim the candidate has a skill, qualification or experience that is not present in the candidate profile or master CV. For every positive claim, copy a short evidence phrase from the named source and assign the scoring category it supports. Prefer an exact quotation and do not introduce facts that are absent from the source. If no supporting phrase exists, do not make the positive claim.\n\nDistinguish genuine Data Governance roles from roles that are primarily data engineering, software engineering, BI development, data science, ML or database administration. Related technical roles should score lower unless governance/quality/controls/stewardship/metadata/regulatory/leadership responsibilities are substantial.\n\nApply these scoring weights (they sum to 100):\n${JSON.stringify(weights)}\n\nFor breakdown, return the awarded points for every category, capped at that category's configured weight. A category may receive positive points only when at least one returned positive evidence item supports that category. List a category in assessable_categories only when both the job and candidate context contain enough information to assess it. Do not treat an unknown salary, qualification, location or other missing fact as a mismatch. The application will independently verify the evidence, calculate the final normalised score across assessable categories and derive the recommendation.\n\nApply hard-stop rules where relevant (do not delete the job, just flag in hard_stops and lower the relevant category scores). Hard stops include:\n${JSON.stringify(DEFAULT_HARD_STOPS)}\n\nFor missing_requirements list only requirements the available evidence shows the candidate lacks. Put unknowns in questions instead. Suggested CV must be the supplied master CV name. Suggested deadline should be the closing date if known else within 7 days. Return JSON per schema.\n\nCANDIDATE:\n${ctx}\n\nJOB:\n${JSON.stringify(job)}`,
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
  return normaliseMatchResult(res, contextData, weights);
}

export async function generateApplicationSection(section, job, candidate, cv, questionText) {
  const ctx = JSON.stringify({ candidate_profile: candidate, cv_text: cv?.extracted_cv_text || cv?.professional_summary || "" }, null, 2);
  const sectionPrompts = {
    "Tailored Profile": "a revised professional summary aligned with the job's requirements and the candidate's genuine experience",
    "CV Improvement": "CV improvement recommendations: keywords to include, experience to emphasise, achievements to move higher, skills that need clearer evidence, content less relevant, and suggested section ordering. Do NOT invent skills. Do NOT alter factual dates, job titles, employers or achievements.",
    "Cover Letter": "a professional UK-style cover letter addressed to the hiring manager, drawing only on the candidate's genuine experience and the job requirements",
    "Supporting Statement": "a role-specific supporting statement addressing the essential requirements, evidence-based",
    "Recruiter Message": "a concise LinkedIn or email introduction to a recruiter or hiring manager expressing interest in the role",
  };
  const prompt = `You are a specialist career application writer for a senior Data Governance professional. Generate ${sectionPrompts[section] || section}. Use ONLY information present in the candidate profile and CV. Never invent experience, qualifications, employers, dates or technologies. Write in British English.\n\nCANDIDATE:\n${ctx}\n\nJOB:\n${JSON.stringify(job)}\n${questionText ? `\nAPPLICATION QUESTION TO ANSWER:\n${questionText}\n` : ""}\n\nReturn the content as plain text. Include a heading line.`;
  const res = await base44.integrations.Core.InvokeLLM({ prompt });
  return typeof res === "string" ? res : JSON.stringify(res);
}

export async function generateInterviewQuestions(job, candidate) {
  const ctx = JSON.stringify({ candidate_profile: candidate });
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You are an interview preparation assistant for a senior Data Governance role. Based on the job description and candidate profile, generate 8 likely interview questions covering technical Data Governance knowledge, leadership, stakeholder management and behavioural/competency questions. Do not invent employer facts. Return as a JSON array of strings.\n\nCANDIDATE:\n${ctx}\n\nJOB:\n${JSON.stringify(job)}`,
    response_json_schema: { type: "object", properties: { questions: { type: "array", items: { type: "string" } } } },
  });
  return res?.questions || [];
}

export { recommendationBand };

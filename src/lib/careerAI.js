import { base44 } from "@/api/base44Client";
import { recommendationBand } from "./format";
import { runJobMatch as sharedRunJobMatch } from "../../base44/shared/jobMatching.ts";
import { getPersonaConfig } from "../../base44/shared/persona.ts";

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
  "I do not have the required right to work",
  "Mandatory security clearance cannot be obtained",
  "Salary is materially below my minimum",
  "Location is outside my accepted area and remote work is unavailable",
  "Role is primarily technical data engineering rather than Data Governance",
  "Role requires a mandatory qualification I do not possess",
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
    const preferredSource = item?.source === "Master CV" ? "Master CV" : "Candidate Profile";
    const category = SCORING_CATEGORIES.includes(item?.category) ? item.category : "";
    const sources = preferredSource === "Master CV"
      ? [["Master CV", cvText], ["Candidate Profile", profileText]]
      : [["Candidate Profile", profileText], ["Master CV", cvText]];
    const verifiedSource = sources.find(([, sourceText]) =>
      hasGroundedEvidence(evidence, sourceText)
    )?.[0];

    if (claim && evidence.length >= 4 && verifiedSource) {
      verified.push(`${claim} — Evidence: “${evidence}” (${verifiedSource})`);
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
      ? "Review my profile and Master CV evidence before making an application decision."
      : String(result?.recommended_action || ""),
    breakdown,
  };
}

export async function extractJobFromText(text) {
  const today = new Date().toISOString().slice(0, 10);
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You are a job-description extraction engine for UK Data Governance roles. The text below has been isolated from a recruitment webpage to contain only the primary vacancy. Extract only facts stated in the text that belong to the primary vacancy. If the text appears to contain multiple job vacancies, set ambiguity_warning to true and extract only the primary vacancy (the one matching the page title or main heading). Do not merge requirements from different vacancies. Leave unknown fields empty ("" or 0); do not infer missing employer, salary, dates, requirements or contact details. Parse salary ranges into numeric min/max without converting currencies. Use YYYY-MM-DD for dates. Set work_arrangement and employment_type only to one of the schema values. Identify the stated sector where possible. Set extraction_confidence to "High", "Medium", or "Low" based on how complete and coherent the extraction is.\n\nToday: ${today}\n\nJOB TEXT:\n${text}`,
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
        extraction_confidence: {
          type: "string",
          enum: ["High", "Medium", "Low"],
        },
        ambiguity_warning: { type: "boolean" },
      },
    },
  });
  return res;
}

export async function analyseJobMatch(job, candidate, cvs, scoring, jobContentStatus = "Complete") {
  return sharedRunJobMatch(
    job, candidate, cvs, scoring,
    (params) => base44.integrations.Core.InvokeLLM(params),
    jobContentStatus
  );
}

export async function generateApplicationSection(section, job, candidate, cv, match, questionText) {
  const candidateData = buildCandidateContextData(candidate, [cv]);
  const candidateContext = {
    candidate_profile: candidateData.profile,
    master_cv_text: candidateData.master_cv.text,
  };
  const verifiedMatchEvidence = [
    ...(match?.strong_reasons || []),
    ...(match?.partial_reasons || []),
    ...(match?.transferable_strengths || []),
  ];
  const sectionPrompts = {
    "Tailored Profile": "a revised professional summary aligned with the job's requirements and my genuine experience. Use a clear heading and 2–3 well-structured paragraphs",
    "CV Improvement": "CV improvement recommendations: keywords to include, experience to emphasise, achievements to move higher, skills that need clearer evidence, content less relevant, and suggested section ordering. Organise under clear subheadings with bullet points for each recommendation. Do NOT invent skills. Do NOT alter factual dates, job titles, employers or achievements.",
    "Cover Letter": "a professional UK-style cover letter addressed to the hiring manager, drawing only on my genuine experience and the job requirements. Use a formal greeting, an opening paragraph expressing interest, 2–3 body paragraphs each focused on one theme with concrete evidence, and a professional closing. Format as a letter with my name at the end.",
    "Supporting Statement": "a role-specific supporting statement addressing the essential requirements, evidence-based. Use a clear title, an introductory paragraph, then a subheading for each key requirement addressed with concrete evidence in the body. Include a brief closing paragraph.",
    "Recruiter Message": "a concise LinkedIn or email introduction to a recruiter or hiring manager expressing interest in the role. Use a professional subject line, a brief greeting, 1–2 short paragraphs and a sign-off.",
    "Application Question": "a direct, evidence-based answer to the supplied application question. Use 2–3 well-structured paragraphs with clear topic sentences and concrete supporting evidence.",
  };
  const prompt = `${getPersonaConfig().perspectiveInstruction}

You are a specialist career application writer for a senior Data Governance professional. Generate ${sectionPrompts[section] || section}. Write in British English.\n\nFORMATTING RULES:\n- Format the document using clean markdown so it reads as a polished, presentation-ready document.\n- Use markdown headings (## for sections, ### for subsections) to create a clear visual structure.\n- Use bullet points or numbered lists where the content is naturally a list (e.g. skills, achievements, recommendations).\n- Write flowing paragraphs for prose sections; avoid large unbroken walls of text.\n- Use **bold** sparingly to emphasise the candidate's key strengths or role-critical keywords.\n- Do NOT wrap the entire document in code blocks or fences.\n- Do NOT add horizontal rules between every paragraph — use headings to separate sections.\n- Ensure there is a blank line between paragraphs and around headings/lists for readability.\n\nGROUNDING RULES:\n- Use only my facts present in my Profile or Master CV below.\n- Prioritise the supplied VERIFIED MATCH EVIDENCE when aligning the draft to the job.\n- Never invent or infer experience, qualifications, employers, dates, achievements, metrics, technologies, responsibilities or sector exposure.\n- Do not present a missing requirement as my strength.\n- Return every exact source phrase used to support a factual claim in evidence_quotes. These quotes are checked by the application before the draft is saved.\n\nMY PROFILE & CV:\n${JSON.stringify(candidateContext, null, 2)}\n\nVERIFIED MATCH EVIDENCE:\n${JSON.stringify(verifiedMatchEvidence, null, 2)}\n\nKNOWN GAPS OR QUESTIONS:\n${JSON.stringify({
    missing_requirements: match?.missing_requirements || [],
    concerns: match?.concerns || [],
    questions: match?.questions || [],
  }, null, 2)}\n\nJOB:\n${JSON.stringify(job)}\n${questionText ? `\nAPPLICATION QUESTION TO ANSWER:\n${questionText}\n` : ""}`;
  const res = await base44.integrations.Core.InvokeLLM({
    model: "gpt_5",
    prompt,
    response_json_schema: {
      type: "object",
      properties: {
        content: { type: "string", minLength: 1 },
        evidence_quotes: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 4 },
        },
      },
      required: ["content", "evidence_quotes"],
    },
  });

  const content = typeof res?.content === "string" ? res.content.trim() : "";
  const evidenceQuotes = Array.isArray(res?.evidence_quotes) ? res.evidence_quotes : [];
  const profileText = JSON.stringify(candidateContext.candidate_profile);
  const cvText = candidateContext.master_cv_text;
  const unverifiedEvidence = evidenceQuotes.filter(
    (quote) => !hasGroundedEvidence(quote, profileText) && !hasGroundedEvidence(quote, cvText)
  );

  if (!content || evidenceQuotes.length === 0 || unverifiedEvidence.length > 0) {
    throw new Error("The generated draft contained evidence that could not be verified. Nothing was saved.");
  }

  return { content, evidenceQuotes };
}

export async function generateInterviewQuestions(job, candidate) {
  const ctx = JSON.stringify({ candidate_profile: candidate });
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `${getPersonaConfig().perspectiveInstruction}

You are an interview preparation assistant for a senior Data Governance role. Based on the job description and my profile, generate 8 likely interview questions covering technical Data Governance knowledge, leadership, stakeholder management and behavioural/competency questions. Do not invent employer facts. Return as a JSON array of strings.\n\nMY PROFILE:\n${ctx}\n\nJOB:\n${JSON.stringify(job)}`,
    response_json_schema: { type: "object", properties: { questions: { type: "array", items: { type: "string" } } } },
  });
  return res?.questions || [];
}

export { recommendationBand };
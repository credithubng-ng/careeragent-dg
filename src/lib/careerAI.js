import { base44 } from "@/api/base44Client";
import { recommendationBand } from "./format";
import { runJobMatch as sharedRunJobMatch } from "../../base44/shared/jobMatching.ts";
import { getPersonaConfig, getAuthoredInstruction, getCoachingInstruction } from "../../base44/shared/persona.ts";
import { requireAIObject, requireJobExtraction } from "./aiResponse";
import { assertJobOwner, getMatchingProfile } from "./profileReliability";
export { classifyJob } from "./jobClassification";

function isTransientAIError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 429 || status >= 500 || /rate limit|temporar|timeout|network/.test(message);
}

async function invokeAI(params, purpose) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return requireAIObject(
        await base44.integrations.Core.InvokeLLM(params),
        purpose
      );
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || !isTransientAIError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 3000 : 8000));
    }
  }
  throw lastError;
}

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

const EVIDENCE_SIMILARITY_THRESHOLD = 0.72;

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
        salary_period: { type: "string", enum: ["", "annual", "daily", "hourly", "monthly", "not_stated"] },
        salary_text: { type: "string" },
        currency: { type: "string" },
        role_summary: { type: "string" },
        job_description: { type: "string" },
        responsibilities: { type: "string" },
        essential_requirements: { type: "string" },
        desirable_requirements: { type: "string" },
        required_skills: { type: "string" },
        required_experience: { type: "string" },
        required_years_experience: { type: "number" },
        required_qualifications: { type: "string" },
        required_certifications: { type: "string" },
        required_technologies: { type: "string" },
        required_sector_experience: { type: "string" },
        seniority: { type: "string" },
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
  return requireJobExtraction(res);
}

export async function analyseJobMatch(job, candidate, cvs, scoring, jobContentStatus = "Complete") {
  const profile = getMatchingProfile(candidate, cvs);
  assertJobOwner(job, profile.ownerEmail);
  return sharedRunJobMatch(
    job, profile.candidate, profile.readyCVs, scoring,
    (params) => invokeAI(params, "match assessment"),
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
  const categoryGuidance = Object.values(match?.category_analysis || {})
    .filter((item) => item?.explanation)
    .map((item) => item.explanation);
  if (verifiedMatchEvidence.length === 0) {
    verifiedMatchEvidence.push(...categoryGuidance);
  }
  const sectionPrompts = {
    "Tailored Profile": "a revised professional summary aligned with the job's requirements and my genuine experience. Use a clear heading and 2–3 well-structured paragraphs",
    "CV Improvement": "CV improvement recommendations: keywords to include, experience to emphasise, achievements to move higher, skills that need clearer evidence, content less relevant, and suggested section ordering. Organise under clear subheadings with bullet points for each recommendation. Do NOT invent skills. Do NOT alter factual dates, job titles, employers or achievements.",
    "Cover Letter": "a professional UK-style cover letter addressed to the hiring manager, drawing only on my genuine experience and the job requirements. Use a formal greeting, an opening paragraph expressing interest, 2–3 body paragraphs each focused on one theme with concrete evidence, and a professional closing. Format as a letter with my name at the end.",
    "Supporting Statement": "a role-specific supporting statement addressing the essential requirements, evidence-based. Use a clear title, an introductory paragraph, then a subheading for each key requirement addressed with concrete evidence in the body. Include a brief closing paragraph.",
    "Recruiter Message": "a concise LinkedIn or email introduction to a recruiter or hiring manager expressing interest in the role. Use a professional subject line, a brief greeting, 1–2 short paragraphs and a sign-off.",
    "Application Question": "a direct, evidence-based answer to the supplied application question. Use 2–3 well-structured paragraphs with clear topic sentences and concrete supporting evidence.",
  };
  const prompt = `${getAuthoredInstruction()}

You are a specialist career application writer for a senior Data Governance professional. Generate ${sectionPrompts[section] || section}. Write in British English.\n\nFORMATTING RULES:\n- Format the document using clean markdown so it reads as a polished, presentation-ready document.\n- Use markdown headings (## for sections, ### for subsections) to create a clear visual structure.\n- Use bullet points or numbered lists where the content is naturally a list (e.g. skills, achievements, recommendations).\n- Write flowing paragraphs for prose sections; avoid large unbroken walls of text.\n- Use **bold** sparingly to emphasise the candidate's key strengths or role-critical keywords.\n- Do NOT wrap the entire document in code blocks or fences.\n- Do NOT add horizontal rules between every paragraph — use headings to separate sections.\n- Ensure there is a blank line between paragraphs and around headings/lists for readability.\n\nGROUNDING RULES:\n- Use only facts present in the Profile or Master CV below.\n- Prioritise the supplied VERIFIED MATCH EVIDENCE when aligning the draft to the job.\n- Never invent or infer experience, qualifications, employers, dates, achievements, metrics, technologies, responsibilities or sector exposure.\n- Do not present a missing requirement as a strength.\n- Return every exact source phrase used to support a factual claim in evidence_quotes. These quotes are checked by the application before the draft is saved.\n\nYOUR PROFILE & CV:\n${JSON.stringify(candidateContext, null, 2)}\n\nVERIFIED MATCH EVIDENCE:\n${JSON.stringify(verifiedMatchEvidence, null, 2)}\n\nKNOWN GAPS OR QUESTIONS:\n${JSON.stringify({
    missing_requirements: match?.missing_requirements || [],
    concerns: match?.concerns || [],
    questions: match?.questions || [],
  }, null, 2)}\n\nJOB:\n${JSON.stringify(job)}\n${questionText ? `\nAPPLICATION QUESTION TO ANSWER:\n${questionText}\n` : ""}`;
  const profileText = JSON.stringify(candidateContext.candidate_profile);
  const cvText = candidateContext.master_cv_text;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryInstruction = attempt === 0 ? "" : `

IMPORTANT CORRECTION: The previous draft could not be verified because at least one evidence quote was paraphrased. Regenerate the complete document. Every item in evidence_quotes must be copied word-for-word from the Master CV text or profile values above. Do not place summaries, conclusions or job requirements in evidence_quotes.`;
    const draft = await invokeAI({
      model: "gpt_5_4",
      prompt: `${prompt}${retryInstruction}`,
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
    }, "application draft");

    const content = typeof draft.content === "string" ? draft.content.trim() : "";
    const evidenceQuotes = Array.isArray(draft.evidence_quotes)
      ? draft.evidence_quotes.map((quote) => String(quote || "").trim()).filter(Boolean)
      : [];
    const unverifiedEvidence = evidenceQuotes.filter(
      (quote) => !hasGroundedEvidence(quote, profileText) && !hasGroundedEvidence(quote, cvText)
    );

    if (content && evidenceQuotes.length > 0 && unverifiedEvidence.length === 0) {
      return { content, evidenceQuotes };
    }
  }

  throw new Error("The draft could not be grounded safely after two attempts. Check that the Master CV contains enough evidence for this role, then try again.");
}

export async function generateInterviewQuestions(job, candidate) {
  const ctx = JSON.stringify({ candidate_profile: candidate });
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `${getCoachingInstruction()}

You are an interview preparation assistant for a senior Data Governance role. Based on the job description and the applicant's profile, generate 8 likely interview questions covering technical Data Governance knowledge, leadership, stakeholder management and behavioural/competency questions. Do not invent employer facts. Return as a JSON array of strings.\n\nYOUR PROFILE:\n${ctx}\n\nJOB:\n${JSON.stringify(job)}`,
    response_json_schema: { type: "object", properties: { questions: { type: "array", items: { type: "string" } } } },
  });
  const result = requireAIObject(res, "interview preparation");
  return Array.isArray(result.questions) ? result.questions : [];
}

export { recommendationBand };

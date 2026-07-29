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

export function buildCandidateContext(candidate, cvs) {
  const readyCVs = (cvs || []).filter(
    (cv) => cv.processing_status === "Ready" && cv.file_uri && cv.extracted_cv_text
  );
  const master = readyCVs.find((cv) => cv.is_master) || readyCVs[0];
  return JSON.stringify(
    {
      profile: {
        full_name: candidate?.full_name,
        current_job_title: candidate?.current_job_title,
        years_total_experience: candidate?.years_total_experience,
        years_leadership: candidate?.years_leadership,
        years_data_governance: candidate?.years_data_governance,
        current_industry: candidate?.current_industry,
        right_to_work: candidate?.right_to_work,
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
      master_cv_text: master?.extracted_cv_text || master?.professional_summary || "",
    },
    null,
    2
  );
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
  const ctx = buildCandidateContext(candidate, cvs);
  const weights = scoring || DEFAULT_WEIGHTS;
  const res = await base44.integrations.Core.InvokeLLM({
    model: "claude_sonnet_4_6",
    prompt: `You are a specialist Data Governance career matching engine. Evaluate how well the candidate matches the job. Be strictly evidence-based: NEVER claim the candidate has a skill, qualification or experience that is not present in the candidate profile or master CV. Distinguish genuine Data Governance roles from roles that are primarily data engineering, software engineering, BI development, data science, ML or database administration. Related technical roles should score lower unless governance/quality/controls/stewardship/metadata/regulatory/leadership responsibilities are substantial.\n\nApply these scoring weights (they sum to 100):\n${JSON.stringify(weights)}\n\nCompute a total_score from 0 to 100 and assign recommendation by band:\n- 85-100: Excellent Match\n- 70-84: Strong Match\n- 55-69: Possible Match\n- 40-54: Weak Match\n- 0-39: Do Not Apply\n\nApply hard-stop rules where relevant (do not delete the job, just flag in hard_stops and lower the score). Hard stops include:\n${JSON.stringify(DEFAULT_HARD_STOPS)}\n\nProvide specific, evidence-based reasons. For missing_requirements list what the candidate lacks. For questions list things to investigate. Suggested CV should be one of the candidate's CV types. Suggested deadline should be the closing date if known else within 7 days. Return JSON per schema.\n\nCANDIDATE:\n${ctx}\n\nJOB:\n${JSON.stringify(job)}`,
    response_json_schema: {
      type: "object",
      properties: {
        total_score: { type: "number" },
        recommendation: { type: "string" },
        confidence: { type: "string" },
        strong_reasons: { type: "array", items: { type: "string" } },
        partial_reasons: { type: "array", items: { type: "string" } },
        missing_requirements: { type: "array", items: { type: "string" } },
        transferable_strengths: { type: "array", items: { type: "string" } },
        concerns: { type: "array", items: { type: "string" } },
        questions: { type: "array", items: { type: "string" } },
        hard_stops: { type: "array", items: { type: "string" } },
        suggested_cv: { type: "string" },
        application_priority: { type: "string" },
        suggested_deadline: { type: "string" },
        recommended_action: { type: "string" },
        breakdown: { type: "object", additionalProperties: true },
      },
    },
  });
  return res;
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

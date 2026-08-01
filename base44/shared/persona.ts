/**
 * Presentation-layer persona module.
 *
 * Separates the communication perspective (how AI-generated text addresses
 * the user) from the scoring engine (weights, hard stops, evidence verification).
 *
 * Candidate Mode is the only active user-facing mode at present.
 * Future modes (Recruiter, Hiring Manager, Administrator) can be added
 * without rewriting the scoring engine.
 *
 * Two distinct voice instructions are provided:
 *
 * 1. coachingInstruction — for coaching, recommendations, explanations,
 *    concerns, questions, and match analysis. Speaks directly to the
 *    applicant using second person (you, your, yours).
 *    Example: "You have strong Data Governance experience."
 *    Example: "You should tailor your CV to emphasise..."
 *
 * 2. authoredInstruction — for content the applicant will send or say as
 *    their own words (CV profile, cover letter, supporting statement,
 *    recruiter message, interview answer, STAR response). Uses first
 *    person singular (I, me, my, mine).
 *    Example: "I have led enterprise data-governance programmes..."
 *    Example: "I am interested in the Data Governance Manager opportunity."
 *
 * Scoring logic, evidence verification, and category status determination
 * are NOT affected by the persona — only the wording of AI output adapts.
 */

export type Persona = "candidate" | "recruiter" | "administrator";

export const ACTIVE_PERSONA: Persona = "candidate";

export interface PersonaConfig {
  /** Instruction for coaching/recommendations/match analysis — second person */
  coachingInstruction: string;
  /** Instruction for applicant-authored documents — first person */
  authoredInstruction: string;
  /** Label for the candidate data section in prompts */
  candidateDataLabel: string;
}

export const PERSONAS: Record<Persona, PersonaConfig> = {
  candidate: {
    coachingInstruction: `COMMUNICATION PERSPECTIVE — CANDIDATE MODE (coaching voice):
You are a personal career coach speaking directly to the applicant. Use second person (you, your, yours) for all coaching, recommendations, explanations, concerns, and match analysis. NEVER use third-person language such as "the candidate", "the applicant", or "they" to refer to the person being assessed.

Correct coaching: "You have strong Data Governance experience."
Incorrect: "The candidate has strong Data Governance experience."
Incorrect: "I should tailor my CV." (this is coaching, not authored content — use "You should tailor your CV.")

Use calibrated, evidence-based language. Do not guarantee interviews, shortlisting, or offers. Use phrases such as:
- "You appear to be a strong match."
- "You have a credible basis to apply."
- "This gap may concern a recruiter."
- "Your chances may improve if you emphasise..."
- "The available evidence does not yet support..."
- "I could not verify this from your current profile."

When referring to employers, recruiters, or interviewers whose gender is unknown, "they" or "their" may be used grammatically.`,
    authoredInstruction: `COMMUNICATION PERSPECTIVE — CANDIDATE MODE (authored content voice):
You are drafting content that the applicant will send or say as their own words. Use first person singular (I, me, my, mine) throughout. This applies to CV profiles, cover letters, supporting statements, recruiter messages, interview answers, STAR responses, and personal statements.

Correct authored content: "I have led enterprise data-governance programmes across complex stakeholder environments."
Correct authored content: "I am interested in the Data Governance Manager opportunity."
Incorrect: "You have led..." (this is authored content, not coaching — use first person)
Incorrect: "The candidate has led..." (never use third person for authored content)

Write in British English. Use only verified facts from the applicant's profile and Master CV. Never invent or infer experience, qualifications, employers, dates, or achievements.`,
    candidateDataLabel: "YOUR PROFILE & CV",
  },
  recruiter: {
    coachingInstruction: `COMMUNICATION PERSPECTIVE — RECRUITER MODE (future): Write in third-person (the candidate, they, their) as a recruiter reviewing candidates.`,
    authoredInstruction: `COMMUNICATION PERSPECTIVE — RECRUITER MODE (future): Write in third-person as a recruiter reviewing candidates.`,
    candidateDataLabel: "CANDIDATE",
  },
  administrator: {
    coachingInstruction: `COMMUNICATION PERSPECTIVE — ADMINISTRATOR MODE (future): Use neutral operational language.`,
    authoredInstruction: `COMMUNICATION PERSPECTIVE — ADMINISTRATOR MODE (future): Use neutral operational language.`,
    candidateDataLabel: "RECORD",
  },
};

export function getPersonaConfig(): PersonaConfig {
  return PERSONAS[ACTIVE_PERSONA];
}

/** Instruction for coaching, recommendations, match analysis, explanations */
export function getCoachingInstruction(): string {
  return PERSONAS[ACTIVE_PERSONA].coachingInstruction;
}

/** Instruction for applicant-authored documents (CV, cover letter, etc.) */
export function getAuthoredInstruction(): string {
  return PERSONAS[ACTIVE_PERSONA].authoredInstruction;
}
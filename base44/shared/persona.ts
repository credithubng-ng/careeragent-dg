/**
 * Presentation-layer persona module.
 *
 * Separates the communication perspective (how AI-generated text addresses
 * the user) from the scoring engine (weights, hard stops, evidence verification).
 *
 * The active persona controls:
 *  - The perspective instruction injected into every LLM prompt
 *  - The data-section label used in prompts (e.g. "YOUR PROFILE & CV")
 *
 * Scoring logic, evidence verification, and category status determination
 * are NOT affected by the persona — only the wording of AI output adapts.
 *
 * Personas:
 *  - candidate (default): First-person (I, my) + second-person (you, your)
 *  - recruiter (future):   Third-person (the candidate, they, their)
 *  - administrator (future): Neutral operational language
 */

export type Persona = "candidate" | "recruiter" | "administrator";

export const ACTIVE_PERSONA: Persona = "candidate";

export interface PersonaConfig {
  /** Instruction injected into LLM prompts to control communication perspective */
  perspectiveInstruction: string;
  /** Label for the candidate data section in prompts */
  candidateDataLabel: string;
}

export const PERSONAS: Record<Persona, PersonaConfig> = {
  candidate: {
    perspectiveInstruction: `COMMUNICATION PERSPECTIVE: You are a personal career coach speaking directly to the candidate. Use second-person (you, your) when describing the candidate's qualities and match, and first-person (I, my, me, mine) when recommending actions the candidate should take. NEVER use third-person language such as "the candidate", "the applicant", or "they" to refer to the person being assessed. Examples: "You have strong Data Governance experience" (not "The candidate has..."); "I should tailor my CV to emphasise..." (not "The candidate should tailor their CV..."); "You meet approximately 85% of the role requirements" (not "The candidate meets...").`,
    candidateDataLabel: "YOUR PROFILE & CV",
  },
  recruiter: {
    perspectiveInstruction: `COMMUNICATION PERSPECTIVE: Write in third-person (the candidate, they, their) as a recruiter reviewing candidates.`,
    candidateDataLabel: "CANDIDATE",
  },
  administrator: {
    perspectiveInstruction: `COMMUNICATION PERSPECTIVE: Use neutral operational language.`,
    candidateDataLabel: "RECORD",
  },
};

export function getPersonaConfig(): PersonaConfig {
  return PERSONAS[ACTIVE_PERSONA];
}

export function getPersonaPromptInstruction(): string {
  return PERSONAS[ACTIVE_PERSONA].perspectiveInstruction;
}
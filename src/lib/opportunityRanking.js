import { daysUntil } from "./format";
import { classifyJob } from "./careerAI";

export const OPPORTUNITY_LEVELS = {
  A: { code: "A", label: "Priority A — Apply Immediately", tone: "green", rank: 0 },
  B: { code: "B", label: "Priority B — Strong Opportunity", tone: "green", rank: 1 },
  C: { code: "C", label: "Priority C — Consider", tone: "amber", rank: 2 },
  D: { code: "D", label: "Priority D — Low Priority", tone: "slate", rank: 3 },
  DNA: { code: "DNA", label: "Do Not Apply", tone: "rose", rank: 4 },
};

// Phrases indicating sponsorship is NOT available
const SPONSORSHIP_UNAVAILABLE_PHRASES = [
  "no sponsorship",
  "sponsorship unavailable",
  "sponsorship not available",
  "sponsorship is not available",
  "sponsorship not offered",
  "sponsorship is not offered",
  "unable to sponsor",
  "unable to offer sponsorship",
  "will not sponsor",
  "cannot sponsor",
  "cannot offer sponsorship",
  "no visa sponsorship",
  "no longer sponsor",
  "must already have the right to work in the uk",
  "must have the right to work in the uk",
  "must already have unrestricted right to work",
  "unrestricted right to work",
  "existing right to work",
  "existing unrestricted right to work",
  "right to work in the uk required",
  "already have the right to work",
];

// Phrases indicating sponsorship IS available
const SPONSORSHIP_AVAILABLE_PHRASES = [
  "sponsorship available",
  "sponsorship is available",
  "skilled worker sponsorship",
  "skilled worker visa sponsorship",
  "we can sponsor",
  "we offer sponsorship",
  "sponsorship offered",
  "visa sponsorship available",
];

// Phrases indicating UK/British citizenship is required
const CITIZENSHIP_PHRASES = [
  "uk citizen",
  "british citizen",
  "uk citizenship",
  "british citizenship",
  "must be a uk citizen",
  "must be a british citizen",
  "uk passport holder",
  "british passport holder",
  "uk passport required",
  "british passport required",
];

function buildAdvertText(job) {
  const parts = [
    job?.job_description,
    job?.responsibilities,
    job?.essential_requirements,
    job?.desirable_requirements,
    job?.right_to_work_requirements,
    job?.security_clearance_requirement,
    job?.required_qualifications,
  ].filter(Boolean);
  return parts.join(" \n ").toLowerCase();
}

function includesAny(text, phrases) {
  return phrases.some((p) => text.includes(p));
}

/**
 * Assess right-to-work and sponsorship requirements.
 *
 * Uses the Candidate right-to-work status and the wording of the job advert.
 *
 * For a candidate who requires sponsorship:
 *  - Advert says sponsorship not available → hard stop
 *  - Advert requires existing unrestricted UK right to work → hard stop
 *  - Advert requires UK/British citizenship → hard stop
 *  - Advert explicitly offers sponsorship → no hard stop
 *  - Advert is silent → confirmation warning (not automatic rejection)
 *
 * For a candidate with unrestricted UK right to work or British citizenship:
 *  - No sponsorship-related hard stop
 *  - Only other requirements (security clearance, nationality restriction)
 *    can produce a hard stop, and those come from the match analysis
 */
export function assessRightToWork(job, candidate) {
  const candidateRtw = candidate?.right_to_work || "";
  const requiresSponsorship = candidateRtw === "UK Visa Sponsorship Required";
  const hasUnrestrictedUK =
    candidateRtw === "UK Citizen" || candidateRtw === "UK ILR/Settled";

  const advertText = buildAdvertText(job);
  const hardStops = [];
  const warnings = [];

  if (requiresSponsorship) {
    const saysUnavailable = includesAny(advertText, SPONSORSHIP_UNAVAILABLE_PHRASES);
    // Only check for available phrasing if no unavailable phrasing was found,
    // to avoid "no sponsorship available" matching "sponsorship available"
    const saysAvailable = !saysUnavailable && includesAny(advertText, SPONSORSHIP_AVAILABLE_PHRASES);
    const requiresCitizenship = includesAny(advertText, CITIZENSHIP_PHRASES);

    if (requiresCitizenship) {
      hardStops.push("Right-to-work: advert requires UK/British citizenship");
    }
    if (saysUnavailable) {
      hardStops.push("Right-to-work: sponsorship is not available for this role");
    }
    // If explicitly offers sponsorship, no hard stop
    // If silent about sponsorship, show a confirmation warning
    if (!saysUnavailable && !saysAvailable && !requiresCitizenship) {
      warnings.push(
        "Right-to-work position requires confirmation — check whether sponsorship is available before applying"
      );
    }
  }

  // For candidates with unrestricted UK right to work or British citizenship:
  // Do not add a sponsorship-related hard stop.
  // Security clearance and other nationality restrictions are handled
  // separately by the match hard_stops, not here.

  return { hardStops, warnings };
}

/**
 * Rank a job opportunity using match score, closing date, salary alignment,
 * right-to-work, hard stops, and whether the role is genuine Data Governance.
 *
 * A role must NOT receive Priority A when:
 *  - There is a verified hard stop
 *  - The match evidence is insufficient
 *  - The closing date has passed
 *  - The role is mainly technical data engineering
 *  - The salary is materially below Angel's minimum
 *  - Right-to-work requirements cannot be met
 */
export function rankOpportunity(job, match, candidate) {
  const blockingReasons = [];
  const reasons = [];
  const warnings = [];

  // Hard stops from match analysis
  if (match?.hard_stops?.length > 0) {
    blockingReasons.push(`Hard stop: ${match.hard_stops.join("; ")}`);
  }

  // Insufficient evidence / no match run
  if (!match || match.confidence === "Insufficient evidence" || match.total_score == null) {
    blockingReasons.push("Match evidence is insufficient — run AI Match Analysis first");
  }

  // Closing date passed (only blocks when a closing date exists and is in the past)
  const closeDays = daysUntil(job?.closing_date);
  if (closeDays != null && closeDays < 0) {
    blockingReasons.push("Closing date has passed");
  }

  // No closing date — confirmation warning (not a block)
  if (!job?.closing_date && !job?.vacancy_confirmed_active) {
    warnings.push("No closing date stated — confirm the vacancy is still active");
  }

  // Technical role check
  const classification = classifyJob(job || {});
  if (classification.isTechnical && !classification.isGovernance) {
    blockingReasons.push("Role is primarily technical data engineering rather than Data Governance");
  }

  // Salary below minimum
  const minSalary = Number(candidate?.min_salary);
  const jobMax = Number(job?.salary_max);
  const jobMin = Number(job?.salary_min);
  if (Number.isFinite(minSalary) && minSalary > 0) {
    const topSalary = Number.isFinite(jobMax) && jobMax > 0 ? jobMax : jobMin;
    if (Number.isFinite(topSalary) && topSalary > 0 && topSalary < minSalary) {
      blockingReasons.push(`Salary is materially below your minimum of £${minSalary.toLocaleString("en-GB")}`);
    }
  }

  // Right-to-work requirements
  const rtw = assessRightToWork(job, candidate);
  blockingReasons.push(...rtw.hardStops);
  warnings.push(...rtw.warnings);

  // If any blocking reason → Do Not Apply
  if (blockingReasons.length > 0) {
    return {
      level: "DNA",
      ...OPPORTUNITY_LEVELS.DNA,
      explanation: blockingReasons[0],
      reasons: blockingReasons,
      blockingReasons,
      confirmationWarnings: warnings,
    };
  }

  const score = match?.total_score ?? 0;

  // Priority A: strong score (>=80)
  if (score >= 80) {
    reasons.push(`Strong match score of ${score}/100`);
    if (closeDays != null && closeDays <= 7) {
      reasons.push(`Closing in ${closeDays} day${closeDays === 1 ? "" : "s"} — act quickly`);
    } else if (closeDays != null) {
      reasons.push(`Closing in ${closeDays} days`);
    }
    return {
      level: "A",
      ...OPPORTUNITY_LEVELS.A,
      explanation: reasons.join(". "),
      reasons,
      blockingReasons: [],
      confirmationWarnings: warnings,
    };
  }

  // Priority B: good match (65–79)
  if (score >= 65) {
    reasons.push(`Good match score of ${score}/100`);
    if (closeDays != null && closeDays <= 3) {
      reasons.push(`Closing soon — prioritise this application`);
    }
    return {
      level: "B",
      ...OPPORTUNITY_LEVELS.B,
      explanation: reasons.join(". "),
      reasons,
      blockingReasons: [],
      confirmationWarnings: warnings,
    };
  }

  // Priority C: possible match (45–64)
  if (score >= 45) {
    reasons.push(`Possible match score of ${score}/100 — review gaps before investing time`);
    if (match?.missing_requirements?.length) {
      reasons.push(`Missing: ${match.missing_requirements.slice(0, 3).join(", ")}`);
    }
    return {
      level: "C",
      ...OPPORTUNITY_LEVELS.C,
      explanation: reasons.join(". "),
      reasons,
      blockingReasons: [],
      confirmationWarnings: warnings,
    };
  }

  // Priority D: weak match
  reasons.push(`Weak match score of ${score}/100 — limited alignment with your profile`);
  return {
    level: "D",
    ...OPPORTUNITY_LEVELS.D,
    explanation: reasons.join(". "),
    reasons,
    blockingReasons: [],
    confirmationWarnings: warnings,
  };
}
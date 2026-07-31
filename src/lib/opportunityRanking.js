import { daysUntil } from "./format";
import { classifyJob } from "./careerAI";

export const OPPORTUNITY_LEVELS = {
  A: { code: "A", label: "Priority A — Apply Immediately", tone: "green", rank: 0 },
  B: { code: "B", label: "Priority B — Strong Opportunity", tone: "green", rank: 1 },
  C: { code: "C", label: "Priority C — Consider", tone: "amber", rank: 2 },
  D: { code: "D", label: "Priority D — Low Priority", tone: "slate", rank: 3 },
  DNA: { code: "DNA", label: "Do Not Apply", tone: "rose", rank: 4 },
};

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

  // Hard stops
  if (match?.hard_stops?.length > 0) {
    blockingReasons.push(`Hard stop: ${match.hard_stops.join("; ")}`);
  }

  // Insufficient evidence / no match run
  if (!match || match.confidence === "Insufficient evidence" || match.total_score == null) {
    blockingReasons.push("Match evidence is insufficient — run AI Match Analysis first");
  }

  // Closing date passed
  const closeDays = daysUntil(job?.closing_date);
  if (closeDays != null && closeDays < 0) {
    blockingReasons.push("Closing date has passed");
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
  const rtw = String(job?.right_to_work_requirements || "").toLowerCase();
  const candidateRtw = candidate?.right_to_work || "";
  if (rtw.includes("sponsorship") && candidateRtw && !rtw.includes(candidateRtw.toLowerCase().split(" ")[0])) {
    if (candidateRtw === "UK Visa Sponsorship Required" && !rtw.includes("sponsorship")) {
      blockingReasons.push("Right-to-work requirements cannot be met — sponsorship not offered");
    }
  }
  if ((rtw.includes("uk citizen") || rtw.includes("british citizen")) && candidateRtw === "UK Visa Sponsorship Required") {
    blockingReasons.push("Right-to-work requirements cannot be met — UK citizenship required");
  }

  // If any blocking reason → Do Not Apply
  if (blockingReasons.length > 0) {
    return {
      level: "DNA",
      ...OPPORTUNITY_LEVELS.DNA,
      explanation: blockingReasons[0],
      reasons: blockingReasons,
      blockingReasons,
    };
  }

  const score = match?.total_score ?? 0;

  // Priority A: strong score (>=80) and closing soon or excellent match
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
  };
}
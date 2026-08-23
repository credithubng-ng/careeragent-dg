export const OPPORTUNITY_TYPES = [
  "Permanent Employment",
  "Contract or Interim",
  "Consulting Engagement",
];

export function classifyOpportunityType(opportunity = {}) {
  if (OPPORTUNITY_TYPES.includes(opportunity.opportunity_type)) return opportunity.opportunity_type;

  const text = `${opportunity.job_title || ""} ${opportunity.role_summary || ""} ${opportunity.job_description || ""}`;
  if (/\bconsultant|consulting|advisory|fractional|maturity assessment|invitation to tender|request for proposal|statement of work\b/i.test(text)) {
    return "Consulting Engagement";
  }
  if (["Contract", "Interim", "Fixed Term"].includes(opportunity.employment_type)) {
    return "Contract or Interim";
  }
  return "Permanent Employment";
}

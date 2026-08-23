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
  const title = String(job?.job_title || "").toLowerCase();
  const isGovernance = GOVERNANCE_TITLES.some((item) => title.includes(item.toLowerCase()));
  const isTechnical = TECHNICAL_TITLES.some((item) => title.includes(item.toLowerCase())) && !isGovernance;
  return { isGovernance, isTechnical };
}

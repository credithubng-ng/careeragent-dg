// Shared utilities for Opportunity Intelligence pages.
// Source type icons, status badge styles, and default seed data.

import {
  Mail, Hand, ClipboardPaste, Link2, FileText, Chrome,
  Building2, Newspaper, Users, UserCheck, Code, Rss, Bot, HelpCircle,
} from "lucide-react";

export const SOURCE_TYPE_ICONS = {
  "Email": Mail,
  "Manual Entry": Hand,
  "Paste Job Description": ClipboardPaste,
  "URL Import": Link2,
  "PDF Upload": FileText,
  "Browser Extension": Chrome,
  "Employer Career Site": Building2,
  "Job Board": Newspaper,
  "Recruitment Agency": Users,
  "Referral": UserCheck,
  "API Feed": Code,
  "RSS Feed": Rss,
  "Scheduled Search Agent": Bot,
  "Other": HelpCircle,
};

export const MONITORING_STATUS_STYLES = {
  "Active": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Paused": "bg-amber-100 text-amber-700 border-amber-200",
  "Manual Only": "bg-slate-100 text-slate-600 border-slate-200",
  "Configuration Required": "bg-orange-100 text-orange-700 border-orange-200",
  "Error": "bg-rose-100 text-rose-700 border-rose-200",
  "Archived": "bg-slate-100 text-slate-400 border-slate-200",
};

export const EMPLOYER_PRIORITY_STYLES = {
  "Critical": "bg-rose-100 text-rose-700 border-rose-200",
  "High": "bg-amber-100 text-amber-700 border-amber-200",
  "Medium": "bg-blue-100 text-blue-700 border-blue-200",
  "Low": "bg-slate-100 text-slate-600 border-slate-200",
};

export const RULE_TYPE_STYLES = {
  "Include": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Exclude": "bg-rose-100 text-rose-700 border-rose-200",
  "Boost": "bg-blue-100 text-blue-700 border-blue-200",
  "Reduce Priority": "bg-amber-100 text-amber-700 border-amber-200",
  "Require Review": "bg-orange-100 text-orange-700 border-orange-200",
  "Hard Stop": "bg-rose-100 text-rose-700 border-rose-200",
};

export const RUN_STATUS_STYLES = {
  "Running": "bg-blue-100 text-blue-700 border-blue-200",
  "Completed": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Failed": "bg-rose-100 text-rose-700 border-rose-200",
  "Partially Completed": "bg-amber-100 text-amber-700 border-amber-200",
  "Skipped": "bg-slate-100 text-slate-500 border-slate-200",
};

export const AGENT_STATUS_STYLES = {
  "Active": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Paused": "bg-amber-100 text-amber-700 border-amber-200",
  "Configuration Required": "bg-orange-100 text-orange-700 border-orange-200",
  "Not Yet Implemented": "bg-slate-100 text-slate-500 border-slate-200",
  "Error": "bg-rose-100 text-rose-700 border-rose-200",
};

export const SUGGESTED_JOB_TITLES = [
  "Head of Data Governance",
  "Senior Data Governance Manager",
  "Data Governance Manager",
  "Data Governance Lead",
  "Data Quality Manager",
  "Head of Data Quality",
  "Data Management Lead",
  "Information Governance Manager",
  "AI Governance Manager",
  "AI Governance Lead",
  "Responsible AI Governance",
  "Data Risk and Controls Manager",
  "Metadata Manager",
  "Data Stewardship Lead",
  "Chief Data Office Governance Lead",
  "Master Data Management Lead",
  "Data Policy Manager",
  "Data Assurance Manager",
  "Data Governance Consultant",
  "Senior Data Governance Consultant",
  "Data Governance Advisory Lead",
  "Data Governance Programme Consultant",
  "Fractional Data Governance Lead",
];

export const SUGGESTED_KEYWORDS = [
  "Data Governance", "Data Quality", "Data Management", "Information Governance",
  "Metadata", "Data Lineage", "Data Stewardship", "Master Data Management",
  "Data Controls", "Data Risk", "AI Governance", "Responsible AI",
  "Model Governance", "Data Policy", "Regulatory Data",
];

export const SUGGESTED_CONSULTING_KEYWORDS = [
  "Data Governance Consultant", "Data Governance Advisory", "Data Governance Assessment",
  "Data Governance Maturity Assessment", "Data Governance Framework", "Data Governance Roadmap",
  "Data Management Consultant", "Data Quality Consultant", "Data Strategy Consultant",
  "Information Governance Consultant", "Interim Data Governance", "Fractional Data Governance",
  "Request for Proposal", "Invitation to Tender", "Statement of Work",
];

export const SUGGESTED_EXCLUDED_TITLES = [
  "Graduate", "Intern", "Junior", "Apprentice",
  "Data Engineer", "Software Engineer", "SQL Developer",
  "BI Developer", "Data Scientist", "Machine Learning Engineer",
  "Database Administrator",
];

export const STARTER_EMPLOYERS = [
  { employer_name: "HSBC", industry: "Banking and financial services" },
  { employer_name: "Lloyds Banking Group", industry: "Banking and financial services" },
  { employer_name: "NatWest Group", industry: "Banking and financial services" },
  { employer_name: "Barclays", industry: "Banking and financial services" },
  { employer_name: "Santander UK", industry: "Banking and financial services" },
  { employer_name: "Nationwide", industry: "Banking and financial services" },
  { employer_name: "Bank of England", industry: "Banking and financial services" },
  { employer_name: "Financial Conduct Authority", industry: "Banking and financial services" },
  { employer_name: "Standard Chartered", industry: "Banking and financial services" },
  { employer_name: "Virgin Money", industry: "Banking and financial services" },
  { employer_name: "BDO", industry: "Professional services and consulting" },
  { employer_name: "Deloitte", industry: "Professional services and consulting" },
  { employer_name: "EY", industry: "Professional services and consulting" },
  { employer_name: "KPMG", industry: "Professional services and consulting" },
  { employer_name: "PwC", industry: "Professional services and consulting" },
  { employer_name: "Accenture", industry: "Professional services and consulting" },
  { employer_name: "Capgemini", industry: "Professional services and consulting" },
  { employer_name: "PA Consulting", industry: "Professional services and consulting" },
  { employer_name: "BearingPoint", industry: "Professional services and consulting" },
  { employer_name: "CGI", industry: "Professional services and consulting" },
  { employer_name: "Aviva", industry: "Insurance" },
  { employer_name: "Legal and General", industry: "Insurance" },
  { employer_name: "Phoenix Group", industry: "Insurance" },
  { employer_name: "Zurich", industry: "Insurance" },
  { employer_name: "AXA", industry: "Insurance" },
  { employer_name: "AIG", industry: "Insurance" },
  { employer_name: "Admiral", industry: "Insurance" },
  { employer_name: "Direct Line Group", industry: "Insurance" },
  { employer_name: "Microsoft", industry: "Technology and telecommunications" },
  { employer_name: "Amazon", industry: "Technology and telecommunications" },
  { employer_name: "Google", industry: "Technology and telecommunications" },
  { employer_name: "Oracle", industry: "Technology and telecommunications" },
  { employer_name: "SAP", industry: "Technology and telecommunications" },
  { employer_name: "ServiceNow", industry: "Technology and telecommunications" },
  { employer_name: "BT", industry: "Technology and telecommunications" },
  { employer_name: "Vodafone", industry: "Technology and telecommunications" },
  { employer_name: "Virgin Media O2", industry: "Technology and telecommunications" },
  { employer_name: "Sky", industry: "Technology and telecommunications" },
  { employer_name: "Civil Service", industry: "Public sector and health" },
  { employer_name: "NHS England", industry: "Public sector and health" },
  { employer_name: "HMRC", industry: "Public sector and health" },
  { employer_name: "Cabinet Office", industry: "Public sector and health" },
  { employer_name: "Department for Work and Pensions", industry: "Public sector and health" },
  { employer_name: "Ministry of Justice", industry: "Public sector and health" },
  { employer_name: "Local Government", industry: "Public sector and health" },
  { employer_name: "National Grid", industry: "Utilities and infrastructure" },
  { employer_name: "Thames Water", industry: "Utilities and infrastructure" },
  { employer_name: "Severn Trent", industry: "Utilities and infrastructure" },
  { employer_name: "Network Rail", industry: "Utilities and infrastructure" },
  { employer_name: "Transport for London", industry: "Utilities and infrastructure" },
];

export const DEFAULT_AGENTS = [
  { agent_name: "Email Discovery Agent", agent_type: "Email Discovery Agent", status: "Not Yet Implemented" },
  { agent_name: "Target Employer Agent", agent_type: "Target Employer Agent", status: "Not Yet Implemented" },
  { agent_name: "Job Board Agent", agent_type: "Job Board Agent", status: "Not Yet Implemented" },
  { agent_name: "Recruitment Agency Agent", agent_type: "Recruitment Agency Agent", status: "Not Yet Implemented" },
  { agent_name: "Browser Extension Intake Agent", agent_type: "Browser Extension Intake Agent", status: "Not Yet Implemented" },
  { agent_name: "Match Analysis Agent", agent_type: "Match Analysis Agent", status: "Not Yet Implemented" },
  { agent_name: "Notification Agent", agent_type: "Notification Agent", status: "Not Yet Implemented" },
];

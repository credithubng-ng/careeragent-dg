import { format, parseISO, differenceInDays, isValid } from "date-fns";

export const ukDate = (d) => {
  if (!d) return "";
  try {
    const parsed = typeof d === "string" ? parseISO(d) : new Date(d);
    return isValid(parsed) ? format(parsed, "dd/MM/yyyy") : String(d);
  } catch {
    return String(d);
  }
};

export const ukDateTime = (d) => {
  if (!d) return "";
  try {
    const parsed = typeof d === "string" ? parseISO(d) : new Date(d);
    return isValid(parsed) ? format(parsed, "dd/MM/yyyy HH:mm") : String(d);
  } catch {
    return String(d);
  }
};

export const gbp = (n) => {
  if (n === null || n === undefined || n === "") return "";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(num);
};

export const daysUntil = (d) => {
  if (!d) return null;
  try {
    const parsed = typeof d === "string" ? parseISO(d) : new Date(d);
    if (!isValid(parsed)) return null;
    return differenceInDays(parsed, new Date());
  } catch {
    return null;
  }
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const formatSalary = (job) => {
  const min = Number(job?.salary_min) || 0;
  const max = Number(job?.salary_max) || 0;

  if (job?.salary_description && job.salary_description.trim()) {
    return job.salary_description.trim();
  }

  if (min === 0 && max === 0) return "Salary Unknown";
  if (min === max && min > 0) return gbp(min);
  if (min > 0 && max > 0) return `${gbp(min)}–${gbp(max)}`;
  if (min > 0) return `From ${gbp(min)}`;
  if (max > 0) return `Up to ${gbp(max)}`;
  return "Salary Unknown";
};

export const recommendationBand = (score) => {
  if (score == null) return null;
  if (score >= 90) return "Excellent Match";
  if (score >= 80) return "Good Match";
  if (score >= 70) return "Worth Reviewing";
  if (score >= 50) return "Possible Match";
  return "Poor Match";
};
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

export const recommendationBand = (score) => {
  if (score == null) return null;
  if (score >= 85) return "Excellent Match";
  if (score >= 70) return "Strong Match";
  if (score >= 55) return "Possible Match";
  if (score >= 40) return "Weak Match";
  return "Do Not Apply";
};
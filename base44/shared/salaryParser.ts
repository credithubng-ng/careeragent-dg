// UK salary parser — handles annual, daily, hourly rates and non-numeric descriptions.
// Never produces broken values like "£120–£120" (min == max with a range separator).

export interface ParsedSalary {
  min: number;
  max: number;
  description: string;
  period: "yearly" | "daily" | "hourly" | "unknown";
  display: string;
}

const NON_NUMERIC_SALARIES = [
  "competitive", "negotiable", "doe", "market rate", "market-rate",
  "dependent on experience", "commensurate", "tbc", "tba",
];

function toNumber(str: string): number {
  return Number(str.replace(/[^0-9.]/g, "")) || 0;
}

function expandK(value: number): number {
  return value >= 1000 ? value : value * 1000;
}

function formatGbp(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function parseSalary(input: string | number | null | undefined): ParsedSalary {
  if (input == null || String(input).trim() === "") {
    return { min: 0, max: 0, description: "Salary Unknown", period: "unknown", display: "Salary Unknown" };
  }

  const text = String(input).trim();
  const lower = text.toLowerCase();

  // Non-numeric salary descriptions
  if (NON_NUMERIC_SALARIES.some((s) => lower === s || lower.includes(s))) {
    return { min: 0, max: 0, description: text, period: "unknown", display: text };
  }

  // Daily rate: £500/day, £650 per day, £500-£650/day
  const dailyMatch = text.match(/£?\s*([\d,.]+k?)\s*(?:[-–to]+)\s*£?\s*([\d,.]+k?)\s*\/?\s*(?:per\s*)?day/i);
  const dailySingle = text.match(/£?\s*([\d,.]+k?)\s*\/?\s*(?:per\s*)?day/i);

  if (dailyMatch) {
    const min = expandK(toNumber(dailyMatch[1]));
    const max = expandK(toNumber(dailyMatch[2]));
    return {
      min: 0, max: 0, // Don't annualise — store as description
      description: `${formatGbp(min)}–${formatGbp(max)}/day`,
      period: "daily",
      display: `${formatGbp(min)}–${formatGbp(max)}/day`,
    };
  }
  if (dailySingle) {
    const rate = expandK(toNumber(dailySingle[1]));
    return {
      min: 0, max: 0,
      description: `${formatGbp(rate)}/day`,
      period: "daily",
      display: `${formatGbp(rate)}/day`,
    };
  }

  // Hourly rate: £45/hour, £45 per hour
  const hourlyMatch = text.match(/£?\s*([\d,.]+)\s*(?:[-–to]+)\s*£?\s*([\d,.]+)\s*\/?\s*(?:per\s*)?hour/i);
  const hourlySingle = text.match(/£?\s*([\d,.]+)\s*\/?\s*(?:per\s*)?hour/i);

  if (hourlyMatch) {
    const min = toNumber(hourlyMatch[1]);
    const max = toNumber(hourlyMatch[2]);
    return {
      min: 0, max: 0,
      description: `${formatGbp(min)}–${formatGbp(max)}/hour`,
      period: "hourly",
      display: `${formatGbp(min)}–${formatGbp(max)}/hour`,
    };
  }
  if (hourlySingle) {
    const rate = toNumber(hourlySingle[1]);
    return {
      min: 0, max: 0,
      description: `${formatGbp(rate)}/hour`,
      period: "hourly",
      display: `${formatGbp(rate)}/hour`,
    };
  }

  // Annual salary range: £80k-£95k, £80,000-£95,000, £80k to £95k
  const rangeMatch = text.match(/£?\s*([\d,.]+)\s*k?\s*(?:[-–to]+)\s*£?\s*([\d,.]+)\s*k?/i);
  if (rangeMatch) {
    let min = expandK(toNumber(rangeMatch[1]));
    let max = expandK(toNumber(rangeMatch[2]));
    // Prevent broken values like £120–£120
    if (min === max) {
      return {
        min, max,
        description: formatGbp(min),
        period: "yearly",
        display: formatGbp(min),
      };
    }
    if (max < min) [min, max] = [max, min];
    return {
      min, max,
      description: `${formatGbp(min)}–${formatGbp(max)}`,
      period: "yearly",
      display: `${formatGbp(min)}–${formatGbp(max)}`,
    };
  }

  // Single annual salary: £80,000, £75k, 80000
  const singleMatch = text.match(/£?\s*([\d,.]+)\s*k?/i);
  if (singleMatch) {
    const value = expandK(toNumber(singleMatch[1]));
    if (value > 0) {
      return {
        min: value, max: value,
        description: formatGbp(value),
        period: "yearly",
        display: formatGbp(value),
      };
    }
  }

  // Could not parse — return as unknown
  return { min: 0, max: 0, description: "Salary Unknown", period: "unknown", display: "Salary Unknown" };
}

/**
 * Format salary for display in job cards.
 * Handles both numeric min/max fields and string descriptions.
 */
export function formatSalaryDisplay(job: any): string {
  // If we have a salary_description, use the parser to clean it
  if (job.salary_description) {
    const parsed = parseSalary(job.salary_description);
    return parsed.display;
  }

  // If we have numeric min/max
  const min = Number(job.salary_min) || 0;
  const max = Number(job.salary_max) || 0;

  if (min === 0 && max === 0) return "Salary Unknown";
  if (min === max && min > 0) return formatGbp(min);
  if (min > 0 && max > 0) return `${formatGbp(min)}–${formatGbp(max)}`;

  return "Salary Unknown";
}
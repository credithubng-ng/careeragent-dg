const SECTION_HEADINGS = {
  responsibilities: ["responsibilities", "what you'll do", "what you will do", "the role", "key duties"],
  essential_requirements: ["requirements", "what we're looking for", "what we are looking for", "about you", "essential criteria", "required skills", "qualifications"],
  desirable_requirements: ["desirable", "preferred qualifications", "nice to have", "bonus points"],
};

function cleanLines(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function headingKey(line) {
  const normal = line.toLowerCase().replace(/[:–—-]+$/, "").trim();
  return Object.entries(SECTION_HEADINGS).find(([, names]) => names.includes(normal))?.[0] || null;
}

function recoverSections(lines) {
  const sections = {};
  let active = null;
  for (const line of lines) {
    const key = headingKey(line);
    if (key) {
      active = key;
      if (!sections[key]) sections[key] = [];
      continue;
    }
    if (active) sections[active].push(line.replace(/^[•·*-]\s*/, ""));
  }
  return Object.fromEntries(
    Object.entries(sections)
      .map(([key, values]) => [key, values.join("\n").trim()])
      .filter(([, value]) => value.length >= 20)
  );
}

function isLinkedInNoise(line) {
  return /^(about the job|show more|show less|apply|save|share|promoted by|actively recruiting|easy apply|see who|job function|industries|employment type)$/i.test(line)
    || /^\d+\s+(applicants?|connections?)$/i.test(line);
}

export function recoverJobFields(text, extracted = {}) {
  const lines = cleanLines(text);
  const usefulLead = lines.slice(0, 12).filter((line) => !isLinkedInNoise(line));
  const sections = recoverSections(lines);
  const recovered = { ...extracted };

  if (!recovered.job_title && usefulLead[0] && usefulLead[0].length <= 120) {
    recovered.job_title = usefulLead[0];
  }
  if (!recovered.employer && usefulLead[1] && usefulLead[1].length <= 120) {
    recovered.employer = usefulLead[1].split(/\s+[·•]\s+/)[0].trim();
  }
  if (!recovered.location) {
    const locationLine = usefulLead.find((line, index) => index > 0 && (
      /\b(remote|hybrid|on-site|united kingdom|uk|england|scotland|wales|london|manchester|birmingham|leeds|bristol)\b/i.test(line)
    ));
    if (locationLine) {
      const segments = locationLine.split(/\s+[·•]\s+/).map((part) => part.trim());
      recovered.location = segments.find((part, index) =>
        index > 0 && !/^(remote|hybrid|on-site|office)$/i.test(part)
      ) || segments[0];
    }
  }

  for (const [field, value] of Object.entries(sections)) {
    if (!recovered[field] && value) recovered[field] = value;
  }

  if (!recovered.work_arrangement) {
    if (/\bhybrid\b/i.test(text)) recovered.work_arrangement = "Hybrid";
    else if (/\bremote\b/i.test(text)) recovered.work_arrangement = "Remote";
    else if (/\bon[ -]?site\b|\boffice[ -]?based\b/i.test(text)) recovered.work_arrangement = "Office";
  }
  if (!recovered.employment_type) {
    if (/\bfull[ -]?time\b|\bpermanent\b/i.test(text)) recovered.employment_type = "Permanent";
    else if (/\bfixed[ -]?term\b/i.test(text)) recovered.employment_type = "Fixed Term";
    else if (/\bcontract\b/i.test(text)) recovered.employment_type = "Contract";
    else if (/\bpart[ -]?time\b/i.test(text)) recovered.employment_type = "Part-time";
  }

  return recovered;
}

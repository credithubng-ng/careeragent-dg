import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const FETCH_TIMEOUT_MS = 30_000;
const MAX_CONTENT_CHARS = 20_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 5;

const SECURITY_ERROR = 'This URL cannot be retrieved for security reasons.';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

// ─── Security: SSRF Protection ───

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().split('%')[0];
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  return false;
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) return isPrivateIPv6(ip);
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return isPrivateIPv4(ip);
  return false;
}

function isLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === 'localhost' || lower === '::1' || lower.endsWith('.localhost');
}

function isInternalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower.endsWith('.internal') || lower.endsWith('.local')) return true;
  if (lower === 'metadata.google.internal') return true;
  return false;
}

async function resolveHostIps(hostname: string): Promise<string[]> {
  const ips: string[] = [];
  try {
    if (typeof Deno !== 'undefined' && typeof Deno.resolveDns === 'function') {
      try { ips.push(...(await Deno.resolveDns(hostname, 'A'))); } catch { /* ignore */ }
      try { ips.push(...(await Deno.resolveDns(hostname, 'AAAA'))); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return ips;
}

async function isUrlSafe(parsedUrl: URL): Promise<{ safe: boolean; reason?: string }> {
  if (parsedUrl.username || parsedUrl.password) {
    return { safe: false, reason: 'credentials' };
  }
  const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) return { safe: false, reason: 'invalid' };
  if (isLoopbackHost(hostname)) return { safe: false, reason: 'loopback' };
  if (isInternalHostname(hostname)) return { safe: false, reason: 'internal' };
  if (isPrivateIp(hostname)) return { safe: false, reason: 'private' };
  const ips = await resolveHostIps(hostname);
  for (const ip of ips) {
    if (isPrivateIp(ip)) return { safe: false, reason: 'private' };
  }
  return { safe: true };
}

// ─── Restricted Source Detection ───

const RESTRICTED_DOMAINS = [
  'linkedin.com',
  'indeed.com',
  'indeed.co.uk',
  'glassdoor.com',
  'glassdoor.co.uk',
];

const RESTRICTED_DOMAIN_MESSAGES: Record<string, string> = {
  'linkedin.com': 'LinkedIn restricts automatic server-side job retrieval. Open the vacancy in LinkedIn, copy the full job description, and paste it below. The original URL has been preserved.',
  'indeed.com': 'Indeed restricts automatic server-side job retrieval. Open the vacancy on Indeed, copy the full job description, and paste it below. The original URL has been preserved.',
  'indeed.co.uk': 'Indeed restricts automatic server-side job retrieval. Open the vacancy on Indeed, copy the full job description, and paste it below. The original URL has been preserved.',
  'glassdoor.com': 'Glassdoor restricts automatic server-side job retrieval. Open the vacancy on Glassdoor, copy the full job description, and paste it below. The original URL has been preserved.',
  'glassdoor.co.uk': 'Glassdoor restricts automatic server-side job retrieval. Open the vacancy on Glassdoor, copy the full job description, and paste it below. The original URL has been preserved.',
};

const GENERIC_RESTRICTED_MESSAGE = 'This page could not be retrieved automatically — it may require authentication or use JavaScript rendering. Open the vacancy in your browser, copy the full job description, and paste it below. The original URL has been preserved.';

function getRestrictedDomain(hostname: string): string | null {
  const lower = hostname.toLowerCase().replace(/^www\./, '');
  for (const domain of RESTRICTED_DOMAINS) {
    if (lower === domain || lower.endsWith('.' + domain)) return domain;
  }
  return null;
}

const RESTRICTED_TITLE_INDICATORS = [
  'sign in', 'log in', 'login', 'join linkedin', 'join now',
  'authentication', 'access denied', 'captcha', 'security verification',
  'verify you are human', 'are you a real person',
];

const RESTRICTED_CONTENT_INDICATORS = [
  'sign in', 'join linkedin', 'join now', 'log in', 'login',
  'authentication required', 'access denied', 'captcha',
  'enable javascript', 'security verification',
  'are you a real person', 'verify you are human',
  'checking your browser', 'please enable javascript',
  'cookie consent', 'we use cookies',
];

function isRestrictedContent(content: string, pageTitle: string): { restricted: boolean; reason: string } {
  const titleLower = pageTitle.toLowerCase();

  // Short content — likely a JavaScript shell or empty page
  if (content.trim().length < 200) {
    return { restricted: true, reason: 'incomplete' };
  }

  // Title-based detection (high confidence — login/challenge page titles)
  for (const indicator of RESTRICTED_TITLE_INDICATORS) {
    if (titleLower.includes(indicator)) {
      return { restricted: true, reason: 'login_challenge' };
    }
  }

  // Content-based detection (require multiple matches to avoid false positives
  // — a real job description may mention "sign in" once in application instructions)
  const text = content.toLowerCase().slice(0, 5000);
  let matchCount = 0;
  for (const indicator of RESTRICTED_CONTENT_INDICATORS) {
    if (text.includes(indicator)) matchCount++;
  }
  if (matchCount >= 3) {
    return { restricted: true, reason: 'login_challenge' };
  }

  return { restricted: false, reason: '' };
}

// ─── HTML Element Extraction (regex-based, no DOM) ───

/**
 * Find the content between an opening tag at startIdx and its matching close tag.
 * Tracks nesting depth to handle nested elements of the same type.
 */
function findElementContent(html: string, startIdx: number, tagName: string): { content: string; endPos: number } | null {
  const tagEnd = html.indexOf('>', startIdx);
  if (tagEnd === -1) return null;
  if (html[tagEnd - 1] === '/') return { content: '', endPos: tagEnd + 1 };

  const contentStart = tagEnd + 1;
  let depth = 1;
  let pos = contentStart;

  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf('<' + tagName, pos);
    const nextClose = html.indexOf('</' + tagName, pos);
    if (nextClose === -1) return null;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      const nextTagEnd = html.indexOf('>', nextOpen);
      if (nextTagEnd !== -1 && html[nextTagEnd - 1] !== '/') {
        depth++;
      }
      pos = (nextTagEnd !== -1 ? nextTagEnd : nextOpen) + 1;
    } else {
      depth--;
      const closeTagEnd = html.indexOf('>', nextClose);
      if (closeTagEnd === -1) return null;
      pos = closeTagEnd + 1;
      if (depth === 0) {
        return { content: html.slice(contentStart, nextClose), endPos: pos };
      }
    }
  }
  return null;
}

/**
 * Remove all elements of a given tag type (e.g., nav, footer, aside) including content.
 */
function stripElementsByTag(html: string, tagName: string): { html: string; count: number } {
  const openRegex = new RegExp('<' + tagName + '\\b[^>]*>', 'gi');
  const matches: { start: number; end: number }[] = [];
  let match;
  while ((match = openRegex.exec(html)) !== null) {
    if (match[0].endsWith('/>')) continue;
    const block = findElementContent(html, match.index, tagName);
    if (block) matches.push({ start: match.index, end: block.endPos });
  }
  let result = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    result = result.slice(0, matches[i].start) + result.slice(matches[i].end);
  }
  return { html: result, count: matches.length };
}

/**
 * Remove elements whose class or id attribute matches any of the given patterns.
 * patterns is an array of regex strings (without delimiters).
 */
function stripElementsByAttrPattern(html: string, patterns: string[]): { html: string; count: number } {
  const patternStr = patterns.join('|');
  const tagRegex = new RegExp(
    '<(div|section|article|aside|ul|ol|li|nav|footer|header|span|p)\\b[^>]*(' + patternStr + ')[^>]*>',
    'gi'
  );
  const matches: { start: number; end: number }[] = [];
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    if (match[0].endsWith('/>')) continue;
    const tagName = match[1].toLowerCase();
    const block = findElementContent(html, match.index, tagName);
    if (block) matches.push({ start: match.index, end: block.endPos });
  }
  let result = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    result = result.slice(0, matches[i].start) + result.slice(matches[i].end);
  }
  return { html: result, count: matches.length };
}

/**
 * Extract the first element matching any of the given class/id patterns.
 * Returns the HTML content of that element, or null.
 */
function extractContainerByPatterns(html: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    const tagRegex = new RegExp(
      '<(div|section|article|main|aside)\\b[^>]*(' + pattern + ')[^>]*>',
      'gi'
    );
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      if (match[0].endsWith('/>')) continue;
      const tagName = match[1].toLowerCase();
      const block = findElementContent(html, match.index, tagName);
      if (block && block.content.trim()) return block.content;
    }
  }
  return null;
}

// ─── JSON-LD Structured Data Extraction ───

function extractJsonLdBlocks(html: string): any[] {
  const blocks: any[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      if (Array.isArray(data)) {
        blocks.push(...data);
      } else if (data && data['@graph'] && Array.isArray(data['@graph'])) {
        blocks.push(...data['@graph']);
      } else {
        blocks.push(data);
      }
    } catch { /* ignore invalid JSON */ }
  }
  return blocks;
}

function isJobPosting(obj: any): boolean {
  const t = obj?.['@type'];
  return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
}

function findPrimaryJobPosting(
  blocks: any[],
  pageTitle: string,
  pageUrl: string
): { posting: any | null; multiple: boolean; total: number } {
  const jobPostings = blocks.filter(isJobPosting);
  if (jobPostings.length === 0) return { posting: null, multiple: false, total: 0 };
  if (jobPostings.length === 1) return { posting: jobPostings[0], multiple: false, total: 1 };

  const titleLower = pageTitle.toLowerCase();
  const urlLower = pageUrl.toLowerCase();

  // Try URL match
  let primary = jobPostings.find((jp) => {
    const jpUrl = String(jp.url || jp.identifier || '').toLowerCase();
    return jpUrl && urlLower.includes(jpUrl);
  });

  // Try title match
  if (!primary) {
    primary = jobPostings.find((jp) => {
      const jpTitle = String(jp.title || '').toLowerCase();
      return jpTitle && titleLower.includes(jpTitle);
    });
  }

  // Fallback to first
  if (!primary) primary = jobPostings[0];
  return { posting: primary, multiple: true, total: jobPostings.length };
}

function stripHtmlTags(s: string): string {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFieldsFromJobPosting(jp: any): Record<string, any> {
  const result: Record<string, any> = {};
  if (!jp) return result;

  if (jp.title) result.job_title = stripHtmlTags(jp.title);
  if (jp.hiringOrganization?.name) result.employer = stripHtmlTags(jp.hiringOrganization.name);

  if (jp.jobLocation) {
    const loc = Array.isArray(jp.jobLocation) ? jp.jobLocation[0] : jp.jobLocation;
    if (loc?.address) {
      const addr = loc.address;
      const parts = [addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).map(String);
      if (parts.length) result.location = parts.join(', ');
      if (addr.addressCountry) result.country = String(addr.addressCountry);
    }
  }

  if (jp.employmentType) {
    const typeMap: Record<string, string> = {
      FULL_TIME: 'Permanent', PART_TIME: 'Part-time', CONTRACTOR: 'Contract',
      TEMPORARY: 'Contract', INTERN: 'Contract',
    };
    const et = Array.isArray(jp.employmentType) ? jp.employmentType[0] : jp.employmentType;
    result.employment_type = typeMap[String(et)] || '';
  }

  if (jp.datePosted) result.date_posted = String(jp.datePosted).slice(0, 10);
  if (jp.validThrough) result.closing_date = String(jp.validThrough).slice(0, 10);
  if (jp.description) result.job_description = stripHtmlTags(jp.description);
  if (jp.qualifications) result.essential_requirements = stripHtmlTags(jp.qualifications);
  if (jp.responsibilities) result.responsibilities = stripHtmlTags(jp.responsibilities);
  if (jp.skills) {
    result.required_technologies = Array.isArray(jp.skills)
      ? jp.skills.map(String).join(', ')
      : stripHtmlTags(jp.skills);
  }
  if (jp.identifier?.value) result.job_reference = String(jp.identifier.value);

  if (jp.baseSalary?.value) {
    const v = jp.baseSalary.value;
    if (typeof v === 'object') {
      if (v.minValue != null) result.salary_min = Number(v.minValue);
      if (v.maxValue != null) result.salary_max = Number(v.maxValue);
      if (v.currency) result.currency = String(v.currency);
    }
  }

  return result;
}

// ─── Website-Specific Adapters ───

interface Adapter {
  name: string;
  hostPatterns: string[];
  containerPatterns: string[];
}

const ADAPTERS: Adapter[] = [
  {
    name: 'LinkedIn',
    hostPatterns: ['linkedin.com'],
    containerPatterns: [
      'class="[^"]*jobs-description__content[^"]*"',
      'class="[^"]*jobs-box__html-content[^"]*"',
      'id="job-details"',
      'class="[^"]*description__job-description[^"]*"',
    ],
  },
  {
    name: 'Indeed',
    hostPatterns: ['indeed.com', 'indeed.co.uk'],
    containerPatterns: [
      'id="jobDescriptionText"',
      'class="[^"]*jobsearch-JobComponentDescription[^"]*"',
      'class="[^"]*job-description-content[^"]*"',
    ],
  },
  {
    name: 'Reed',
    hostPatterns: ['reed.co.uk'],
    containerPatterns: [
      'class="[^"]*job-description[^"]*"',
      'class="[^"]*details[^"]*"',
    ],
  },
  {
    name: 'CV-Library',
    hostPatterns: ['cv-library.co.uk'],
    containerPatterns: [
      'class="[^"]*job-description[^"]*"',
      'id="job-description"',
    ],
  },
  {
    name: 'Totaljobs',
    hostPatterns: ['totaljobs.com', 'totaljobs.co.uk'],
    containerPatterns: [
      'class="[^"]*job-description[^"]*"',
      'id="job-description"',
    ],
  },
  {
    name: 'NHS Jobs',
    hostPatterns: ['jobs.nhs.uk'],
    containerPatterns: [
      'class="[^"]*vacancy-details[^"]*"',
      'id="vacancy-details"',
    ],
  },
  {
    name: 'Civil Service Jobs',
    hostPatterns: ['civilservicejobs.service.gov.uk'],
    containerPatterns: [
      'class="[^"]*job-detail[^"]*"',
      'id="job-detail"',
    ],
  },
  {
    name: 'Greenhouse',
    hostPatterns: ['boards.greenhouse.io', 'greenhouse.io'],
    containerPatterns: [
      'id="content"',
      'class="[^"]*job-post[^"]*"',
    ],
  },
  {
    name: 'Lever',
    hostPatterns: ['lever.co', 'jobs.lever.co'],
    containerPatterns: [
      'class="[^"]*post[^"]*"',
      'class="[^"]*content-wrapper[^"]*"',
    ],
  },
  {
    name: 'SmartRecruiters',
    hostPatterns: ['smartrecruiters.com'],
    containerPatterns: [
      'class="[^"]*job-description[^"]*"',
      'id="job-description"',
    ],
  },
  {
    name: 'Workday',
    hostPatterns: ['workday', 'myworkdayjobs'],
    containerPatterns: [
      'data-automation-id="jobPostingInstruction"',
      'data-automation-id="jobDescription"',
      'class="[^"]*css-[^\"]*job-description[^"]*"',
    ],
  },
];

function findAdapter(hostname: string): Adapter | null {
  const lower = hostname.toLowerCase();
  for (const adapter of ADAPTERS) {
    if (adapter.hostPatterns.some((p) => lower.includes(p))) return adapter;
  }
  return null;
}

// ─── Unrelated Section Patterns ───

const RELATED_JOBS_PATTERNS = [
  'class="[^"]*related[^"]*job[^"]*"',
  'class="[^"]*similar[^"]*job[^"]*"',
  'class="[^"]*recommend[^"]*job[^"]*"',
  'class="[^"]*suggested[^"]*job[^"]*"',
  'class="[^"]*more[-_ ]?jobs[^"]*"',
  'class="[^"]*featured[-_ ]?jobs[^"]*"',
  'class="[^"]*latest[-_ ]?jobs[^"]*"',
  'class="[^"]*search-result[^"]*"',
  'class="[^"]*people-also-viewed[^"]*"',
  'class="[^"]*job-card[^"]*"',
  'class="[^"]*job-listing[^"]*"',
  'class="[^"]*other-vacanc[^"]*"',
  'class="[^"]*other-opportunit[^"]*"',
  'id="[^"]*related[^"]*job[^"]*"',
  'id="[^"]*similar[^"]*job[^"]*"',
  'id="[^"]*recommend[^"]*job[^"]*"',
  'id="[^"]*more[-_ ]?jobs[^"]*"',
  'id="[^"]*search-result[^"]*"',
];

const NOISE_PATTERNS = [
  'class="[^"]*cookie[^"]*"',
  'class="[^"]*newsletter[^"]*"',
  'class="[^"]*social-share[^"]*"',
  'class="[^"]*social[^-]share[^"]*"',
  'class="[^"]*breadcrumb[^"]*"',
  'class="[^"]*login[^"]*"',
  'class="[^"]*sign-up[^"]*"',
  'class="[^"]*signup[^"]*"',
  'class="[^"]*register[^"]*"',
  'class="[^"]*marketing[^"]*"',
  'class="[^"]*promo[^"]*"',
  'class="[^"]*sidebar[^"]*"',
  'class="[^"]*advert[^"]*"',
  'class="[^"]*banner[^"]*"',
  'id="[^"]*cookie[^"]*"',
  'id="[^"]*newsletter[^"]*"',
  'id="[^"]*sidebar[^"]*"',
  'id="[^"]*breadcrumb[^"]*"',
];

// ─── HTML to Text Conversion ───

function htmlToText(html: string): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  cleaned = cleaned.replace(/<\/?(p|div|br|li|h[1-6]|tr|td|th|section|article|header|footer|nav|aside|main|ul|ol|dl|dd|dt|figure|figcaption|blockquote|pre)[^>]*>/gi, '\n');
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/');

  cleaned = cleaned
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return cleaned;
}

// ─── Main Extraction Pipeline ───

function extractPageContent(
  html: string,
  pageTitle: string,
  pageUrl: string,
  hostname: string
): {
  structuredData: Record<string, any> | null;
  isolatedContent: string;
  rawContent: string;
  extractionSource: string;
  adapterUsed: string | null;
  relatedJobsDetected: number;
  sectionsIgnored: number;
  multipleJobpostings: boolean;
  jobpostingCount: number;
} {
  // 1. Extract JSON-LD structured data (before stripping scripts)
  const jsonLdBlocks = extractJsonLdBlocks(html);
  const { posting: jobPosting, multiple: multipleJp, total: jpCount } = findPrimaryJobPosting(jsonLdBlocks, pageTitle, pageUrl);
  const structuredData = jobPosting ? extractFieldsFromJobPosting(jobPosting) : null;

  // 2. Strip unrelated sections from HTML
  let workingHtml = html;
  let sectionsIgnored = 0;
  let relatedJobsDetected = 0;

  // Strip nav, footer, aside
  for (const tag of ['nav', 'footer', 'aside']) {
    const result = stripElementsByTag(workingHtml, tag);
    workingHtml = result.html;
    sectionsIgnored += result.count;
  }

  // Strip related-jobs sections
  const relatedResult = stripElementsByAttrPattern(workingHtml, RELATED_JOBS_PATTERNS);
  workingHtml = relatedResult.html;
  relatedJobsDetected = relatedResult.count;
  sectionsIgnored += relatedResult.count;

  // Strip noise sections (cookie, newsletter, social, etc.)
  const noiseResult = stripElementsByAttrPattern(workingHtml, NOISE_PATTERNS);
  workingHtml = noiseResult.html;
  sectionsIgnored += noiseResult.count;

  // 3. Try website-specific adapter
  let adapterUsed: string | null = null;
  let isolatedHtml: string | null = null;
  let extractionSource = 'generic_text';

  const adapter = findAdapter(hostname);
  if (adapter) {
    const container = extractContainerByPatterns(workingHtml, adapter.containerPatterns);
    if (container) {
      isolatedHtml = container;
      adapterUsed = adapter.name;
      extractionSource = 'website_adapter';
    }
  }

  // 4. Try generic container extraction (main, article)
  if (!isolatedHtml) {
    const genericContainer = extractContainerByPatterns(workingHtml, [
      'class="[^"]*job-description[^"]*"',
      'id="job-description"',
      'class="[^"]*vacancy[^"]*"',
      'class="[^"]*job-detail[^"]*"',
    ]);
    if (genericContainer) {
      isolatedHtml = genericContainer;
      extractionSource = 'generic_container';
    }
  }

  if (!isolatedHtml) {
    const mainContainer = extractContainerByPatterns(workingHtml, [
      '<main\\b',
    ]);
    if (mainContainer) {
      isolatedHtml = mainContainer;
      extractionSource = 'generic_container';
    }
  }

  if (!isolatedHtml) {
    const articleContainer = extractContainerByPatterns(workingHtml, [
      '<article\\b',
    ]);
    if (articleContainer) {
      isolatedHtml = articleContainer;
      extractionSource = 'generic_container';
    }
  }

  // 5. Convert to text
  let isolatedContent: string;
  if (isolatedHtml) {
    isolatedContent = htmlToText(isolatedHtml);
  } else {
    // Fallback: use the stripped HTML (nav/footer/aside/related already removed)
    isolatedContent = htmlToText(workingHtml);
    extractionSource = 'generic_text';
  }

  // 6. Apply 20K char limit AFTER isolation
  isolatedContent = isolatedContent.slice(0, MAX_CONTENT_CHARS);

  // 7. Generate raw content for diagnostic (from stripped HTML)
  const rawContent = htmlToText(workingHtml).slice(0, MAX_CONTENT_CHARS);

  // 8. If structured data was found, prefer it
  if (structuredData && structuredData.job_title) {
    extractionSource = 'structured_jobposting';
  }

  return {
    structuredData,
    isolatedContent,
    rawContent,
    extractionSource,
    adapterUsed,
    relatedJobsDetected,
    sectionsIgnored,
    multipleJobpostings: multipleJp,
    jobpostingCount: jpCount,
  };
}

// ─── Main Handler ───

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const url = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!url) return Response.json({ error: 'A job URL is required.' }, { status: 400 });

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return Response.json({ error: 'The URL is not valid.' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return Response.json({ error: 'Only http and https URLs are accepted.' }, { status: 400 });
    }

    // Check for known restricted domains before attempting retrieval.
    // These sites block server-side access; do not attempt to bypass.
    const initialHostname = parsedUrl.hostname.replace(/^\[|\]$/g, '').replace(/^www\./, '').toLowerCase();
    const restrictedDomain = getRestrictedDomain(initialHostname);
    if (restrictedDomain) {
      return Response.json({
        status: 'restricted',
        restricted_source: true,
        domain: restrictedDomain,
        message: RESTRICTED_DOMAIN_MESSAGES[restrictedDomain] || GENERIC_RESTRICTED_MESSAGE,
        original_url: url,
      });
    }

    let currentUrl: URL = parsedUrl;
    let response: Response | null = null;
    let redirectCount = 0;

    while (true) {
      const safety = await isUrlSafe(currentUrl);
      if (!safety.safe) {
        return Response.json({ error: SECURITY_ERROR, status: 'error' }, { status: 403 });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);

      try {
        response = await fetch(currentUrl.toString(), {
          signal: controller.signal,
          redirect: 'manual',
          credentials: 'omit',
          headers: FETCH_HEADERS,
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        const msg = fetchError && fetchError.name === 'AbortError'
          ? 'The page took too long to respond.'
          : 'Unable to reach this website.';
        return Response.json({ error: msg, status: 'error' }, { status: 502 });
      }
      clearTimeout(timeoutId);

      if (response.status >= 300 && response.status < 400) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          return Response.json({ error: 'The page redirected too many times.', status: 'error' }, { status: 502 });
        }
        const location = response.headers.get('location');
        if (!location) {
          return Response.json({ error: 'The page returned an invalid redirect.', status: 'error' }, { status: 502 });
        }
        try {
          currentUrl = new URL(location, currentUrl.toString());
        } catch {
          return Response.json({ error: 'The page returned an invalid redirect URL.', status: 'error' }, { status: 502 });
        }
        continue;
      }

      break;
    }

    if (!response || !response.ok) {
      return Response.json({
        error: 'The page could not be retrieved (HTTP ' + (response ? response.status : 0) + ').',
        status: 'error',
      }, { status: 502 });
    }

    var contentType = response.headers.get('content-type') || '';
    if (contentType.indexOf('text/html') === -1 && contentType.indexOf('application/xml') === -1 && contentType.indexOf('text/plain') === -1) {
      return Response.json({ error: 'This URL does not point to a web page.', status: 'error' }, { status: 422 });
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_RESPONSE_BYTES) {
      return Response.json({ error: 'The page is too large to process.', status: 'error' }, { status: 413 });
    }

    var html = await response.text();
    if (html.length > MAX_RESPONSE_BYTES) {
      html = html.slice(0, MAX_RESPONSE_BYTES);
    }

    // Extract page title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/&[^;]+;/g, ' ').trim() : '';

    const hostname = currentUrl.hostname.replace(/^www\./, '');
    const extraction = extractPageContent(html, pageTitle, currentUrl.toString(), hostname);

    if (!extraction.isolatedContent || extraction.isolatedContent.length < 100) {
      return Response.json({
        error: 'No job content could be extracted from this page.',
        status: 'error',
      }, { status: 422 });
    }

    // Validate content for login/challenge/captcha pages (non-restricted domains
    // that still returned an authentication or JavaScript-shell response)
    const contentCheck = isRestrictedContent(extraction.isolatedContent, pageTitle);
    if (contentCheck.restricted) {
      return Response.json({
        status: 'restricted',
        restricted_source: true,
        domain: hostname,
        message: GENERIC_RESTRICTED_MESSAGE,
        original_url: url,
      });
    }

    return Response.json({
      status: 'success',
      page_title: pageTitle,
      content: extraction.isolatedContent,
      raw_content: extraction.rawContent,
      final_url: currentUrl.toString(),
      content_length: extraction.isolatedContent.length,
      extraction_source: extraction.extractionSource,
      adapter_used: extraction.adapterUsed,
      structured_data: extraction.structuredData,
      related_jobs_detected: extraction.relatedJobsDetected,
      sections_ignored: extraction.sectionsIgnored,
      multiple_jobpostings: extraction.multipleJobpostings,
      jobposting_count: extraction.jobpostingCount,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to retrieve the job page.' }, { status: 500 });
  }
}
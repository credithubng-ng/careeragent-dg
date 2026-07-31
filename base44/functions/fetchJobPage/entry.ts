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

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => isNaN(n))) return false;
  const [a, b, c, d] = parts;
  if (a === 0 && b === 0 && c === 0 && d === 0) return true;        // 0.0.0.0
  if (a === 10) return true;                                        // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;                 // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                          // 192.168.0.0/16
  if (a === 127) return true;                                      // 127.0.0.0/8
  if (a === 169 && b === 254) return true;                          // 169.254.0.0/16 (link-local + cloud metadata)
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().split('%')[0]; // drop zone id
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;  // fc00::/7 unique local
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10 link-local
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
  if (lower === 'metadata.google.internal') return true; // GCP metadata
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
  // Reject embedded credentials (user:pass@host)
  if (parsedUrl.username || parsedUrl.password) {
    return { safe: false, reason: 'credentials' };
  }
  // Strip IPv6 brackets: parsedUrl.hostname returns "[::1]" for IPv6 literals.
  const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) return { safe: false, reason: 'invalid' };
  if (isLoopbackHost(hostname)) return { safe: false, reason: 'loopback' };
  if (isInternalHostname(hostname)) return { safe: false, reason: 'internal' };
  // If hostname is an IP literal, check directly
  if (isPrivateIp(hostname)) return { safe: false, reason: 'private' };
  // Resolve hostname and reject if any resolved IP is private
  const ips = await resolveHostIps(hostname);
  for (const ip of ips) {
    if (isPrivateIp(ip)) return { safe: false, reason: 'private' };
  }
  return { safe: true };
}

function cleanHtml(html: string): { title: string; content: string } {
  var titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  var pageTitle = titleMatch ? titleMatch[1].replace(/&[^;]+;/g, ' ').trim() : '';

  var cleaned = html
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
    .map(function (line) { return line.trim(); })
    .filter(Boolean)
    .join('\n')
    .trim();

  return { title: pageTitle, content: cleaned };
}

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

    let currentUrl: URL = parsedUrl;
    let response: Response | null = null;
    let redirectCount = 0;

    // Follow redirects manually, validating every URL (including the initial one)
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
          credentials: 'omit', // no cookies, no auth forwarding
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

      // Handle redirect responses
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
        continue; // validate and follow the redirect
      }

      break; // final response received
    }

    if (!response || !response.ok) {
      return Response.json({
        error: 'The page could not be retrieved (HTTP ' + (response ? response.status : 0) + ').',
        status: 'error',
      }, { status: 502 });
    }

    // Content-type validation
    var contentType = response.headers.get('content-type') || '';
    if (contentType.indexOf('text/html') === -1 && contentType.indexOf('application/xml') === -1 && contentType.indexOf('text/plain') === -1) {
      return Response.json({ error: 'This URL does not point to a web page.', status: 'error' }, { status: 422 });
    }

    // Response-size protection before processing
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_RESPONSE_BYTES) {
      return Response.json({ error: 'The page is too large to process.', status: 'error' }, { status: 413 });
    }

    var html = await response.text();
    if (html.length > MAX_RESPONSE_BYTES) {
      html = html.slice(0, MAX_RESPONSE_BYTES);
    }

    const { title: pageTitle, content: cleaned } = cleanHtml(html);

    if (!cleaned || cleaned.length < 100) {
      return Response.json({
        error: 'No job content could be extracted from this page.',
        status: 'error',
      }, { status: 422 });
    }

    var truncated = cleaned.slice(0, MAX_CONTENT_CHARS);

    return Response.json({
      status: 'success',
      page_title: pageTitle,
      content: truncated,
      final_url: currentUrl.toString(),
      content_length: cleaned.length,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to retrieve the job page.' }, { status: 500 });
  }
}
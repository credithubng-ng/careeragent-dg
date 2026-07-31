import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const FETCH_TIMEOUT_MS = 30_000;
const MAX_CONTENT_CHARS = 20_000;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const url = typeof body?.url === 'string' ? body.url.trim() : '';

    if (!url) {
      return Response.json({ error: 'A job URL is required.' }, { status: 400 });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return Response.json({ error: 'The URL is not valid.' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return Response.json({ error: 'Only http and https URLs are accepted.' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(function() { controller.abort(); }, FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
        },
        redirect: 'follow',
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const msg = fetchError && fetchError.name === 'AbortError'
        ? 'The page took too long to respond.'
        : 'Unable to reach this website.';
      return Response.json({ error: msg, status: 'error' }, { status: 502 });
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      return Response.json({
        error: 'The page could not be retrieved (HTTP ' + response.status + ').',
        status: 'error',
      }, { status: 502 });
    }

    var contentType = response.headers.get('content-type') || '';
    if (contentType.indexOf('text/html') === -1 && contentType.indexOf('application/xml') === -1 && contentType.indexOf('text/plain') === -1) {
      return Response.json({
        error: 'This URL does not point to a web page.',
        status: 'error',
      }, { status: 422 });
    }

    var html = await response.text();

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
      .map(function(line) { return line.trim(); })
      .filter(Boolean)
      .join('\n')
      .trim();

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
      final_url: response.url,
      content_length: cleaned.length,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to retrieve the job page.' }, { status: 500 });
  }
}
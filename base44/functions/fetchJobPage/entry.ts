import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { fetchJobPageContent } from "../../shared/jobPageFetcher.ts";

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const url = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!url) return Response.json({ error: 'A job URL is required.' }, { status: 400 });

    const result = await fetchJobPageContent(url);

    if (result.status === 'error') {
      return Response.json({ error: result.error, status: 'error' }, { status: 502 });
    }

    if (result.status === 'restricted') {
      return Response.json({
        status: 'restricted',
        restricted_source: true,
        domain: result.restrictedDomain,
        message: result.message,
        original_url: url,
      });
    }

    return Response.json({
      status: 'success',
      page_title: result.pageTitle,
      content: result.content,
      raw_content: result.rawContent,
      final_url: result.finalUrl,
      content_length: result.content?.length,
      extraction_source: result.extractionSource,
      adapter_used: result.adapterUsed,
      structured_data: result.structuredData,
      related_jobs_detected: result.relatedJobsDetected,
      sections_ignored: result.sectionsIgnored,
      multiple_jobpostings: result.multipleJobpostings,
      jobposting_count: result.jobpostingCount,
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Unable to retrieve the job page.' }, { status: 500 });
  }
}
import React, { useState } from "react";
import { validateJobUrl, JOB_URL_EXAMPLES, SUPPORTED_SOURCES, PASTE_ONLY_SOURCES, importJobFromUrl } from "@/lib/jobUrlImport";
import { SectionCard, Notice } from "@/components/ui-kit";
import { Sparkles, Loader2, ClipboardPaste, FileText, Globe } from "lucide-react";

export default function UrlImportTab({ onExtracted, onFallback, preservingUrl }) {
  const [url, setUrl] = useState(preservingUrl || "");
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [error, setError] = useState("");

  async function handleAnalyse() {
    setError("");
    const validationError = validateJobUrl(url);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setProgressStep("retrieve");
    try {
      const data = await importJobFromUrl(url, (step) => setProgressStep(step));
      onExtracted(data, "URL", "AI URL Import");
    } catch (err) {
      if (err?.restrictedSource) {
        onFallback("paste", {
          restrictedSource: true,
          domain: err.domain,
          originalUrl: url,
          message: err.message,
        });
      } else {
        setError(err?.message || "We couldn't extract this job automatically.");
        setProgressStep("");
      }
    } finally {
      setLoading(false);
    }
  }

  const progressLabels = {
    retrieve: "Retrieving job page…",
    extract: "Extracting details…",
  };

  return (
    <div className="space-y-4">
      {error && (
        <Notice tone="rose">
          <div>
            <p className="font-medium">{error}</p>
            <p className="mt-1 text-sm">We couldn't extract this job automatically. Try pasting the job description or uploading a PDF instead.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => onFallback("paste")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                <ClipboardPaste className="h-4 w-4" /> Paste Job Description
              </button>
              <button
                onClick={() => onFallback("pdf")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                <FileText className="h-4 w-4" /> Upload PDF
              </button>
            </div>
          </div>
        </Notice>
      )}

      <SectionCard title="Import from URL" description="Paste a job URL and AI will retrieve the page, extract the details, and run match analysis automatically.">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Job URL</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleAnalyse(); }}
                  placeholder="https://company.com/jobs/12345"
                  className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={loading}
                />
              </div>
              <button
                onClick={handleAnalyse}
                disabled={loading || !url.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? "Analysing…" : "Analyse Job"}
              </button>
            </div>
          </div>

          {loading && progressStep && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {progressLabels[progressStep] || "Processing…"}
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Examples:</p>
            <div className="flex flex-wrap gap-1.5">
              {JOB_URL_EXAMPLES.map((example) => (
                <span key={example} className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {example}
                </span>
              ))}
            </div>
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium hover:text-foreground">Supported sources</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUPPORTED_SOURCES.map((source) => (
                <span key={source} className="rounded-md border border-border bg-muted/20 px-2 py-0.5">{source}</span>
              ))}
            </div>
            <p className="mt-2">URL import works for publicly accessible job pages.</p>
            <p className="mt-1">
              {PASTE_ONLY_SOURCES.join(", ")} require an authenticated browser session, so copy and paste the complete advert instead.
            </p>
          </details>
        </div>
      </SectionCard>
    </div>
  );
}

import React, { useState } from "react";
import { extractJobFromText } from "@/lib/careerAI";
import { SectionCard } from "@/components/ui-kit";
import { Sparkles, Loader2, AlertCircle, ExternalLink } from "lucide-react";

const MAX_JOB_TEXT = 15000;

const DOMAIN_LABELS = {
  "linkedin.com": "LinkedIn",
  "indeed.com": "Indeed",
  "indeed.co.uk": "Indeed",
  "glassdoor.com": "Glassdoor",
  "glassdoor.co.uk": "Glassdoor",
};

export default function PasteImportTab({ onExtracted, initialText, fallbackContext }) {
  const [text, setText] = useState(initialText || "");
  const [extracting, setExtracting] = useState(false);

  const isRestricted = fallbackContext?.restrictedSource;
  const domain = fallbackContext?.domain || "";
  const siteName = DOMAIN_LABELS[domain] || "the job site";

  async function handleExtract() {
    if (!text.trim()) return;
    if (text.trim().length < 100) return;
    if (text.trim().length > MAX_JOB_TEXT) return;
    setExtracting(true);
    try {
      const result = await extractJobFromText(text);
      onExtracted(
        {
          ...result,
          job_description: text.trim(),
          original_job_url: isRestricted ? (fallbackContext.originalUrl || "") : (result.original_job_url || ""),
          job_source_name: isRestricted ? (DOMAIN_LABELS[domain] || "") : (result.job_source_name || ""),
        },
        "Paste",
        isRestricted ? "Restricted Website Fallback" : "AI Text Extract"
      );
    } catch {
      setExtracting(false);
    } finally {
      setExtracting(false);
    }
  }

  const tooShort = text.trim().length > 0 && text.trim().length < 100;
  const tooLong = text.trim().length > MAX_JOB_TEXT;

  return (
    <div className="space-y-4">
      {isRestricted && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-amber-900">{fallbackContext.message}</p>
              {fallbackContext.originalUrl && (
                <p className="mt-1.5 text-sm text-amber-800 break-all">
                  <span className="font-medium">Original URL:</span>{" "}
                  <a
                    href={fallbackContext.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline inline-flex items-center gap-0.5"
                  >
                    {fallbackContext.originalUrl}
                    <ExternalLink className="h-3 w-3 inline flex-shrink-0" />
                  </a>
                </p>
              )}
            </div>
          </div>

          {domain === "linkedin.com" && (
            <p className="text-xs text-amber-700 italic pl-7">
              Direct LinkedIn capture will be available through the CareerAgent browser extension.
            </p>
          )}

          <div className="rounded-lg bg-white/60 p-3 text-sm text-amber-900">
            <p className="font-medium mb-1.5">How to import this job:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Return to {siteName} and open the vacancy</li>
              <li>Expand the full job description (click "See more" if needed)</li>
              <li>Copy the entire job advert text</li>
              <li>Paste it into the box below</li>
              <li>Select "Extract with AI" to analyse the job</li>
            </ol>
          </div>
        </div>
      )}

      <SectionCard title="Paste Job Description" description="Paste the entire job advert and AI will extract the key fields for review.">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the entire job advert here…"
          className="w-full min-h-[320px] rounded-lg border border-input bg-card p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={extracting}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {tooShort && <span className="text-amber-600">Add more text — at least 100 characters for reliable extraction.</span>}
            {tooLong && <span className="text-rose-600">Text is too long (max {MAX_JOB_TEXT.toLocaleString()} characters). Trim and try again.</span>}
          </span>
          <span>{text.trim().length.toLocaleString()} chars</span>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={handleExtract}
            disabled={extracting || !text.trim() || tooShort || tooLong}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {extracting ? "Extracting…" : "Extract with AI"}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
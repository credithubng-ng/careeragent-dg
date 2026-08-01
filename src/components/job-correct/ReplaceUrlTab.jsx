import React, { useState } from "react";
import { importJobFromUrl, validateJobUrl, RestrictedSourceError } from "@/lib/jobUrlImport";
import ComparisonView from "./ComparisonView";
import { Loader2, Link2, AlertTriangle } from "lucide-react";

/**
 * Replace the job source with a new or corrected URL.
 * Runs the existing secure URL retrieval, isolates the primary vacancy,
 * and shows a side-by-side comparison for field-by-field acceptance.
 */
export default function ReplaceUrlTab({ currentJob, onExtracted, decisions, onDecisionsChange }) {
  const [url, setUrl] = useState(currentJob.original_job_url || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [extracted, setExtracted] = useState(null);
  const [meta, setMeta] = useState(null);

  async function handleExtract() {
    setError("");
    const urlError = validateJobUrl(url);
    if (urlError) { setError(urlError); return; }
    setLoading(true);
    try {
      const result = await importJobFromUrl(url);
      setExtracted(result);
      setMeta({
        source: result._extractionMeta?.source || "generic_text",
        confidence: result._extractionMeta?.confidence || "Medium",
        contaminated: result._extractionMeta?.contaminated || false,
        coherenceWarnings: result._extractionMeta?.coherenceWarnings || [],
        relatedJobsDetected: result._extractionMeta?.relatedJobsDetected || 0,
        rawContent: result._extractionMeta?.rawContent || "",
      });
      onExtracted(result, {
        editMethod: "Replacement URL",
        newSourceType: "URL Import",
        newUrl: url,
        extractionStatus: "Success",
        extractionConfidence: result._extractionMeta?.confidence || "Medium",
        rawExtractedText: result._extractionMeta?.rawContent || result.job_description || "",
      });
    } catch (e) {
      if (e instanceof RestrictedSourceError) {
        setError(`${e.message} This source restricts automatic retrieval. Try pasting the job description instead.`);
      } else {
        setError(e?.message || "Unable to retrieve the job page. Check the URL or try pasting the description.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          New or corrected job URL
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://careers.example.com/jobs/12345"
            className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleExtract}
            disabled={loading || !url.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {loading ? "Retrieving…" : "Retrieve & Extract"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          The URL will be fetched securely and the primary vacancy isolated. Nothing is saved until you confirm.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {meta?.contaminated && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Multiple job postings were detected on this page ({meta.relatedJobsDetected} related). Only the primary vacancy was extracted. Review carefully.
          </span>
        </div>
      )}

      {extracted && (
        <ComparisonView
          currentJob={currentJob}
          newJob={extracted}
          decisions={decisions}
          onDecisionsChange={onDecisionsChange}
        />
      )}
    </div>
  );
}
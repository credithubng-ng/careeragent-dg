import React, { useState } from "react";
import { extractJobFromText } from "@/lib/careerAI";
import ComparisonView from "./ComparisonView";
import { Loader2, ClipboardPaste, AlertTriangle } from "lucide-react";

const MIN_CHARS = 100;

/**
 * Paste a corrected or complete job advert.
 * Requires at least 100 characters. Uses AI to extract structured fields.
 * Shows a side-by-side comparison for field-by-field acceptance.
 * Preserves the original URL unless the user changes it.
 */
export default function PasteDescriptionTab({ currentJob, onExtracted, decisions, onDecisionsChange }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [extracted, setExtracted] = useState(null);

  async function handleExtract() {
    setError("");
    if (text.trim().length < MIN_CHARS) {
      setError(`Please paste at least ${MIN_CHARS} characters of the job description.`);
      return;
    }
    setLoading(true);
    try {
      const result = await extractJobFromText(text);
      // Preserve the original URL unless the extraction found a different one
      if (!result.original_job_url && currentJob.original_job_url) {
        result.original_job_url = currentJob.original_job_url;
      }
      setExtracted(result);
      onExtracted(result, {
        editMethod: "Paste Replacement",
        newSourceType: "Paste Job Description",
        newUrl: result.original_job_url || currentJob.original_job_url || "",
        extractionStatus: "Success",
        extractionConfidence: result.extraction_confidence || "Medium",
        rawExtractedText: text,
      });
    } catch (e) {
      setError(e?.message || "Unable to extract job details from the pasted text. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Corrected job description <span className="text-muted-foreground">({text.trim().length}/{MIN_CHARS} min chars)</span>
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the full, corrected job advert here…"
          className="w-full min-h-[200px] rounded-lg border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground mt-1">
          The AI will extract structured fields from this text. The original URL is preserved unless you change it.
        </p>
      </div>

      <button
        onClick={handleExtract}
        disabled={loading || text.trim().length < MIN_CHARS}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
        {loading ? "Extracting…" : "Extract & Compare"}
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
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
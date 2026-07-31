import React, { useState } from "react";
import { ChevronDown, ChevronUp, FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Expandable diagnostic section showing extraction metadata and raw page text.
 */
export default function ExtractionDiagnostics({
  extractionSource,
  adapterUsed,
  confidence,
  relatedJobsDetected,
  sectionsIgnored,
  multipleJobpostings,
  jobpostingCount,
  rawContent,
  coherenceWarnings,
}) {
  const [expanded, setExpanded] = useState(false);

  const hasMetadata =
    extractionSource || adapterUsed || relatedJobsDetected > 0 || sectionsIgnored > 0;

  if (!hasMetadata && !rawContent) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" />
          Extraction Diagnostics
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {extractionSource && (
              <div>
                <span className="text-muted-foreground">Source:</span>{" "}
                <span className="font-medium text-foreground">
                  {extractionSource === "structured_jobposting"
                    ? "Structured JobPosting"
                    : extractionSource === "website_adapter"
                      ? `Website Adapter${adapterUsed ? ` (${adapterUsed})` : ""}`
                      : "Generic Page Extraction"}
                </span>
              </div>
            )}
            {confidence && (
              <div>
                <span className="text-muted-foreground">Confidence:</span>{" "}
                <span
                  className={cn(
                    "font-medium",
                    confidence === "High"
                      ? "text-emerald-600"
                      : confidence === "Medium"
                        ? "text-amber-600"
                        : "text-rose-600"
                  )}
                >
                  {confidence}
                </span>
              </div>
            )}
            {relatedJobsDetected > 0 && (
              <div>
                <span className="text-muted-foreground">Related jobs removed:</span>{" "}
                <span className="font-medium text-foreground">{relatedJobsDetected}</span>
              </div>
            )}
            {sectionsIgnored > 0 && (
              <div>
                <span className="text-muted-foreground">Sections ignored:</span>{" "}
                <span className="font-medium text-foreground">{sectionsIgnored}</span>
              </div>
            )}
            {multipleJobpostings && (
              <div>
                <span className="text-muted-foreground">JobPosting objects:</span>{" "}
                <span className="font-medium text-amber-600">
                  {jobpostingCount} found — primary selected
                </span>
              </div>
            )}
          </div>

          {/* Coherence warnings */}
          {coherenceWarnings && coherenceWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-medium text-amber-800 mb-1">Coherence warnings:</p>
              <ul className="space-y-0.5">
                {coherenceWarnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700">• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Raw content preview */}
          {rawContent && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Original extracted text (diagnostic only — not used for matching):
              </p>
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                {rawContent.slice(0, 5000)}
                {rawContent.length > 5000 ? "\n\n[truncated]" : ""}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
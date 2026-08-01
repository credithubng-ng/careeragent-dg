import React from "react";
import { FIELD_LABELS, COMPARISON_FIELDS } from "@/lib/jobCorrection";

/**
 * Diagnostic view showing:
 * - Original raw extract (raw_extracted_text)
 * - Cleaned job description
 * - Current structured fields
 * For diagnosis only — the raw full-page extract is never used for AI matching.
 */
export default function ViewRawSourceTab({ job }) {
  const [view, setView] = React.useState("structured");

  const tabs = [
    { id: "structured", label: "Current Structured Fields" },
    { id: "cleaned", label: "Cleaned Job Description" },
    { id: "raw", label: "Original Raw Extract" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This view is for diagnosis only. The raw full-page extract is never used for AI matching — only the cleaned, isolated job description is.
      </p>
      <div className="flex gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              view === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "structured" && (
        <div className="rounded-lg border border-border divide-y divide-border">
          {COMPARISON_FIELDS.map((field) => {
            const value = job?.[field];
            if (value == null || value === "") return null;
            return (
              <div key={field} className="px-4 py-2.5">
                <p className="text-xs text-muted-foreground">{FIELD_LABELS[field] || field}</p>
                <p className="text-sm text-foreground whitespace-pre-wrap mt-0.5">{String(value)}</p>
              </div>
            );
          })}
        </div>
      )}

      {view === "cleaned" && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          {job?.job_description ? (
            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans max-h-[500px] overflow-y-auto">
              {job.job_description}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">No cleaned job description available.</p>
          )}
        </div>
      )}

      {view === "raw" && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          {job?.raw_extracted_text ? (
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-[500px] overflow-y-auto">
              {job.raw_extracted_text}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No raw extract is stored for this job. Raw source content is captured during URL import and email processing.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
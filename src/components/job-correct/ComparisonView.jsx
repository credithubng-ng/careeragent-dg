import React from "react";
import { FIELD_LABELS, COMPARISON_FIELDS } from "@/lib/jobCorrection";

/**
 * Side-by-side comparison of current vs new extracted job values.
 * For each field, the user can: Keep Current, Use New, or Edit Manually.
 */
export default function ComparisonView({ currentJob, newJob, decisions, onDecisionsChange, differentOnly = false }) {
  const comparison = COMPARISON_FIELDS.map((field) => ({
    field,
    label: FIELD_LABELS[field] || field,
    currentValue: currentJob?.[field] ?? "",
    newValue: newJob?.[field] ?? "",
    isDifferent: !valuesEqual(currentJob?.[field], newJob?.[field]),
  }));

  const rows = differentOnly ? comparison.filter((r) => r.isDifferent) : comparison;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No differences detected between the current and new extraction.
      </div>
    );
  }

  function setDecision(field, decision, editValue) {
    onDecisionsChange({
      ...decisions,
      [field]: { decision, editValue: editValue ?? decisions[field]?.editValue },
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Field-by-field comparison</p>
        <div className="flex gap-2">
          <button
            onClick={() => selectAll(rows, "keep", decisions, onDecisionsChange)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Keep all current
          </button>
          <span className="text-border">|</span>
          <button
            onClick={() => selectAll(rows, "use_new", decisions, onDecisionsChange)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Use all new
          </button>
        </div>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {rows.map((row) => {
          const decision = decisions[row.field]?.decision || "keep";
          const editValue = decisions[row.field]?.editValue ?? "";
          const isLong = ["job_description", "responsibilities", "essential_requirements", "desirable_requirements",
            "required_qualifications", "required_certifications", "required_technologies",
            "required_sector_experience", "right_to_work_requirements", "security_clearance_requirement"].includes(row.field);
          return (
            <div key={row.field} className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{row.label}</span>
                {row.isDifferent && (
                  <span className="text-xs font-medium text-amber-600">Changed</span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                <div className="rounded-lg bg-muted/40 p-2.5">
                  <p className="text-xs text-muted-foreground mb-1">Current</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-4">
                    {row.currentValue || <span className="text-muted-foreground italic">—</span>}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2.5">
                  <p className="text-xs text-blue-600 mb-1">New Extracted</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-4">
                    {row.newValue || <span className="text-muted-foreground italic">—</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name={row.field}
                    checked={decision === "keep"}
                    onChange={() => setDecision(row.field, "keep")}
                  />
                  <span className="text-muted-foreground">Keep Current</span>
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name={row.field}
                    checked={decision === "use_new"}
                    onChange={() => setDecision(row.field, "use_new")}
                    disabled={!row.newValue}
                  />
                  <span className="text-muted-foreground">Use New</span>
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name={row.field}
                    checked={decision === "edit"}
                    onChange={() => setDecision(row.field, "edit")}
                  />
                  <span className="text-muted-foreground">Edit Manually</span>
                </label>
              </div>
              {decision === "edit" && (
                isLong ? (
                  <textarea
                    value={editValue}
                    onChange={(e) => setDecision(row.field, "edit", e.target.value)}
                    placeholder="Enter the corrected value…"
                    className="mt-2 w-full min-h-[80px] rounded-lg border border-input bg-card p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setDecision(row.field, "edit", e.target.value)}
                    placeholder="Enter the corrected value…"
                    className="mt-2 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function valuesEqual(a, b) {
  const na = a == null || a === "" ? "" : String(a).trim();
  const nb = b == null || b === "" ? "" : String(b).trim();
  return na === nb;
}

function selectAll(rows, decision, decisions, onDecisionsChange) {
  const next = { ...decisions };
  for (const row of rows) {
    next[row.field] = { decision, editValue: next[row.field]?.editValue ?? "" };
  }
  onDecisionsChange(next);
}
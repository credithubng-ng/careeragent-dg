import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { daysUntil } from "@/lib/format";

/**
 * Application Readiness Checklist.
 *
 * Shows a checklist of mandatory and recommended preparation steps,
 * a percentage-ready bar, missing actions, and gates the
 * "Ready to Apply" action until mandatory items are complete.
 *
 * Mandatory for "Ready to Apply":
 *  - Verified Job Match exists
 *  - Processed Master CV exists
 *  - At least one core document (Cover Letter or Supporting Statement) approved
 *  - Job has not expired
 */
export default function ReadinessChecklist({
  job,
  match,
  docs = [],
  cvs = [],
  application,
  onReadyToApply,
  readyDisabled = false,
}) {
  const hasMatch = Boolean(match);
  const matchVerified =
    hasMatch &&
    (match.strong_reasons?.length > 0 || match.partial_reasons?.length > 0);
  const masterCV = cvs.find(
    (cv) => cv.is_master && cv.processing_status === "Ready"
  );
  const tailoredProfile = docs.find(
    (d) => d.document_type === "Tailored Profile"
  );
  const cvImprovement = docs.find(
    (d) => d.document_type === "CV Improvement"
  );
  const coverLetter = docs.find((d) => d.document_type === "Cover Letter");
  const supportingStatement = docs.find(
    (d) => d.document_type === "Supporting Statement"
  );
  const coreDocApproved =
    [coverLetter, supportingStatement].some(
      (d) => d && d.approval_status === "Approved"
    );
  const questionDocs = docs.filter(
    (d) => d.document_type === "Application Question"
  );
  const evidenceReviewed = docs.some(
    (d) => d.grounding_status === "Candidate Edited" || d.grounding_status === "Verified"
  );
  const closeDays = daysUntil(job?.closing_date);
  const deadlineChecked =
    job?.closing_date && closeDays != null && closeDays >= 0;
  const linkVerified = Boolean(job?.original_job_url);

  const items = [
    { label: "Job Match completed", done: hasMatch, mandatory: true },
    { label: "Match evidence verified", done: matchVerified, mandatory: true },
    { label: "Master CV processed and selected", done: Boolean(masterCV), mandatory: true },
    { label: "Tailored profile generated", done: Boolean(tailoredProfile), mandatory: false },
    { label: "CV improvement recommendations reviewed", done: Boolean(cvImprovement), mandatory: false },
    { label: "Cover letter or supporting statement generated", done: Boolean(coverLetter || supportingStatement), mandatory: false },
    { label: "Evidence reviewed by candidate", done: evidenceReviewed, mandatory: false },
    { label: "Application questions answered", done: questionDocs.length > 0, mandatory: false },
    { label: "At least one core document approved", done: coreDocApproved, mandatory: true },
    { label: "Deadline checked (not expired)", done: deadlineChecked, mandatory: true },
    { label: "Application link verified", done: linkVerified, mandatory: false },
  ];

  const completed = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((completed / total) * 100);

  const mandatoryItems = items.filter((i) => i.mandatory);
  const mandatoryDone = mandatoryItems.every((i) => i.done);
  const missingActions = items.filter((i) => !i.done);

  const canMarkReady = mandatoryDone && !readyDisabled;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-medium text-foreground">Application Readiness</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completed} of {total} items complete · {pct}% ready
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            pct === 100
              ? "bg-emerald-100 text-emerald-700"
              : pct >= 70
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-600"
          )}
        >
          {pct === 100 ? "Ready" : pct >= 70 ? "Nearly Ready" : "In Progress"}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden mb-4">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct === 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-blue-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Checklist */}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : item.mandatory ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>
              {item.label}
            </span>
            {item.mandatory && !item.done && (
              <span className="text-[10px] font-medium text-amber-600 uppercase">Required</span>
            )}
          </li>
        ))}
      </ul>

      {/* Missing actions */}
      {missingActions.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium text-foreground mb-1">Missing actions:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
            {missingActions.map((a) => (
              <li key={a.label}>{a.label}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Ready to Apply gate */}
      {onReadyToApply && (
        <button
          onClick={onReadyToApply}
          disabled={!canMarkReady}
          className={cn(
            "mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium",
            canMarkReady
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          {application?.stage === "Ready to Apply" ? "Marked Ready to Apply" : "Mark Ready to Apply"}
        </button>
      )}
      {!canMarkReady && mandatoryItems.some((i) => !i.done) && (
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Complete all required items to enable Ready to Apply.
        </p>
      )}
    </div>
  );
}
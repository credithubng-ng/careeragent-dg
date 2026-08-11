import React from "react";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/lib/format";
import { Save, Loader2, ArrowLeft, AlertTriangle, AlertCircle, Sparkles, ShieldAlert } from "lucide-react";
import ExtractionDiagnostics from "./ExtractionDiagnostics";

const SELECT_OPTIONS = {
  employment_type: ["", "Permanent", "Contract", "Interim", "Fixed Term", "Part-time"],
  work_arrangement: ["", "Remote", "Hybrid", "Office", "Unspecified"],
  currency: ["GBP", "EUR", "USD", "NGN", "CAD", "AUD", "CHF"],
};

const NUMBER_FIELDS = new Set(["salary_min", "salary_max", "required_years_experience"]);
const DATE_FIELDS = new Set(["date_discovered", "date_posted", "closing_date"]);
const REQUIRED_FIELDS = new Set(["job_title"]);

const LONG_FIELDS = new Set([
  "job_description",
  "responsibilities",
  "essential_requirements",
  "desirable_requirements",
  "required_qualifications",
  "required_certifications",
  "required_technologies",
  "required_sector_experience",
  "right_to_work_requirements",
  "security_clearance_requirement",
]);

const SHORT_FIELD_ORDER = [
  "job_title", "employer", "recruitment_agency", "job_source_name", "job_reference",
  "original_job_url", "sector", "date_discovered", "date_posted", "closing_date",
  "employment_type", "contract_length", "work_arrangement", "location", "country",
  "salary_min", "salary_max", "salary_description", "currency",
  "required_years_experience",
  "contact_person", "contact_email",
];

function isFieldEmpty(value) {
  return value == null || String(value).trim() === "";
}

function fieldLabel(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function JobReviewForm({
  review,
  onChange,
  onSave,
  onBack,
  saving,
  saveError,
  importMethod,
  extractionMeta,
}) {
  const shortFields = SHORT_FIELD_ORDER;
  const longFields = [...LONG_FIELDS];
  const hasEmployer = !isFieldEmpty(review.employer) || !isFieldEmpty(review.recruitment_agency);
  const closeDays = review.closing_date ? daysUntil(review.closing_date) : null;

  const isContaminated = extractionMeta?.contaminated;
  const isLowConfidence = extractionMeta?.confidence === "Low";
  const showContaminationWarning = isContaminated || isLowConfidence;
  const saveButtonLabel = showContaminationWarning ? "Save Only (Review Required)" : "Save & Run Match";

  function handleFieldChange(key, value) {
    onChange({ ...review, [key]: value });
  }

  function renderShortField(key) {
    const value = review[key];
    const empty = isFieldEmpty(value);
    const isRequired = REQUIRED_FIELDS.has(key);
    const isOneRequired = key === "employer" || key === "recruitment_agency";

    const ringClass = isRequired && empty
      ? "border-rose-300 focus:ring-rose-300"
      : isOneRequired && empty && !hasEmployer
        ? "border-amber-300 focus:ring-amber-300"
        : empty
          ? "border-amber-200"
          : "border-input";

    return (
      <div key={key}>
        <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
          <span>{fieldLabel(key)}</span>
          {isRequired && <span className="text-rose-500">*</span>}
          {isOneRequired && !isRequired && <span className="normal-case text-muted-foreground/70">(one required)</span>}
          {empty && !isRequired && !isOneRequired && (
            <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700">Missing</span>
          )}
        </label>
        {SELECT_OPTIONS[key] ? (
          <select
            value={value ?? ""}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className={cn("w-full rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2", ringClass)}
          >
            {SELECT_OPTIONS[key].map((opt) => <option key={opt} value={opt}>{opt || "—"}</option>)}
          </select>
        ) : (
          <input
            type={NUMBER_FIELDS.has(key) ? "number" : DATE_FIELDS.has(key) ? "date" : "text"}
            min={NUMBER_FIELDS.has(key) ? "0" : undefined}
            value={value ?? ""}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className={cn("w-full rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring", ringClass)}
          />
        )}
      </div>
    );
  }

  function renderLongField(key) {
    const value = review[key];
    const empty = isFieldEmpty(value);
    const isJobDescription = key === "job_description";
    return (
      <div key={key}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <span>{fieldLabel(key)}</span>
            {empty && <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700">Missing</span>}
          </label>
          {isJobDescription && !empty && (
            <span className="text-[11px] text-muted-foreground">
              {String(value).length.toLocaleString()} characters · no character limit
            </span>
          )}
        </div>
        <textarea
          value={value || ""}
          onChange={(e) => handleFieldChange(key, e.target.value)}
          rows={isJobDescription ? 18 : 6}
          className={cn(
            "w-full resize-y rounded-lg border bg-card p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring",
            isJobDescription ? "min-h-[420px]" : "min-h-[120px]",
            empty ? "border-amber-200" : "border-input"
          )}
        />
        {isJobDescription && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            The complete pasted job description is retained and will be saved. Resize this field vertically if you need more viewing space.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Review Extracted Details</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Imported via {importMethod}. Check the extracted fields — empty fields are highlighted. Edit anything that looks wrong.
          </p>
        </div>
        <button
          onClick={onBack}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" /> Re-extract
        </button>
      </div>

      {/* Extraction source and confidence badge */}
      {extractionMeta && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {extractionMeta.source && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 font-medium text-foreground">
              <Sparkles className="h-3 w-3 text-muted-foreground" />
              {extractionMeta.source === "structured_jobposting"
                ? "Structured JobPosting"
                : extractionMeta.source === "website_adapter"
                  ? `Website Adapter${extractionMeta.adapterUsed ? ` · ${extractionMeta.adapterUsed}` : ""}`
                  : "Generic Page Extraction"}
            </span>
          )}
          {extractionMeta.confidence && (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 font-medium",
                extractionMeta.confidence === "High"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : extractionMeta.confidence === "Medium"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
              )}
            >
              Confidence: {extractionMeta.confidence}
            </span>
          )}
          {extractionMeta.relatedJobsDetected > 0 && (
            <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-1 text-muted-foreground">
              {extractionMeta.relatedJobsDetected} related-jobs section{extractionMeta.relatedJobsDetected === 1 ? "" : "s"} removed
            </span>
          )}
          {extractionMeta.sectionsIgnored > 0 && (
            <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-1 text-muted-foreground">
              {extractionMeta.sectionsIgnored} unrelated section{extractionMeta.sectionsIgnored === 1 ? "" : "s"} ignored
            </span>
          )}
        </div>
      )}

      {/* Contamination warning */}
      {showContaminationWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              {isContaminated
                ? "Multiple vacancies may have been detected on this page. Please review the isolated vacancy before continuing."
                : "Extraction confidence is low. Please review the extracted details carefully before continuing."}
            </p>
            <p className="mt-1 text-rose-700">
              AI Match will not run automatically. Save the job and run match analysis manually from the job page after reviewing.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shortFields.map(renderShortField)}
        </div>
        <div className="mt-4 space-y-4">
          {longFields.map(renderLongField)}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Job title is required. Enter either an employer or a recruitment agency. Fields marked "Missing" were not found in the source — complete any that matter.
        </p>

        {closeDays != null && closeDays < 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>This job's closing date has already passed. Verify before saving.</span>
          </div>
        )}

        {!hasEmployer && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>No employer or recruitment agency was detected. Add one before saving.</span>
          </div>
        )}

        {saveError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : saveButtonLabel}
          </button>
        </div>
      </div>

      {/* Extraction diagnostics — expandable raw text preview */}
      {extractionMeta && (
        <ExtractionDiagnostics
          extractionSource={extractionMeta.source}
          adapterUsed={extractionMeta.adapterUsed}
          confidence={extractionMeta.confidence}
          relatedJobsDetected={extractionMeta.relatedJobsDetected}
          sectionsIgnored={extractionMeta.sectionsIgnored}
          multipleJobpostings={extractionMeta.multipleJobpostings}
          jobpostingCount={extractionMeta.jobpostingCount}
          rawContent={extractionMeta.rawContent}
          coherenceWarnings={extractionMeta.coherenceWarnings}
        />
      )}
    </div>
  );
}

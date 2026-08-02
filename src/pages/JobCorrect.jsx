import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader, SectionCard, Loading, EmptyState, Notice } from "@/components/ui-kit";
import { ukDate } from "@/lib/format";
import { toast } from "react-hot-toast";
import { ArrowLeft, Save, Sparkles, Copy, RotateCcw, AlertTriangle, FileWarning } from "lucide-react";
import { getOwnedRecord, listOwnedRecords, getOwnedCandidate } from "@/lib/ownedEntities";
import {
  saveJobCorrection,
  saveAsSeparateOpportunity,
  buildUpdatePayload,
  detectChangedFields,
  hasMaterialChanges,
  validateCorrection,
  isClosingDateExpired,
  EDIT_METHODS,
  ALL_EDITABLE_FIELDS,
} from "@/lib/jobCorrection";
import EditFieldsTab from "@/components/job-correct/EditFieldsTab";
import ReplaceUrlTab from "@/components/job-correct/ReplaceUrlTab";
import PasteDescriptionTab from "@/components/job-correct/PasteDescriptionTab";
import UploadPdfTab from "@/components/job-correct/UploadPdfTab";
import ViewRawSourceTab from "@/components/job-correct/ViewRawSourceTab";
import CorrectionReasonDialog from "@/components/job-correct/CorrectionReasonDialog";
import SourceHistoryPanel from "@/components/job-correct/SourceHistoryPanel";

const TABS = [
  { id: "edit", label: "Edit Fields" },
  { id: "url", label: "Replace with URL" },
  { id: "paste", label: "Paste Correct Description" },
  { id: "pdf", label: "Upload Document / Image" },
  { id: "raw", label: "View Raw Source" },
];

export default function JobCorrect() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "edit";
  const wrongJobMode = searchParams.get("mode") === "wrong";

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [form, setForm] = useState({});
  const [extracted, setExtracted] = useState(null);
  const [extractionMeta, setExtractionMeta] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // "save" | "save_rerun" | "separate"
  const [saving, setSaving] = useState(false);
  const [existingDocs, setExistingDocs] = useState([]);
  const [candidate, setCandidate] = useState(null);
  const [cvs, setCvs] = useState([]);
  const [scoring, setScoring] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const j = await getOwnedRecord("Job", id);
        if (!j) { toast.error("Job not found."); navigate("/jobs"); return; }
        setJob(j);
        setForm(buildFormFromJob(j));
        const [cand, cvList, settings, docs] = await Promise.all([
          getOwnedCandidate(),
          listOwnedRecords("CV"),
          listOwnedRecords("ScoringSetting", { active: true }),
          listOwnedRecords("ApplicationDocument", { job_id: id }),
        ]);
        setCandidate(cand);
        setCvs(cvList);
        setScoring(settings[0] || null);
        setExistingDocs(docs);
      } catch (e) {
        toast.error(e?.message || "Unable to load this job.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function buildFormFromJob(j) {
    const f = {};
    for (const field of ALL_EDITABLE_FIELDS) {
      f[field] = j[field] ?? "";
    }
    return f;
  }

  function handleFormChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleExtracted(newJobData, meta) {
    setExtracted(newJobData);
    setExtractionMeta(meta);
    // Initialize decisions: default to "keep" for all fields
    const initial = {};
    for (const field of Object.keys(newJobData)) {
      initial[field] = { decision: "keep" };
    }
    setDecisions(initial);
  }

  function handleDecisionsChange(next) {
    setDecisions(next);
  }

  // Compute what would change based on the active tab (guarded for null job)
  function computeChangedFields() {
    if (!job) return { payload: {}, changedFields: [] };
    if (activeTab === "edit") {
      const payload = {};
      for (const field of ALL_EDITABLE_FIELDS) {
        const oldVal = job[field] ?? "";
        const newVal = form[field] ?? "";
        if (String(oldVal).trim() !== String(newVal).trim()) {
          payload[field] = newVal;
        }
      }
      return { payload, changedFields: Object.keys(payload) };
    }
    if (extracted && (activeTab === "url" || activeTab === "paste" || activeTab === "pdf")) {
      const payload = buildUpdatePayload(job, extracted, decisions);
      const changedFields = detectChangedFields(job, payload);
      return { payload, changedFields };
    }
    return { payload: {}, changedFields: [] };
  }

  const { payload: currentPayload, changedFields } = computeChangedFields();
  const materialChanged = hasMaterialChanges(changedFields);
  const hasChanges = changedFields.length > 0;

  // Validation
  const mergedJob = job ? { ...job, ...currentPayload } : {};
  const validationErrors = validateCorrection(mergedJob);
  const closingExpired = isClosingDateExpired(mergedJob.closing_date);

  function handleSave(action) {
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }
    if (!hasChanges && action !== "separate") {
      toast("No changes to save.");
      return;
    }
    setPendingAction(action);
    setReasonDialogOpen(true);
  }

  async function handleReasonConfirm(reason, notes) {
    setReasonDialogOpen(false);
    setSaving(true);
    const t = toast.loading("Saving correction…");
    try {
      if (pendingAction === "separate") {
        const newJobData = activeTab === "edit"
          ? Object.fromEntries(Object.entries(form).filter(([k, v]) => v != null && v !== ""))
          : buildUpdatePayload(job, extracted, decisions);
        const result = await saveAsSeparateOpportunity({
          sourceJobId: id,
          newJobData,
          editMethod: extractionMeta?.editMethod || EDIT_METHODS.manual,
          reason,
          notes,
          newSourceType: extractionMeta?.newSourceType,
          newUrl: extractionMeta?.newUrl,
          extractionStatus: extractionMeta?.extractionStatus || "Manual",
          extractionConfidence: extractionMeta?.extractionConfidence,
        });
        toast.success("Saved as a separate opportunity.", { id: t });
        navigate(`/jobs/${result.newJob.id}`);
        return;
      }

      const rerun = pendingAction === "save_rerun";
      const result = await saveJobCorrection({
        jobId: id,
        updatePayload: currentPayload,
        editMethod: extractionMeta?.editMethod || EDIT_METHODS.manual,
        reason,
        notes,
        previousSourceType: job.source_type,
        previousUrl: job.original_job_url,
        newSourceType: extractionMeta?.newSourceType,
        newUrl: extractionMeta?.newUrl,
        extractionStatus: extractionMeta?.extractionStatus || "Manual",
        extractionConfidence: extractionMeta?.extractionConfidence,
        rerunMatch: rerun,
        candidate,
        cvs,
        scoring,
      });

      let message = "Job corrected successfully.";
      if (result.materialChanged && !rerun) {
        message = "Job corrected. The previous match analysis may no longer be accurate — re-run the match when ready.";
      } else if (rerun && result.matchResult) {
        message = "Job corrected and match re-run successfully.";
      }
      toast.success(message, { id: t });
      navigate(`/jobs/${id}`);
    } catch (e) {
      toast.error(e?.message || "The correction could not be saved. Please try again.", { id: t });
    } finally {
      setSaving(false);
      setPendingAction(null);
    }
  }

  function handleRestore() {
    setForm(buildFormFromJob(job));
    setExtracted(null);
    setExtractionMeta(null);
    setDecisions({});
    toast("Values restored to current.");
  }

  if (loading) return <Loading />;
  if (!job) return <EmptyState title="Job not found" />;

  return (
    <div>
      <button
        onClick={() => navigate(`/jobs/${id}`)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Job
      </button>

      <PageHeader
        title="Edit & Reprocess Job"
        subtitle={`${job.job_title}${job.employer ? ` · ${job.employer}` : ""} · Version ${job.job_version || 1}`}
      />

      {wrongJobMode && (
        <div className="mb-6">
          <Notice tone="rose">
            <strong>Wrong job captured.</strong> The current extraction has been marked as incorrect. Use any method below to provide the correct job details. The wrong extracted content will not be used for matching until you re-run the analysis.
          </Notice>
        </div>
      )}

      {/* Version + match status info */}
      <div className="mb-6 flex flex-wrap gap-3">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground">
          Current Version: {job.job_version || 1}
        </span>
        {job.match_status && (
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
            job.match_status === "Current" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
            job.match_status === "Needs Reanalysis" ? "border-amber-200 bg-amber-50 text-amber-700" :
            "border-slate-200 bg-slate-50 text-slate-600"
          }`}>
            Match: {job.match_status}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mb-6">
        {activeTab === "edit" && (
          <EditFieldsTab form={form} onFormChange={handleFormChange} />
        )}
        {activeTab === "url" && (
          <ReplaceUrlTab
            currentJob={job}
            onExtracted={handleExtracted}
            decisions={decisions}
            onDecisionsChange={handleDecisionsChange}
          />
        )}
        {activeTab === "paste" && (
          <PasteDescriptionTab
            currentJob={job}
            onExtracted={handleExtracted}
            decisions={decisions}
            onDecisionsChange={handleDecisionsChange}
          />
        )}
        {activeTab === "pdf" && (
          <UploadPdfTab
            currentJob={job}
            onExtracted={handleExtracted}
            decisions={decisions}
            onDecisionsChange={handleDecisionsChange}
          />
        )}
        {activeTab === "raw" && <ViewRawSourceTab job={job} />}
      </div>

      {/* Validation warnings */}
      {validationErrors.length > 0 && activeTab !== "raw" && (
        <div className="mb-4">
          <Notice tone="rose">
            {validationErrors.map((e, i) => <div key={i}>{e}</div>)}
          </Notice>
        </div>
      )}
      {closingExpired && mergedJob.closing_date && activeTab !== "raw" && (
        <div className="mb-4">
          <Notice tone="amber">
            The closing date ({ukDate(mergedJob.closing_date)}) has passed. You can still save, but this job may no longer be accepting applications.
          </Notice>
        </div>
      )}

      {/* Match invalidation warning */}
      {materialChanged && activeTab !== "raw" && (
        <div className="mb-4">
          <Notice tone="amber">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Material fields have changed.</p>
                <p>The job details have changed. The previous match analysis may no longer be accurate. After saving, the match status will be set to "Needs Reanalysis".</p>
              </div>
            </div>
          </Notice>
        </div>
      )}

      {/* Application document warning */}
      {existingDocs.length > 0 && materialChanged && activeTab !== "raw" && (
        <div className="mb-4">
          <Notice tone="amber">
            <div className="flex items-start gap-2">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Existing application documents were generated from an earlier version of this job.</p>
                <p>{existingDocs.length} document(s) are linked to this job. They will not be deleted, but may be outdated. After saving, you can review or regenerate them in the Application Studio.</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => navigate(`/studio?jobId=${id}`)}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  >
                    Review Existing Documents
                  </button>
                </div>
              </div>
            </div>
          </Notice>
        </div>
      )}

      {/* Action buttons */}
      {activeTab !== "raw" && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <button
            onClick={() => navigate(`/jobs/${id}`)}
            disabled={saving}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleRestore}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" /> Restore Current Values
          </button>
          {(activeTab === "url" || activeTab === "paste" || activeTab === "pdf") && extracted && (
            <button
              onClick={() => handleSave("separate")}
              disabled={saving || !hasChanges}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <Copy className="h-4 w-4" /> Save as Separate Opportunity
            </button>
          )}
          <button
            onClick={() => handleSave("save")}
            disabled={saving || !hasChanges}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
          </button>
          {materialChanged && (
            <button
              onClick={() => handleSave("save_rerun")}
              disabled={saving || !hasChanges}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" /> {saving ? "Saving…" : "Save and Re-run Match"}
            </button>
          )}
        </div>
      )}

      {/* Source history */}
      <div className="mt-8">
        <SectionCard title="Source History" description="Every correction is recorded with the reason, changed fields, and previous values.">
          <SourceHistoryPanel jobId={id} />
        </SectionCard>
      </div>

      <CorrectionReasonDialog
        open={reasonDialogOpen}
        onConfirm={handleReasonConfirm}
        onCancel={() => { setReasonDialogOpen(false); setPendingAction(null); }}
        editMethod={extractionMeta?.editMethod || EDIT_METHODS.manual}
      />
    </div>
  );
}

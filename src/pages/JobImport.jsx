import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, Loading } from "@/components/ui-kit";
import { todayISO } from "@/lib/format";
import { listOwnedRecords, createOwnedRecord, updateOwnedRecord } from "@/lib/ownedEntities";
import { normaliseJobPayload, validateJob, findDuplicateJob } from "@/lib/jobCapture";
import { analyseJobMatch, getUsableCandidateCVs } from "@/lib/careerAI";
import { base44 } from "@/api/base44Client";
import { computeExtractionStatus, MATCH_PROGRESS_STEPS } from "@/lib/jobUrlImport";
import UrlImportTab from "@/components/job-import/UrlImportTab";
import PasteImportTab from "@/components/job-import/PasteImportTab";
import PdfImportTab from "@/components/job-import/PdfImportTab";
import JobReviewForm from "@/components/job-import/JobReviewForm";
import DuplicateJobDialog from "@/components/job-import/DuplicateJobDialog";
import ImportProgress from "@/components/job-import/ImportProgress";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Link as LinkIcon, ClipboardPaste, FileText } from "lucide-react";

const MATCH_TIMEOUT_MS = 120_000;

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

const TABS = [
  { key: "url", label: "Import from URL", icon: LinkIcon },
  { key: "paste", label: "Paste Job Description", icon: ClipboardPaste },
  { key: "pdf", label: "Upload PDF", icon: FileText },
];

export default function JobImport() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("url");
  const [review, setReview] = useState(null);
  const [importMethod, setImportMethod] = useState("URL");
  const [extractionMethod, setExtractionMethod] = useState("AI URL Import");
  const [preservedUrl, setPreservedUrl] = useState("");
  const [preservedText, setPreservedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [matchStep, setMatchStep] = useState(-1);
  const [duplicate, setDuplicate] = useState(null);
  const [saveError, setSaveError] = useState("");
  const cancelRef = useRef(false);
  const savedJobIdRef = useRef(null);

  const { data: candidates, loading: candidatesLoading } = useCollection(
    "Candidate", () => listOwnedRecords("Candidate")
  );
  const { data: cvs, loading: cvsLoading } = useCollection(
    "CV", () => listOwnedRecords("CV")
  );
  const { data: jobs } = useCollection(
    "Job", () => listOwnedRecords("Job", {}, "-created_date", 500)
  );
  const { data: scoringSettings } = useCollection(
    "ScoringSetting", () => listOwnedRecords("ScoringSetting", { active: true })
  );

  function handleExtracted(data, method, extractionMethodName) {
    setReview({
      ...data,
      date_discovered: data.date_discovered || todayISO(),
      currency: data.currency || "GBP",
      job_status: "New",
    });
    setImportMethod(method);
    setExtractionMethod(extractionMethodName);
    setSaveError("");
  }

  function handleFallback(targetTab) {
    if (activeTab === "url") {
      const urlInput = document.querySelector('input[type="url"]');
      if (urlInput) setPreservedUrl(urlInput.value);
    }
    setActiveTab(targetTab);
  }

  function handleBackToTabs() {
    setReview(null);
    setSaveError("");
  }

  async function handleSave() {
    setSaveError("");
    const payload = normaliseJobPayload(review);
    const validationError = validateJob(payload);
    if (validationError) {
      setSaveError(validationError);
      toast.error(validationError);
      return;
    }

    const dup = findDuplicateJob(jobs, payload);
    if (dup) {
      setDuplicate(dup);
      return;
    }

    await saveAndMatch(payload, null);
  }

  async function saveAndMatch(payload, existingJob) {
    setSaving(true);
    cancelRef.current = false;
    savedJobIdRef.current = null;
    // Steps 0-1 (Retrieving, Extracting) already completed in the import tab.
    setMatchStep(2); // "Saving job…"

    try {
      const candidate = candidates[0];
      const extractionStatus = computeExtractionStatus(review);
      const jobData = {
        ...payload,
        candidate_id: candidate?.id || "",
        import_method: importMethod,
        extraction_status: extractionStatus,
        extraction_method: extractionMethod,
      };

      let savedJob;
      if (existingJob) {
        await updateOwnedRecord("Job", existingJob.id, jobData);
        savedJob = { ...existingJob, ...jobData };
      } else {
        savedJob = await createOwnedRecord("Job", jobData);
      }

      // Track the saved job id so Cancel knows the job exists.
      savedJobIdRef.current = savedJob.id;

      base44.analytics.track({
        eventName: "job_import_saved",
        properties: { import_method: importMethod, extraction_status: extractionStatus },
      });

      const usableCVs = getUsableCandidateCVs(cvs);
      if (!candidate || usableCVs.length === 0) {
        setMatchStep(-1);
        toast.success("Job saved. Add a candidate profile and CV to enable AI matching.");
        navigate(`/jobs/${savedJob.id}`);
        return;
      }

      if (cancelRef.current) return;

      setMatchStep(3); // "Running AI Match…"
      const result = await withTimeout(
        analyseJobMatch(savedJob, candidate, cvs, scoringSettings[0]),
        MATCH_TIMEOUT_MS,
        "Match analysis timed out. The job is saved — you can run match analysis from the job page."
      );

      if (cancelRef.current) return;

      setMatchStep(4); // "Saving match result…"
      await createOwnedRecord("JobMatch", {
        candidate_id: candidate.id,
        job_id: savedJob.id,
        ...result,
      });

      await updateOwnedRecord("Job", savedJob.id, {
        match_score: result.total_score,
        recommendation: result.recommendation,
        last_match_date: new Date().toISOString(),
      });

      setMatchStep(5); // "Complete"
      toast.success("Job imported and match analysis completed");
      navigate(`/jobs/${savedJob.id}`);
    } catch (error) {
      setMatchStep(-1);
      const message = error?.message || "Unable to complete the import.";
      if (savedJobIdRef.current) {
        // Job was saved — redirect to the job page so the user can retry match there.
        toast.error(message);
        navigate(`/jobs/${savedJobIdRef.current}`);
      } else {
        setSaveError(message);
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleOpenExisting() {
    if (duplicate) navigate(`/jobs/${duplicate.id}`);
  }

  async function handleUpdateExisting() {
    if (!duplicate) return;
    setDuplicate(null);
    const payload = normaliseJobPayload(review);
    await saveAndMatch(payload, duplicate);
  }

  async function handleSaveNew() {
    if (!duplicate) return;
    setDuplicate(null);
    const payload = normaliseJobPayload(review);
    base44.analytics.track({ eventName: "job_import_duplicate_saved_new" });
    await saveAndMatch(payload, null);
  }

  function handleCancel() {
    cancelRef.current = true;
    const savedId = savedJobIdRef.current;
    setMatchStep(-1);
    setSaving(false);
    if (savedId) {
      // Job already saved — cancel only the remaining match analysis.
      toast("Match analysis cancelled. The job has been saved and can be analysed later from the Job Review page.");
      navigate(`/jobs/${savedId}`);
    } else {
      // Job not yet saved — cancel the whole import.
      toast("Import cancelled. The job was not saved.");
    }
  }

  if (candidatesLoading || cvsLoading) {
    return <Loading label="Loading your profile…" />;
  }

  const showProgress = matchStep >= 0;

  return (
    <div>
      <PageHeader
        title="Add Opportunity"
        subtitle="Import a job from a URL, paste the description, or upload a PDF — AI will extract the details and run match analysis."
      />

      {!review ? (
        <div>
          <div className="flex gap-1 mb-6 rounded-xl border border-border bg-muted/30 p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  activeTab === tab.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.key === "url" ? "URL" : tab.key === "paste" ? "Paste" : "PDF"}</span>
              </button>
            ))}
          </div>

          {activeTab === "url" && (
            <UrlImportTab
              onExtracted={handleExtracted}
              onFallback={handleFallback}
              preservingUrl={preservedUrl}
            />
          )}
          {activeTab === "paste" && (
            <PasteImportTab
              onExtracted={handleExtracted}
              initialText={preservedText}
            />
          )}
          {activeTab === "pdf" && (
            <PdfImportTab onExtracted={handleExtracted} />
          )}
        </div>
      ) : (
        <JobReviewForm
          review={review}
          onChange={setReview}
          onSave={handleSave}
          onBack={handleBackToTabs}
          saving={saving || showProgress}
          saveError={saveError}
          importMethod={importMethod}
        />
      )}

      {showProgress && (
        <ImportProgress
          steps={MATCH_PROGRESS_STEPS}
          currentIndex={matchStep}
          onCancel={handleCancel}
        />
      )}

      {duplicate && (
        <DuplicateJobDialog
          duplicate={duplicate}
          onOpenExisting={handleOpenExisting}
          onUpdateExisting={handleUpdateExisting}
          onSaveNew={handleSaveNew}
        />
      )}
    </div>
  );
}
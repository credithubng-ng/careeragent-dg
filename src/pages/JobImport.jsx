import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard } from "@/components/ui-kit";
import { extractJobFromText } from "@/lib/careerAI";
import { todayISO } from "@/lib/format";
import { Sparkles, Save, ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { createOwnedRecord } from "@/lib/ownedEntities";
import { findDuplicateJob, normaliseJobPayload, validateJob } from "@/lib/jobCapture";

const SELECT_OPTIONS = {
  employment_type: ["", "Permanent", "Contract", "Interim", "Fixed Term", "Part-time"],
  work_arrangement: ["", "Remote", "Hybrid", "Office", "Unspecified"],
};
const NUMBER_FIELDS = new Set(["salary_min", "salary_max", "required_years_experience"]);
const DATE_FIELDS = new Set(["date_discovered", "date_posted", "closing_date"]);
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

export default function JobImport() {
  const navigate = useNavigate();
  const { data: candidates } = useCollection("Candidate", () => base44.entities.Candidate.list());
  const { data: jobs } = useCollection("Job", () => base44.entities.Job.list("-created_date", 500));
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [review, setReview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function extract() {
    if (!text.trim()) { toast.error("Paste a job description first"); return; }
    if (text.trim().length < 100) {
      toast.error("Paste the full job advert so the details can be extracted reliably.");
      return;
    }
    setExtracting(true);
    const t = toast.loading("Extracting job details with AI…");
    try {
      const result = await extractJobFromText(text);
      setReview({
        ...result,
        job_description: text.trim(),
        date_discovered: todayISO(),
        currency: result.currency || "GBP",
        job_status: "New",
      });
      setSaveError("");
      toast.success("Extraction complete — review and save", { id: t });
    } catch (error) {
      toast.error(error?.message || "The job description could not be extracted.", { id: t });
    } finally { setExtracting(false); }
  }

  async function save() {
    setSaveError("");
    const payload = normaliseJobPayload(review);
    const validationError = validateJob(payload);
    if (validationError) {
      setSaveError(validationError);
      toast.error(validationError);
      return;
    }
    const duplicate = findDuplicateJob(jobs, payload);
    if (duplicate) {
      const message = `This job already exists: ${duplicate.job_title} at ${duplicate.employer || duplicate.recruitment_agency}.`;
      setSaveError(message);
      toast.error(message);
      return;
    }
    setSaving(true);
    try {
      const candidate = candidates[0];
      await createOwnedRecord("Job", { ...payload, candidate_id: candidate?.id || "" });
      toast.success("Job saved");
      navigate("/jobs");
    } catch (error) {
      const message = error?.message || "The job could not be saved. Please try again.";
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4" /> Back</button>
      <PageHeader title="Quick Import" subtitle="Paste a full job description and AI will extract the key fields for review" />

      {!review ? (
        <SectionCard title="Paste Job Description">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the entire job advert here…" className="w-full min-h-[320px] rounded-lg border border-input bg-card p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <div className="flex justify-end mt-4">
            <button onClick={extract} disabled={extracting} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"><Sparkles className="h-4 w-4" /> {extracting ? "Extracting…" : "Extract with AI"}</button>
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-6">
          <SectionCard title="Review Extracted Details" description="Check the AI-extracted fields before saving. Edit anything that looks wrong.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(review).filter(([key]) => !LONG_FIELDS.has(key)).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1 capitalize">
                    {key.replace(/_/g, " ")}
                    {key === "job_title" && <span className="text-rose-500"> *</span>}
                    {(key === "employer" || key === "recruitment_agency") && <span className="normal-case"> (one required)</span>}
                  </label>
                  {SELECT_OPTIONS[key] ? (
                    <select value={value ?? ""} onChange={(event) => setReview({ ...review, [key]: event.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      {SELECT_OPTIONS[key].map((option) => <option key={option} value={option}>{option || "—"}</option>)}
                    </select>
                  ) : (
                    <input type={NUMBER_FIELDS.has(key) ? "number" : DATE_FIELDS.has(key) ? "date" : "text"} min={NUMBER_FIELDS.has(key) ? "0" : undefined} value={value ?? ""} onChange={(event) => setReview({ ...review, [key]: event.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  )}
                </div>
              ))}
            </div>
            {Object.entries(review).filter(([key]) => LONG_FIELDS.has(key)).map(([key, value]) => (
              <div key={key} className="mt-4">
                <label className="block text-xs font-medium text-muted-foreground mb-1 capitalize">{key.replace(/_/g, " ")}</label>
                <textarea value={value || ""} onChange={(event) => setReview({ ...review, [key]: event.target.value })} className="w-full min-h-[120px] rounded-lg border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            ))}
          </SectionCard>
          <p className="text-xs text-muted-foreground">
            Job title is required. Enter either an employer or a recruitment agency.
          </p>
          {saveError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button disabled={saving} onClick={() => { setReview(null); setSaveError(""); }} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">Re-extract</button>
            <button disabled={saving} onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Job"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

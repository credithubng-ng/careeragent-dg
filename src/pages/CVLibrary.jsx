import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, Loading, EmptyState, StatusBadge } from "@/components/ui-kit";
import { ukDate, todayISO } from "@/lib/format";
import { Plus, FileText, Star, X, Save, Edit, Upload, Loader2, ExternalLink } from "lucide-react";
import { toast } from "react-hot-toast";
import { createOwnedRecord } from "@/lib/ownedEntities";
import {
  createCVDownloadUrl,
  CV_FILE_ACCEPT,
  uploadAndExtractCV,
  validateCVFile,
} from "@/lib/cvUpload";

const CV_TYPES = ["Master CV", "Data Governance Manager CV", "Head of Data Governance CV", "Data Quality and Governance CV", "Financial Services Data Governance CV", "Public Sector Data Governance CV", "Contract and Interim CV", "Other"];
const STATUSES = ["Draft", "Active", "Archived"];

export default function CVLibrary() {
  const { data: cvs, loading, refetch } = useCollection("CV", () => base44.entities.CV.list("-created_date", 100));
  const { data: candidates } = useCollection("Candidate", () => base44.entities.Candidate.list());
  const [editing, setEditing] = useState(null);
  const [uploadStage, setUploadStage] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyCVId, setBusyCVId] = useState(null);

  function blank() {
    const needsMaster = !cvs.some((cv) => cv.is_master);
    return {
      cv_name: "",
      cv_type: needsMaster ? "Master CV" : "Other",
      version_number: "1.0",
      upload_date: todayISO(),
      date_last_updated: todayISO(),
      status: "Active",
      is_master: needsMaster,
      file_uri: "",
      file_name: "",
      processing_status: "",
      processing_error: "",
      extracted_cv_text: "",
      professional_summary: "",
      key_skills: [],
      key_achievements: [],
      employment_history: "",
      education: "",
      certifications: "",
      primary_target_role: "",
      primary_target_industry: "",
    };
  }

  async function handleFile(file) {
    const validationError = validateCVFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setUploadStage("Preparing document");
    setEditing((current) => ({
      ...current,
      file_name: file.name,
      processing_status: "Processing",
      processing_error: "",
    }));

    try {
      const extracted = await uploadAndExtractCV(file, setUploadStage);
      setEditing((current) => ({
        ...current,
        ...extracted,
        cv_name: current.cv_name || file.name.replace(/\.(pdf|docx)$/i, ""),
      }));
      toast.success("CV uploaded and read successfully");
    } catch (error) {
      const message = error?.message || "The CV could not be processed. Please try again.";
      setEditing((current) => ({
        ...current,
        processing_status: "Failed",
        processing_error: message,
      }));
      toast.error(message);
    } finally {
      setUploadStage("");
    }
  }

  async function setMaster(cv) {
    if (cv.is_master) return;
    setBusyCVId(cv.id);
    try {
      const others = cvs.filter((item) => item.is_master && item.id !== cv.id);
      for (const other of others) {
        await base44.entities.CV.update(other.id, { is_master: false });
      }
      await base44.entities.CV.update(cv.id, { is_master: true, cv_type: "Master CV" });
      await refetch();
      toast.success("Marked as master CV");
    } catch {
      toast.error("The master CV could not be changed. Please try again.");
    } finally {
      setBusyCVId(null);
    }
  }

  async function save(cv) {
    if (!cv.cv_name?.trim()) {
      toast.error("CV name is required");
      return;
    }
    if (!cv.file_uri || cv.processing_status !== "Ready") {
      toast.error("Upload a valid PDF or DOCX before saving");
      return;
    }
    const candidate = candidates[0];
    if (!candidate?.id) {
      toast.error("Create your candidate profile before adding a CV");
      return;
    }

    setSaving(true);
    try {
      const { id, created_date, updated_date, created_by, ...editableFields } = cv;
      const payload = {
        ...editableFields,
        cv_name: cv.cv_name.trim(),
        candidate_id: candidate.id,
        cv_type: cv.is_master ? "Master CV" : cv.cv_type,
        date_last_updated: todayISO(),
        key_skills: typeof cv.key_skills === "string" ? cv.key_skills.split("\n").map((item) => item.trim()).filter(Boolean) : cv.key_skills,
        key_achievements: typeof cv.key_achievements === "string" ? cv.key_achievements.split("\n").map((item) => item.trim()).filter(Boolean) : cv.key_achievements,
      };

      if (cv.is_master) {
        const others = cvs.filter((item) => item.is_master && item.id !== cv.id);
        for (const other of others) {
          await base44.entities.CV.update(other.id, { is_master: false });
        }
      }

      if (id) {
        await base44.entities.CV.update(id, payload);
        toast.success("CV updated");
      } else {
        await createOwnedRecord("CV", payload);
        toast.success("CV added");
      }
      setEditing(null);
      await refetch();
    } catch {
      toast.error("The CV could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm("Delete this CV version?")) return;
    setBusyCVId(id);
    try {
      await base44.entities.CV.delete(id);
      await refetch();
      toast.success("CV deleted");
    } catch {
      toast.error("The CV could not be deleted. Please try again.");
    } finally {
      setBusyCVId(null);
    }
  }

  async function openDocument(cv) {
    setBusyCVId(cv.id);
    try {
      const url = await createCVDownloadUrl(cv.file_uri);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error?.message || "The document could not be opened.");
    } finally {
      setBusyCVId(null);
    }
  }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="CV Library"
        subtitle="Upload and manage CV versions tailored to different target roles"
        actions={<button onClick={() => setEditing(blank())} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"><Plus className="h-4 w-4" /> Add CV</button>}
      />

      {cvs.length === 0 && !editing ? (
        <EmptyState title="No CVs yet" description="Upload your master CV as a PDF or DOCX document." action={<button onClick={() => setEditing(blank())} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"><Upload className="h-4 w-4" /> Upload master CV</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cvs.map((cv) => (
            <div key={cv.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{cv.cv_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{cv.cv_type} · v{cv.version_number}</p>
                  </div>
                </div>
                {cv.is_master && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600"><Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> Master</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <StatusBadge status={cv.status} score={undefined} />
                {cv.processing_status && <StatusBadge status={cv.processing_status} score={undefined} />}
                {cv.primary_target_role && <span className="text-xs text-muted-foreground truncate">{cv.primary_target_role}</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-2 truncate">{cv.file_name || "No source document"} · Updated {ukDate(cv.date_last_updated)}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-2 mt-3 pt-3 border-t border-border">
                {cv.file_uri && <button disabled={busyCVId === cv.id} onClick={() => openDocument(cv)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"><ExternalLink className="h-3 w-3" /> Open</button>}
                <button onClick={() => setEditing(cv)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Edit className="h-3 w-3" /> Edit</button>
                {!cv.is_master && <button disabled={busyCVId === cv.id} onClick={() => setMaster(cv)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-amber-600 disabled:opacity-50"><Star className="h-3 w-3" /> Set master</button>}
                <button disabled={busyCVId === cv.id} onClick={() => remove(cv.id)} className="inline-flex items-center gap-1 text-xs font-medium text-rose-500 hover:underline sm:ml-auto disabled:opacity-50"><X className="h-3 w-3" /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4" onClick={() => !uploadStage && !saving && setEditing(null)}>
          <div className="bg-card rounded-xl border border-border shadow-lg w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 sm:px-5 py-3 sticky top-0 bg-card z-10">
              <h3 className="font-medium text-foreground">{editing.id ? "Edit CV" : "Upload CV"}</h3>
              <button disabled={Boolean(uploadStage) || saving} onClick={() => setEditing(null)} className="disabled:opacity-50" aria-label="Close"><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <div>
                <label className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition-colors ${editing.processing_status === "Failed" ? "border-rose-300 bg-rose-50" : "border-border hover:border-primary/60 hover:bg-muted/40"}`}>
                  {uploadStage ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <Upload className="h-7 w-7 text-primary" />}
                  <span className="mt-2 text-sm font-medium text-foreground">{uploadStage || (editing.file_name ? "Replace source CV" : "Choose a CV document")}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{editing.file_name || "PDF or DOCX, up to 10 MB"}</span>
                  <input type="file" accept={CV_FILE_ACCEPT} disabled={Boolean(uploadStage)} onChange={(event) => handleFile(event.target.files?.[0])} className="sr-only" />
                </label>
                {editing.processing_status === "Ready" && <p className="mt-2 text-sm text-emerald-700">Document uploaded securely and CV details extracted.</p>}
                {editing.processing_error && <p role="alert" className="mt-2 text-sm text-rose-600">{editing.processing_error}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="CV name"><input value={editing.cv_name} onChange={(event) => setEditing({ ...editing, cv_name: event.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
                <Field label="CV type"><select value={editing.cv_type} disabled={editing.is_master} onChange={(event) => setEditing({ ...editing, cv_type: event.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm disabled:opacity-70">{CV_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
                <Field label="Version"><input value={editing.version_number} onChange={(event) => setEditing({ ...editing, version_number: event.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
                <Field label="Status"><select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></Field>
                <Field label="Primary target role"><input value={editing.primary_target_role || ""} onChange={(event) => setEditing({ ...editing, primary_target_role: event.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
                <Field label="Primary target industry"><input value={editing.primary_target_industry || ""} onChange={(event) => setEditing({ ...editing, primary_target_industry: event.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
              </div>
              <Field label="Professional summary"><textarea value={editing.professional_summary || ""} onChange={(event) => setEditing({ ...editing, professional_summary: event.target.value })} className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3 text-sm" /></Field>
              <Field label="Key skills (one per line)"><textarea value={Array.isArray(editing.key_skills) ? editing.key_skills.join("\n") : editing.key_skills || ""} onChange={(event) => setEditing({ ...editing, key_skills: event.target.value })} className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3 text-sm" /></Field>
              <Field label="Key achievements (one per line)"><textarea value={Array.isArray(editing.key_achievements) ? editing.key_achievements.join("\n") : editing.key_achievements || ""} onChange={(event) => setEditing({ ...editing, key_achievements: event.target.value })} className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3 text-sm" /></Field>
              {editing.extracted_cv_text && <Field label="Extracted CV preview"><textarea readOnly value={editing.extracted_cv_text} className="w-full min-h-[150px] rounded-lg border border-input bg-muted/40 p-3 text-sm font-mono text-muted-foreground" /></Field>}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(editing.is_master)} onChange={(event) => setEditing({ ...editing, is_master: event.target.checked, cv_type: event.target.checked ? "Master CV" : editing.cv_type })} /> Mark as master CV</label>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 border-t border-border px-4 sm:px-5 py-3 sticky bottom-0 bg-card">
              <button disabled={Boolean(uploadStage) || saving} onClick={() => setEditing(null)} className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
              <button disabled={Boolean(uploadStage) || saving || editing.processing_status !== "Ready"} onClick={() => save(editing)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? "Saving" : "Save CV"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return <div><label className="block text-sm font-medium text-foreground mb-1">{label}</label>{children}</div>;
}

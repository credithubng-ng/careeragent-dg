import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatusBadge } from "@/components/ui-kit";
import { ukDate, todayISO } from "@/lib/format";
import { Plus, FileText, Star, X, Save, Edit } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

const CV_TYPES = ["Master CV", "Data Governance Manager CV", "Head of Data Governance CV", "Data Quality and Governance CV", "Financial Services Data Governance CV", "Public Sector Data Governance CV", "Contract and Interim CV", "Other"];
const STATUSES = ["Draft", "Active", "Archived"];

export default function CVLibrary() {
  const { data: cvs, loading, refetch } = useCollection("CV", () => base44.entities.CV.list("-created_date", 100));
  const { data: candidates } = useCollection("Candidate", () => base44.entities.Candidate.list());
  const [editing, setEditing] = useState(null);

  function blank() {
    return { cv_name: "", cv_type: "Master CV", version_number: "1.0", upload_date: todayISO(), date_last_updated: todayISO(), status: "Active", is_master: false, extracted_cv_text: "", professional_summary: "", key_skills: [], key_achievements: [], employment_history: "", education: "", certifications: "", primary_target_role: "", primary_target_industry: "" };
  }

  async function setMaster(cv) {
    // unset others
    const others = cvs.filter((c) => c.is_master && c.id !== cv.id);
    for (const o of others) await base44.entities.CV.update(o.id, { is_master: false });
    await base44.entities.CV.update(cv.id, { is_master: !cv.is_master });
    refetch();
    toast.success(cv.is_master ? "Master CV unset" : "Marked as master CV");
  }

  async function save(cv) {
    if (!cv.cv_name) { toast.error("CV name is required"); return; }
    const candidate = candidates[0];
    const payload = { ...cv, candidate_id: candidate?.id, key_skills: typeof cv.key_skills === "string" ? cv.key_skills.split("\n").filter(Boolean) : cv.key_skills, key_achievements: typeof cv.key_achievements === "string" ? cv.key_achievements.split("\n").filter(Boolean) : cv.key_achievements };
    if (cv.id) {
      await base44.entities.CV.update(cv.id, payload);
      if (cv.is_master) { const others = cvs.filter((c) => c.is_master && c.id !== cv.id); for (const o of others) await base44.entities.CV.update(o.id, { is_master: false }); }
      toast.success("CV updated");
    } else {
      if (cv.is_master) { const others = cvs.filter((c) => c.is_master); for (const o of others) await base44.entities.CV.update(o.id, { is_master: false }); }
      await base44.entities.CV.create(payload);
      toast.success("CV added");
    }
    setEditing(null);
    refetch();
  }

  async function remove(id) {
    if (!confirm("Delete this CV version?")) return;
    await base44.entities.CV.delete(id);
    refetch();
    toast.success("CV deleted");
  }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="CV Library" subtitle="Manage CV versions tailored to different target roles"
        actions={<button onClick={() => setEditing(blank())} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"><Plus className="h-4 w-4" /> Add CV</button>} />

      {cvs.length === 0 && !editing ? (
        <EmptyState title="No CVs yet" description="Add your master CV and role-specific versions." action={<button onClick={() => setEditing(blank())} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add CV</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cvs.map((cv) => (
            <div key={cv.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">{cv.cv_name}</p>
                    <p className="text-xs text-muted-foreground">{cv.cv_type} · v{cv.version_number}</p>
                  </div>
                </div>
                {cv.is_master && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> Master</span>}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <StatusBadge status={cv.status} />
                {cv.primary_target_role && <span className="text-xs text-muted-foreground truncate">{cv.primary_target_role}</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Updated {ukDate(cv.date_last_updated)}</p>
              <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                <button onClick={() => setEditing(cv)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Edit className="h-3 w-3" /> Edit</button>
                <button onClick={() => setMaster(cv)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-amber-600"><Star className="h-3 w-3" /> {cv.is_master ? "Unset master" : "Set master"}</button>
                <button onClick={() => remove(cv.id)} className="inline-flex items-center gap-1 text-xs font-medium text-rose-500 hover:underline ml-auto"><X className="h-3 w-3" /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-card rounded-xl border border-border shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-3 sticky top-0 bg-card">
              <h3 className="font-medium text-foreground">{editing.id ? "Edit CV" : "Add CV"}</h3>
              <button onClick={() => setEditing(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="CV name"><input value={editing.cv_name} onChange={(e) => setEditing({ ...editing, cv_name: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
                <Field label="CV type"><select value={editing.cv_type} onChange={(e) => setEditing({ ...editing, cv_type: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">{CV_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Version"><input value={editing.version_number} onChange={(e) => setEditing({ ...editing, version_number: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
                <Field label="Status"><select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">{STATUSES.map((t) => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Primary target role"><input value={editing.primary_target_role || ""} onChange={(e) => setEditing({ ...editing, primary_target_role: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
                <Field label="Primary target industry"><input value={editing.primary_target_industry || ""} onChange={(e) => setEditing({ ...editing, primary_target_industry: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
              </div>
              <Field label="Professional summary"><textarea value={editing.professional_summary || ""} onChange={(e) => setEditing({ ...editing, professional_summary: e.target.value })} className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3 text-sm" /></Field>
              <Field label="Key skills (one per line)"><textarea value={(editing.key_skills || []).join("\n")} onChange={(e) => setEditing({ ...editing, key_skills: e.target.value })} className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3 text-sm" /></Field>
              <Field label="Key achievements (one per line)"><textarea value={(editing.key_achievements || []).join("\n")} onChange={(e) => setEditing({ ...editing, key_achievements: e.target.value })} className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3 text-sm" /></Field>
              <Field label="Extracted CV text (paste full CV here)"><textarea value={editing.extracted_cv_text || ""} onChange={(e) => setEditing({ ...editing, extracted_cv_text: e.target.value })} className="w-full min-h-[200px] rounded-lg border border-input bg-card p-3 text-sm font-mono" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_master} onChange={(e) => setEditing({ ...editing, is_master: e.target.checked })} /> Mark as master CV</label>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3 sticky bottom-0 bg-card">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
              <button onClick={() => save(editing)} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><Save className="h-4 w-4" /> Save</button>
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
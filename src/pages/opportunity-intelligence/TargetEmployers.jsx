import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "@/lib/entityHooks";
import { listOwnedRecords, createOwnedRecord, updateOwnedRecord, deleteOwnedRecord } from "@/lib/ownedEntities";
import { PageHeader, SectionCard, Loading, EmptyState } from "@/components/ui-kit";
import OINav from "@/components/opportunity-intelligence/OINav";
import { EMPLOYER_PRIORITY_STYLES, STARTER_EMPLOYERS } from "@/lib/oiUtils";
import { ukDateTime } from "@/lib/format";
import { Plus, Edit2, Trash2, Star, Pause, Play, Archive, Search, Sparkles } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

const PRIORITIES = Object.keys(EMPLOYER_PRIORITY_STYLES);
const PORTAL_TYPES = ["Workday", "Greenhouse", "Lever", "SmartRecruiters", "SuccessFactors", "Oracle Recruiting", "Custom Career Site", "Unknown"];
const FREQUENCIES = ["Hourly", "Every 2 Hours", "Every 4 Hours", "Every 6 Hours", "Every 12 Hours", "Daily", "Weekdays Only", "Weekends Only", "Manual Only"];
const EMPLOYER_STATUSES = ["Monitoring", "Paused", "Archived"];

export default function TargetEmployers() {
  const { data: employers, loading, refetch } = useCollection("TargetEmployer", () => listOwnedRecords("TargetEmployer", {}, "-created_date", 200));
  const { data: jobs, loading: jobsLoading } = useCollection("Job", () => listOwnedRecords("Job", {}, "-created_date", 300));
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showStarter, setShowStarter] = useState(false);
  const [selected, setSelected] = useState([]);

  function openAdd() { setEditing(null); setShowForm(true); }
  function openEdit(e) { setEditing(e); setShowForm(true); }

  async function setStatus(e, status) {
    try { await updateOwnedRecord("TargetEmployer", e.id, { status, monitoring_enabled: status === "Monitoring" }); refetch(); toast.success(`Employer ${status}`); }
    catch { toast.error("Failed to update employer"); }
  }

  async function remove(e) {
    if (!confirm(`Delete "${e.employer_name}"?`)) return;
    try { await deleteOwnedRecord("TargetEmployer", e.id); refetch(); toast.success("Employer deleted"); }
    catch { toast.error("Failed to delete employer"); }
  }

  async function importStarter() {
    const toCreate = STARTER_EMPLOYERS.filter(e => selected.includes(e.employer_name));
    if (!toCreate.length) { toast.error("Select at least one employer"); return; }
    const existing = new Set(employers.map(e => e.employer_name));
    const newOnes = toCreate.filter(e => !existing.has(e.employer_name));
    if (!newOnes.length) { toast.error("All selected employers already exist"); return; }
    try {
      for (const e of newOnes) {
        await createOwnedRecord("TargetEmployer", { employer_name: e.employer_name, industry: e.industry, employer_priority: "Medium", status: "Paused", monitoring_enabled: false, monitoring_frequency: "Manual Only", recruitment_portal_type: "Unknown" });
      }
      refetch(); setShowStarter(false); setSelected([]);
      toast.success(`${newOnes.length} employers imported`);
    } catch { toast.error("Failed to import employers"); }
  }

  const vacanciesByEmployer = useMemo(() => {
    const grouped = new Map();
    jobs
      .filter(job => !["Skip", "Expired", "Rejected", "Withdrawn"].includes(job.job_status))
      .forEach(job => {
        const key = normaliseEmployerName(job.employer);
        if (!key) return;
        grouped.set(key, [...(grouped.get(key) || []), job]);
      });
    return grouped;
  }, [jobs]);

  if (loading || jobsLoading) return <Loading />;

  return (
    <div>
      <PageHeader title="Target Employers" subtitle="Track and monitor employers you want to work for"
        actions={<div className="flex gap-2">
          <button onClick={() => setShowStarter(true)} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"><Sparkles className="h-4 w-4" /> Starter Pack</button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add Employer</button>
        </div>} />
      <OINav />
      {employers.length === 0 ? (
        <EmptyState title="No target employers yet" description="Add employers you want to monitor for vacancies, or use the starter pack to import a curated list." action={<button onClick={openAdd} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">Add Employer</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {employers.map(e => {
            const employerVacancies = vacanciesByEmployer.get(normaliseEmployerName(e.employer_name)) || [];
            return (
            <div key={e.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium text-foreground truncate">{e.employer_name}</h3>
                  <p className="text-xs text-muted-foreground">{e.industry || "—"} {e.headquarters ? `· ${e.headquarters}` : ""}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", EMPLOYER_PRIORITY_STYLES[e.employer_priority] || EMPLOYER_PRIORITY_STYLES["Medium"])}>{e.employer_priority}</span>
                    <span className="text-xs text-muted-foreground">{e.status}</span>
                    {e.recruitment_portal_type !== "Unknown" && <span className="text-xs text-muted-foreground">{e.recruitment_portal_type}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(e)} title="Edit" className="rounded-lg p-2 hover:bg-muted"><Edit2 className="h-4 w-4" /></button>
                  {e.status === "Monitoring" ? (
                    <button onClick={() => setStatus(e, "Paused")} title="Pause" className="rounded-lg p-2 hover:bg-muted"><Pause className="h-4 w-4" /></button>
                  ) : (
                    <button onClick={() => setStatus(e, "Monitoring")} title="Monitor" className="rounded-lg p-2 hover:bg-muted"><Play className="h-4 w-4" /></button>
                  )}
                  <button onClick={() => setStatus(e, "Archived")} title="Archive" className="rounded-lg p-2 hover:bg-muted"><Archive className="h-4 w-4" /></button>
                  <button onClick={() => remove(e)} title="Delete" className="rounded-lg p-2 hover:bg-muted text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                <div><div className="text-sm font-semibold">{employerVacancies.length}</div><div className="text-[10px] text-muted-foreground">Vacancies</div></div>
                <div><div className="text-sm font-semibold">{e.applications_submitted || 0}</div><div className="text-[10px] text-muted-foreground">Applied</div></div>
                <div><div className="text-sm font-semibold">{e.interviews || 0}</div><div className="text-[10px] text-muted-foreground">Interviews</div></div>
                <div><div className="text-sm font-semibold">{e.offers || 0}</div><div className="text-[10px] text-muted-foreground">Offers</div></div>
              </div>
              {employerVacancies.length > 0 && (
                <div className="mt-3 border-t border-border pt-3 space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Active vacancies</p>
                  {employerVacancies.slice(0, 3).map(job => (
                    <Link key={job.id} to={`/jobs/${job.id}`} className="block truncate text-sm font-medium text-blue-600 hover:underline">
                      {job.job_title || "Untitled vacancy"}
                    </Link>
                  ))}
                  {employerVacancies.length > 3 && (
                    <Link to={`/jobs?employer=${encodeURIComponent(e.employer_name)}`} className="block text-xs text-muted-foreground hover:underline">
                      View all {employerVacancies.length} vacancies
                    </Link>
                  )}
                </div>
              )}
              {e.careers_url && <a href={e.careers_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline mt-2 block truncate">Careers page</a>}
              {e.last_checked && <p className="text-[11px] text-muted-foreground mt-1">Last checked: {ukDateTime(e.last_checked)}</p>}
            </div>
          );})}
        </div>
      )}
      {showForm && <EmployerForm employer={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); refetch(); }} />}
      {showStarter && <StarterPackDialog existing={new Set(employers.map(e => e.employer_name))} selected={selected} setSelected={setSelected} onImport={importStarter} onClose={() => setShowStarter(false)} />}
    </div>
  );
}

function normaliseEmployerName(value = "") {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(the|uk|plc|limited|ltd|group|holdings?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function EmployerForm({ employer, onClose, onSaved }) {
  const [form, setForm] = useState(employer || { employer_name: "", industry: "", employer_priority: "Medium", careers_url: "", linkedin_company_url: "", recruitment_portal_type: "Unknown", headquarters: "", monitoring_enabled: false, monitoring_frequency: "Manual Only", status: "Paused", notes: "" });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!form.employer_name.trim()) { toast.error("Employer name is required"); return; }
    setSaving(true);
    try { if (form.id) await updateOwnedRecord("TargetEmployer", form.id, form); else await createOwnedRecord("TargetEmployer", form); toast.success("Employer saved"); onSaved(); }
    catch (e) { toast.error(e?.message || "Failed to save"); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{form.id ? "Edit Employer" : "Add Employer"}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Employer Name"><input value={form.employer_name} onChange={e => setForm({ ...form, employer_name: e.target.value })} className="input" /></F>
          <F label="Industry"><input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} className="input" /></F>
          <F label="Priority"><select value={form.employer_priority} onChange={e => setForm({ ...form, employer_priority: e.target.value })} className="input">{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></F>
          <F label="Recruitment Portal"><select value={form.recruitment_portal_type} onChange={e => setForm({ ...form, recruitment_portal_type: e.target.value })} className="input">{PORTAL_TYPES.map(p => <option key={p} value={p}>{p}</option>)}</select></F>
          <F label="Careers URL"><input value={form.careers_url} onChange={e => setForm({ ...form, careers_url: e.target.value })} className="input" placeholder="Leave blank if unknown" /></F>
          <F label="LinkedIn Company URL"><input value={form.linkedin_company_url} onChange={e => setForm({ ...form, linkedin_company_url: e.target.value })} className="input" /></F>
          <F label="Headquarters"><input value={form.headquarters} onChange={e => setForm({ ...form, headquarters: e.target.value })} className="input" /></F>
          <F label="Monitoring Frequency"><select value={form.monitoring_frequency} onChange={e => setForm({ ...form, monitoring_frequency: e.target.value })} className="input">{FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}</select></F>
          <F label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value, monitoring_enabled: e.target.value === "Monitoring" })} className="input">{EMPLOYER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></F>
        </div>
        <F label="Notes"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input min-h-[60px]" /></F>
        <p className="text-[11px] text-muted-foreground mt-2">Do not invent careers URLs, salaries or contacts. Leave blank if unknown and mark Configuration Required.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function StarterPackDialog({ existing, selected, setSelected, onImport, onClose }) {
  const categories = {};
  STARTER_EMPLOYERS.forEach(e => { (categories[e.industry] = categories[e.industry] || []).push(e); });
  function toggle(name) { setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]); }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">Target Employer Starter Pack</h2>
        <p className="text-sm text-muted-foreground mb-4">Select employers to import. Only basic information (name, industry) is populated — careers URLs and contacts are left blank for you to configure.</p>
        {Object.entries(categories).map(([cat, emps]) => (
          <div key={cat} className="mb-4">
            <h3 className="text-sm font-medium text-foreground mb-2">{cat}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {emps.map(e => {
                const exists = existing.has(e.employer_name);
                const checked = selected.includes(e.employer_name);
                return (
                  <label key={e.employer_name} className={cn("flex items-center gap-2 rounded-lg border p-2 text-sm", exists ? "opacity-40" : "", checked ? "border-primary bg-primary/5" : "border-border")}>
                    <input type="checkbox" checked={checked} disabled={exists} onChange={() => toggle(e.employer_name)} />
                    {e.employer_name} {exists && <span className="text-xs text-muted-foreground">(exists)</span>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
          <button onClick={onImport} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">Import Selected ({selected.length})</button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }) {
  return <label className="block"><span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>{children}</label>;
}

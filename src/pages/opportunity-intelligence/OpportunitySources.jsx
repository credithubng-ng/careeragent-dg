import React, { useState } from "react";
import { useCollection } from "@/lib/entityHooks";
import { listOwnedRecords, createOwnedRecord, updateOwnedRecord, deleteOwnedRecord } from "@/lib/ownedEntities";
import { PageHeader, SectionCard, Loading, EmptyState } from "@/components/ui-kit";
import OINav from "@/components/opportunity-intelligence/OINav";
import { SOURCE_TYPE_ICONS, MONITORING_STATUS_STYLES } from "@/lib/oiUtils";
import { todayISO, ukDateTime } from "@/lib/format";
import { Plus, Edit2, Trash2, Power, Pause, Play, Archive, Zap } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

const SOURCE_TYPES = Object.keys(SOURCE_TYPE_ICONS);
const MONITORING_STATUSES = Object.keys(MONITORING_STATUS_STYLES);
const FREQUENCIES = ["Hourly", "Every 2 Hours", "Every 4 Hours", "Every 6 Hours", "Every 12 Hours", "Daily", "Weekdays Only", "Weekends Only", "Manual Only"];

export default function OpportunitySources() {
  const { data: sources, loading, refetch } = useCollection("OpportunitySource", () => listOwnedRecords("OpportunitySource", {}, "-created_date", 200));
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  function openAdd() { setEditing(null); setShowForm(true); }
  function openEdit(s) { setEditing(s); setShowForm(true); }

  async function setStatus(s, status) {
    try { await updateOwnedRecord("OpportunitySource", s.id, { monitoring_status: status }); refetch(); toast.success(`Source ${status}`); }
    catch { toast.error("Failed to update source"); }
  }

  async function remove(s) {
    if (!confirm(`Delete source "${s.source_name}"?`)) return;
    try { await deleteOwnedRecord("OpportunitySource", s.id); refetch(); toast.success("Source deleted"); }
    catch { toast.error("Failed to delete source"); }
  }

  async function runNow(s) {
    try {
      await updateOwnedRecord("OpportunitySource", s.id, { last_checked: new Date().toISOString() });
      refetch();
      toast.success("Run triggered — check Discovery Runs for results");
    } catch { toast.error("Failed to trigger run"); }
  }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Opportunity Sources" subtitle="Manage every channel through which vacancies are discovered"
        actions={<button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add Source</button>} />
      <OINav />
      {sources.length === 0 ? (
        <EmptyState title="No opportunity sources configured" description="Add an email source, job board, employer career site or other channel to start monitoring for vacancies." action={<button onClick={openAdd} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">Add Source</button>} />
      ) : (
        <div className="space-y-3">
          {sources.map(s => {
            const Icon = SOURCE_TYPE_ICONS[s.source_type] || SOURCE_TYPE_ICONS["Other"];
            return (
              <div key={s.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="rounded-lg bg-muted p-2 shrink-0"><Icon className="h-5 w-5 text-foreground" /></div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground truncate">{s.source_name}</h3>
                      <p className="text-xs text-muted-foreground">{s.source_type} {s.website_or_endpoint ? `· ${s.website_or_endpoint}` : ""} {s.email_address ? `· ${s.email_address}` : ""}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", MONITORING_STATUS_STYLES[s.monitoring_status] || MONITORING_STATUS_STYLES["Manual Only"])}>{s.monitoring_status}</span>
                        <span className="text-xs text-muted-foreground">Frequency: {s.search_frequency}</span>
                        <span className="text-xs text-muted-foreground">Priority: {s.priority}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 shrink-0">
                    <button onClick={() => runNow(s)} title="Run Now" className="rounded-lg p-2 hover:bg-muted"><Zap className="h-4 w-4" /></button>
                    <button onClick={() => openEdit(s)} title="Edit" className="rounded-lg p-2 hover:bg-muted"><Edit2 className="h-4 w-4" /></button>
                    {s.monitoring_status === "Active" ? (
                      <button onClick={() => setStatus(s, "Paused")} title="Pause" className="rounded-lg p-2 hover:bg-muted"><Pause className="h-4 w-4" /></button>
                    ) : (
                      <button onClick={() => setStatus(s, "Active")} title="Enable" className="rounded-lg p-2 hover:bg-muted"><Play className="h-4 w-4" /></button>
                    )}
                    <button onClick={() => setStatus(s, "Archived")} title="Archive" className="rounded-lg p-2 hover:bg-muted"><Archive className="h-4 w-4" /></button>
                    <button onClick={() => remove(s)} title="Delete" className="rounded-lg p-2 hover:bg-muted text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-3 text-center">
                  <div><div className="text-sm font-semibold">{s.jobs_found || 0}</div><div className="text-[10px] text-muted-foreground">Found</div></div>
                  <div><div className="text-sm font-semibold">{s.jobs_imported || 0}</div><div className="text-[10px] text-muted-foreground">Imported</div></div>
                  <div><div className="text-sm font-semibold">{s.strong_matches || 0}</div><div className="text-[10px] text-muted-foreground">Strong</div></div>
                  <div><div className="text-sm font-semibold">{s.duplicate_jobs || 0}</div><div className="text-[10px] text-muted-foreground">Duplicates</div></div>
                  <div><div className="text-sm font-semibold">{s.failed_imports || 0}</div><div className="text-[10px] text-muted-foreground">Failed</div></div>
                  <div><div className="text-sm font-semibold">{s.average_match_score ? `${s.average_match_score}%` : "—"}</div><div className="text-[10px] text-muted-foreground">Avg Score</div></div>
                </div>
                {(s.last_checked || s.last_successful_run) && (
                  <p className="text-[11px] text-muted-foreground mt-2">Last checked: {ukDateTime(s.last_checked)} {s.last_successful_run ? `· Last success: ${ukDateTime(s.last_successful_run)}` : ""}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showForm && <SourceForm source={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); refetch(); }} />}
    </div>
  );
}

function SourceForm({ source, onClose, onSaved }) {
  const [form, setForm] = useState(source || { source_name: "", source_type: "Email", website_or_endpoint: "", email_address: "", email_folder_label: "", priority: 5, enabled: true, monitoring_status: "Configuration Required", search_frequency: "Manual Only", notes: "", email_config: { auto_extract_jobs: true, auto_run_match: true, max_emails_per_run: 20, max_jobs_per_email: 10, leave_email_unchanged: true } });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.source_name.trim()) { toast.error("Source name is required"); return; }
    setSaving(true);
    try {
      if (form.id) await updateOwnedRecord("OpportunitySource", form.id, form);
      else await createOwnedRecord("OpportunitySource", form);
      toast.success(form.id ? "Source updated" : "Source created");
      onSaved();
    } catch (e) { toast.error(e?.message || "Failed to save"); }
    finally { setSaving(false); }
  }

  const isEmail = form.source_type === "Email";
  const cfg = form.email_config || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{form.id ? "Edit Source" : "Add Source"}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Source Name"><input value={form.source_name} onChange={e => setForm({ ...form, source_name: e.target.value })} className="input" /></Field>
          <Field label="Source Type"><select value={form.source_type} onChange={e => setForm({ ...form, source_type: e.target.value })} className="input">{SOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
          <Field label="Website or Endpoint"><input value={form.website_or_endpoint} onChange={e => setForm({ ...form, website_or_endpoint: e.target.value })} className="input" /></Field>
          <Field label="Email Address"><input value={form.email_address} onChange={e => setForm({ ...form, email_address: e.target.value })} className="input" /></Field>
          <Field label="Email Folder or Label"><input value={form.email_folder_label} onChange={e => setForm({ ...form, email_folder_label: e.target.value })} className="input" /></Field>
          <Field label="Priority (1-10)"><input type="number" min="1" max="10" value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} className="input" /></Field>
          <Field label="Monitoring Status"><select value={form.monitoring_status} onChange={e => setForm({ ...form, monitoring_status: e.target.value })} className="input">{MONITORING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></Field>
          <Field label="Search Frequency"><select value={form.search_frequency} onChange={e => setForm({ ...form, search_frequency: e.target.value })} className="input">{FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}</select></Field>
        </div>
        {isEmail && (
          <div className="mt-4 rounded-lg border border-border p-4 bg-muted/30">
            <h3 className="text-sm font-medium mb-3">Email Monitoring Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Max Emails Per Run"><input type="number" value={cfg.max_emails_per_run || 20} onChange={e => setForm({ ...form, email_config: { ...cfg, max_emails_per_run: Number(e.target.value) } })} className="input" /></Field>
              <Field label="Max Jobs Per Email"><input type="number" value={cfg.max_jobs_per_email || 10} onChange={e => setForm({ ...form, email_config: { ...cfg, max_jobs_per_email: Number(e.target.value) } })} className="input" /></Field>
              <Field label="Min Match Score for Notifications"><input type="number" value={cfg.min_match_score_for_notifications || 70} onChange={e => setForm({ ...form, email_config: { ...cfg, min_match_score_for_notifications: Number(e.target.value) } })} className="input" /></Field>
              <div className="space-y-2">
                <Check label="Auto extract jobs" value={cfg.auto_extract_jobs} onChange={v => setForm({ ...form, email_config: { ...cfg, auto_extract_jobs: v } })} />
                <Check label="Auto run AI Match" value={cfg.auto_run_match} onChange={v => setForm({ ...form, email_config: { ...cfg, auto_run_match: v } })} />
                <Check label="Auto create notifications" value={cfg.auto_notify} onChange={v => setForm({ ...form, email_config: { ...cfg, auto_notify: v } })} />
                <Check label="Leave email unchanged (no destructive actions)" value={cfg.leave_email_unchanged ?? true} onChange={v => setForm({ ...form, email_config: { ...cfg, leave_email_unchanged: v } })} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Emails are never deleted. Destructive actions require explicit configuration.</p>
          </div>
        )}
        <Field label="Notes"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input min-h-[60px]" /></Field>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>{children}</label>;
}
function Check({ label, value, onChange }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /> {label}</label>;
}
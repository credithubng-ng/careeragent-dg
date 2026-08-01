import React, { useState, useEffect } from "react";
import { useCollection } from "@/lib/entityHooks";
import { listOwnedRecords, createOwnedRecord, updateOwnedRecord, deleteOwnedRecord } from "@/lib/ownedEntities";
import { PageHeader, Loading, EmptyState, Notice } from "@/components/ui-kit";
import OINav from "@/components/opportunity-intelligence/OINav";
import { AGENT_STATUS_STYLES, DEFAULT_AGENTS } from "@/lib/oiUtils";
import { ukDateTime } from "@/lib/format";
import { Plus, Edit2, Trash2, Power, Bot } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

const AGENT_TYPES = ["Email Discovery Agent", "Target Employer Agent", "Job Board Agent", "Recruitment Agency Agent", "Browser Extension Intake Agent", "Match Analysis Agent", "Notification Agent"];
const AGENT_STATUSES = Object.keys(AGENT_STATUS_STYLES);
const FREQUENCIES = ["Hourly", "Every 2 Hours", "Every 4 Hours", "Every 6 Hours", "Every 12 Hours", "Daily", "Weekdays Only", "Weekends Only", "Manual Only"];

export default function AgentConfiguration() {
  const { data: agents, loading, refetch } = useCollection("AgentConfiguration", () => listOwnedRecords("AgentConfiguration", {}, "-created_date", 200));
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!loading && agents.length === 0) {
      (async () => {
        try {
          for (const a of DEFAULT_AGENTS) await createOwnedRecord("AgentConfiguration", a);
          refetch();
        } catch { /* ignore */ }
      })();
    }
  }, [loading, agents.length]);

  function openAdd() { setEditing(null); setShowForm(true); }
  function openEdit(a) { setEditing(a); setShowForm(true); }
  async function toggle(a) { try { await updateOwnedRecord("AgentConfiguration", a.id, { enabled: !a.enabled, status: a.enabled ? "Paused" : (a.status === "Not Yet Implemented" ? "Not Yet Implemented" : "Active") }); refetch(); } catch { toast.error("Failed to update"); } }
  async function remove(a) { if (!confirm(`Delete "${a.agent_name}"?`)) return; try { await deleteOwnedRecord("AgentConfiguration", a.id); refetch(); toast.success("Agent deleted"); } catch { toast.error("Failed to delete"); } }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Agent Configuration" subtitle="Configure autonomous discovery agents for future automation"
        actions={<button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add Agent</button>} />
      <OINav />
      <Notice tone="amber">Agents are not labelled "Active" unless they have a functioning backend process. Use "Not Yet Implemented" for configuration-only agents.</Notice>
      {agents.length === 0 ? (
        <EmptyState title="No agents configured" description="Default agents are being created. Add custom agents for specific discovery workflows." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {agents.map(a => (
            <div key={a.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="rounded-lg bg-muted p-2 shrink-0"><Bot className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-foreground truncate">{a.agent_name}</h3>
                    <p className="text-xs text-muted-foreground">{a.agent_type}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", AGENT_STATUS_STYLES[a.status] || AGENT_STATUS_STYLES["Not Yet Implemented"])}>{a.status}</span>
                      {a.enabled && <span className="text-xs text-emerald-600">Enabled</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => toggle(a)} title={a.enabled ? "Disable" : "Enable"} className="rounded-lg p-2 hover:bg-muted"><Power className="h-4 w-4" /></button>
                  <button onClick={() => openEdit(a)} title="Edit" className="rounded-lg p-2 hover:bg-muted"><Edit2 className="h-4 w-4" /></button>
                  <button onClick={() => remove(a)} title="Delete" className="rounded-lg p-2 hover:bg-muted text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
                <div>Frequency: {a.search_frequency}</div>
                <div>Max records: {a.max_records_per_run || "—"}</div>
                <div>Min match: {a.minimum_match_score || "—"}%</div>
                <div>Last run: {a.last_run ? ukDateTime(a.last_run) : "—"}</div>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-xs">
                {a.auto_import && <span className="text-emerald-600">Auto Import</span>}
                {a.auto_analyse && <span className="text-emerald-600">Auto Analyse</span>}
                {a.auto_notify && <span className="text-emerald-600">Auto Notify</span>}
                {a.require_human_review && <span className="text-amber-600">Human Review</span>}
              </div>
              {a.error_status && <p className="text-xs text-rose-600 mt-2">{a.error_status}</p>}
            </div>
          ))}
        </div>
      )}
      {showForm && <AgentForm agent={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); refetch(); }} />}
    </div>
  );
}

function AgentForm({ agent, onClose, onSaved }) {
  const [form, setForm] = useState(agent || { agent_name: "", agent_type: "Email Discovery Agent", enabled: false, status: "Not Yet Implemented", search_frequency: "Manual Only", max_records_per_run: 20, minimum_match_score: 50, auto_import: false, auto_analyse: false, auto_notify: false, auto_reject: false, require_human_review: true, sources: [] });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!form.agent_name.trim()) { toast.error("Agent name is required"); return; }
    setSaving(true);
    try { if (form.id) await updateOwnedRecord("AgentConfiguration", form.id, form); else await createOwnedRecord("AgentConfiguration", form); toast.success("Agent saved"); onSaved(); }
    catch (e) { toast.error(e?.message || "Failed to save"); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{form.id ? "Edit Agent" : "Add Agent"}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Agent Name"><input value={form.agent_name} onChange={e => setForm({ ...form, agent_name: e.target.value })} className="input" /></F>
          <F label="Agent Type"><select value={form.agent_type} onChange={e => setForm({ ...form, agent_type: e.target.value })} className="input">{AGENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></F>
          <F label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="input">{AGENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></F>
          <F label="Search Frequency"><select value={form.search_frequency} onChange={e => setForm({ ...form, search_frequency: e.target.value })} className="input">{FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}</select></F>
          <F label="Max Records Per Run"><input type="number" value={form.max_records_per_run} onChange={e => setForm({ ...form, max_records_per_run: Number(e.target.value) })} className="input" /></F>
          <F label="Minimum Match Score"><input type="number" value={form.minimum_match_score} onChange={e => setForm({ ...form, minimum_match_score: Number(e.target.value) })} className="input" /></F>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.auto_import} onChange={e => setForm({ ...form, auto_import: e.target.checked })} /> Auto Import</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.auto_analyse} onChange={e => setForm({ ...form, auto_analyse: e.target.checked })} /> Auto Analyse</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.auto_notify} onChange={e => setForm({ ...form, auto_notify: e.target.checked })} /> Auto Notify</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.auto_reject} onChange={e => setForm({ ...form, auto_reject: e.target.checked })} /> Auto Reject</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.require_human_review} onChange={e => setForm({ ...form, require_human_review: e.target.checked })} /> Require Human Review</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> Enabled</label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }) {
  return <label className="block"><span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>{children}</label>;
}
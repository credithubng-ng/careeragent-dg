import React, { useState } from "react";
import { useCollection } from "@/lib/entityHooks";
import { listOwnedRecords, createOwnedRecord, updateOwnedRecord, deleteOwnedRecord } from "@/lib/ownedEntities";
import { PageHeader, Loading, EmptyState, Notice } from "@/components/ui-kit";
import OINav from "@/components/opportunity-intelligence/OINav";
import { ukDateTime } from "@/lib/format";
import { Plus, Edit2, Trash2, Power } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

const FREQUENCIES = ["Hourly", "Every 2 Hours", "Every 4 Hours", "Every 6 Hours", "Every 12 Hours", "Daily", "Weekdays Only", "Weekends Only", "Manual Only"];
const SCHEDULE_STATUSES = ["Active", "Paused", "Configuration Required", "Error", "Not Yet Implemented"];
const STATUS_STYLES = {
  "Active": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Paused": "bg-amber-100 text-amber-700 border-amber-200",
  "Configuration Required": "bg-orange-100 text-orange-700 border-orange-200",
  "Error": "bg-rose-100 text-rose-700 border-rose-200",
  "Not Yet Implemented": "bg-slate-100 text-slate-500 border-slate-200",
};

export default function SearchSchedules() {
  const { data: schedules, loading, refetch } = useCollection("SearchSchedule", () => listOwnedRecords("SearchSchedule", {}, "-created_date", 200));
  const { data: sources } = useCollection("OpportunitySource", () => listOwnedRecords("OpportunitySource", {}, "-created_date", 200));
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  function openAdd() { setEditing(null); setShowForm(true); }
  function openEdit(s) { setEditing(s); setShowForm(true); }
  async function toggle(s) { const status = s.status === "Active" ? "Paused" : "Active"; try { await updateOwnedRecord("SearchSchedule", s.id, { status }); refetch(); } catch { toast.error("Failed to update"); } }
  async function remove(s) { if (!confirm(`Delete "${s.schedule_name}"?`)) return; try { await deleteOwnedRecord("SearchSchedule", s.id); refetch(); toast.success("Schedule deleted"); } catch { toast.error("Failed to delete"); } }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Search Schedules" subtitle="Configure how frequently each source is checked"
        actions={<button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add Schedule</button>} />
      <OINav />
      <Notice tone="amber">The actual scheduler respects Base44 execution limits. Configured frequency may differ from actual supported frequency. No source is shown as monitoring without a functioning backend process.</Notice>
      {schedules.length === 0 ? (
        <EmptyState title="No search schedules configured" description="Schedules control how often each source is checked for new vacancies." action={<button onClick={openAdd} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">Add Schedule</button>} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Schedule</th>
                <th className="text-left p-3 font-medium">Source</th>
                <th className="text-left p-3 font-medium">Configured</th>
                <th className="text-left p-3 font-medium">Actual</th>
                <th className="text-left p-3 font-medium">Last Run</th>
                <th className="text-left p-3 font-medium">Next Run</th>
                <th className="text-center p-3 font-medium">Found</th>
                <th className="text-center p-3 font-medium">Imported</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id} className="border-t border-border">
                  <td className="p-3 font-medium">{s.schedule_name}</td>
                  <td className="p-3 text-muted-foreground">{s.source_name || "—"}</td>
                  <td className="p-3">{s.configured_frequency}</td>
                  <td className="p-3">{s.actual_supported_frequency}</td>
                  <td className="p-3 text-muted-foreground">{s.last_run ? ukDateTime(s.last_run) : "—"}</td>
                  <td className="p-3 text-muted-foreground">{s.next_run || "—"}</td>
                  <td className="p-3 text-center">{s.jobs_found || 0}</td>
                  <td className="p-3 text-center">{s.jobs_imported || 0}</td>
                  <td className="p-3"><span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_STYLES[s.status] || STATUS_STYLES["Not Yet Implemented"])}>{s.status}</span></td>
                  <td className="p-3"><div className="flex gap-1">
                    <button onClick={() => toggle(s)} className="rounded p-1.5 hover:bg-muted"><Power className="h-4 w-4" /></button>
                    <button onClick={() => openEdit(s)} className="rounded p-1.5 hover:bg-muted"><Edit2 className="h-4 w-4" /></button>
                    <button onClick={() => remove(s)} className="rounded p-1.5 hover:bg-muted text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && <ScheduleForm schedule={editing} sources={sources} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); refetch(); }} />}
    </div>
  );
}

function ScheduleForm({ schedule, sources, onClose, onSaved }) {
  const [form, setForm] = useState(schedule || { schedule_name: "", source_id: "", source_name: "", configured_frequency: "Manual Only", actual_supported_frequency: "Manual Only", status: "Not Yet Implemented" });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!form.schedule_name.trim()) { toast.error("Schedule name is required"); return; }
    const src = sources.find(s => s.id === form.source_id);
    const data = { ...form, source_name: src?.source_name || "" };
    setSaving(true);
    try { if (data.id) await updateOwnedRecord("SearchSchedule", data.id, data); else await createOwnedRecord("SearchSchedule", data); toast.success("Schedule saved"); onSaved(); }
    catch (e) { toast.error(e?.message || "Failed to save"); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{form.id ? "Edit Schedule" : "Add Schedule"}</h2>
        <div className="space-y-3">
          <F label="Schedule Name"><input value={form.schedule_name} onChange={e => setForm({ ...form, schedule_name: e.target.value })} className="input" /></F>
          <F label="Source"><select value={form.source_id} onChange={e => setForm({ ...form, source_id: e.target.value })} className="input"><option value="">— Select source —</option>{sources.map(s => <option key={s.id} value={s.id}>{s.source_name}</option>)}</select></F>
          <F label="Configured Frequency"><select value={form.configured_frequency} onChange={e => setForm({ ...form, configured_frequency: e.target.value })} className="input">{FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}</select></F>
          <F label="Actual Supported Frequency"><select value={form.actual_supported_frequency} onChange={e => setForm({ ...form, actual_supported_frequency: e.target.value })} className="input">{FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}</select></F>
          <F label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="input">{SCHEDULE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></F>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Use "Not Yet Implemented" for schedules without a functioning backend process. Do not set "Active" unless a real scheduler exists.</p>
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
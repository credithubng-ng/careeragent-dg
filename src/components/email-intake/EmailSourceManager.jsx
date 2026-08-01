import React, { useState } from "react";
import { useCollection } from "@/lib/entityHooks";
import { SectionCard, Loading, EmptyState } from "@/components/ui-kit";
import { listOwnedRecords, createOwnedRecord, updateOwnedRecord, deleteOwnedRecord } from "@/lib/ownedEntities";
import { toast } from "react-hot-toast";
import { Plus, Save, Trash2, Pencil, X } from "lucide-react";

const PARSER_TYPES = [
  "Indeed", "Totaljobs", "CivilServiceJobs", "Adzuna", "Reed",
  "CVLibrary", "LinkedIn", "NHSJobs", "JobSwipe", "ExecThread", "Generic",
];

const DEFAULT_SOURCES = [
  { source_name: "Indeed", sender_domain: "indeed.com", subject_pattern: "job alert", parser_type: "Indeed", priority: 8, active_status: true },
  { source_name: "Totaljobs", sender_domain: "totaljobs.com", subject_pattern: "job alert", parser_type: "Totaljobs", priority: 7, active_status: true },
  { source_name: "Civil Service Jobs", sender_domain: "civijobs.com", subject_pattern: "job alert", parser_type: "CivilServiceJobs", priority: 7, active_status: true },
  { source_name: "Adzuna", sender_domain: "adzuna.com", subject_pattern: "job alert", parser_type: "Adzuna", priority: 6, active_status: true },
  { source_name: "Reed", sender_domain: "reed.co.uk", subject_pattern: "job alert", parser_type: "Reed", priority: 6, active_status: true },
  { source_name: "CV-Library", sender_domain: "cv-library.co.uk", subject_pattern: "job alert", parser_type: "CVLibrary", priority: 6, active_status: true },
  { source_name: "LinkedIn Job Alerts", sender_domain: "linkedin.com", subject_pattern: "job alert", parser_type: "LinkedIn", priority: 8, active_status: true },
  { source_name: "NHS Jobs", sender_domain: "nhs.uk", subject_pattern: "job alert", parser_type: "NHSJobs", priority: 5, active_status: true },
  { source_name: "JobSwipe", sender_domain: "jobswipe.com", subject_pattern: "job alert", parser_type: "JobSwipe", priority: 4, active_status: true },
  { source_name: "ExecThread", sender_domain: "execthread.com", subject_pattern: "job alert", parser_type: "ExecThread", priority: 5, active_status: true },
];

export default function EmailSourceManager() {
  const { data: sources, loading, refetch } = useCollection("EmailSource", () => listOwnedRecords("EmailSource", {}, "-priority", 50));
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function handleSeedDefaults() {
    try {
      for (const src of DEFAULT_SOURCES) {
        const exists = sources?.some((s) => s.source_name === src.source_name);
        if (!exists) {
          await createOwnedRecord("EmailSource", src);
        }
      }
      refetch();
      toast.success("Default sources added");
    } catch {
      toast.error("Failed to add default sources");
    }
  }

  async function handleSave() {
    if (!editing?.source_name) {
      toast.error("Source name is required");
      return;
    }
    try {
      if (editing.id) {
        await updateOwnedRecord("EmailSource", editing.id, editing);
      } else {
        await createOwnedRecord("EmailSource", editing);
      }
      refetch();
      setShowForm(false);
      setEditing(null);
      toast.success("Source saved");
    } catch {
      toast.error("Failed to save source");
    }
  }

  async function handleDelete(id) {
    try {
      await deleteOwnedRecord("EmailSource", id);
      refetch();
      toast.success("Source deleted");
    } catch {
      toast.error("Failed to delete source");
    }
  }

  if (loading) return <Loading label="Loading email sources…" />;

  return (
    <SectionCard
      title="Known Email Sources"
      description="Manage recognised job-alert senders and their parser settings"
      actions={
        <div className="flex gap-2">
          {(!sources || sources.length === 0) && (
            <button onClick={handleSeedDefaults} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
              <Plus className="h-4 w-4" /> Add Defaults
            </button>
          )}
          <button
            onClick={() => { setEditing({ source_name: "", sender_domain: "", subject_pattern: "job alert", parser_type: "Generic", priority: 5, active_status: true }); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Add Source
          </button>
        </div>
      }
    >
      {showForm && editing && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-foreground">{editing.id ? "Edit Source" : "New Source"}</p>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="Source name" value={editing.source_name} onChange={(v) => setEditing({ ...editing, source_name: v })} />
            <FormField label="Sender domain" value={editing.sender_domain} onChange={(v) => setEditing({ ...editing, sender_domain: v })} />
            <FormField label="Sender email (optional)" value={editing.sender_email || ""} onChange={(v) => setEditing({ ...editing, sender_email: v })} />
            <FormField label="Subject pattern" value={editing.subject_pattern} onChange={(v) => setEditing({ ...editing, subject_pattern: v })} />
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Parser type</label>
              <select value={editing.parser_type} onChange={(e) => setEditing({ ...editing, parser_type: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                {PARSER_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <FormField label="Priority (1-10)" type="number" value={editing.priority} onChange={(v) => setEditing({ ...editing, priority: Number(v) })} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.active_status} onChange={(e) => setEditing({ ...editing, active_status: e.target.checked })} />
              Active
            </label>
            <button onClick={handleSave} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium">
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        </div>
      )}

      {(!sources || sources.length === 0) ? (
        <EmptyState
          title="No email sources configured"
          description="Add the default set of known job-alert sources (Indeed, LinkedIn, Totaljobs, etc.) or add your own."
          action={<button onClick={handleSeedDefaults} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">Add Default Sources</button>}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Source</th>
                <th className="pb-2 pr-3 font-medium">Domain</th>
                <th className="pb-2 pr-3 font-medium">Parser</th>
                <th className="pb-2 pr-3 font-medium">Priority</th>
                <th className="pb-2 pr-3 font-medium">Imported</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sources.map((src) => (
                <tr key={src.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-medium text-foreground">{src.source_name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{src.sender_domain || "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{src.parser_type}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{src.priority}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{src.jobs_imported || 0}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${src.active_status ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {src.active_status ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(src); setShowForm(true); }} className="p-1 text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(src.id)} className="p-1 text-muted-foreground hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function FormField({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
      />
    </div>
  );
}
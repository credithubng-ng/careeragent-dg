import React, { useState } from "react";
import { useCollection } from "@/lib/entityHooks";
import { listOwnedRecords, createOwnedRecord, updateOwnedRecord, deleteOwnedRecord } from "@/lib/ownedEntities";
import { PageHeader, Loading, EmptyState, Notice } from "@/components/ui-kit";
import OINav from "@/components/opportunity-intelligence/OINav";
import { RULE_TYPE_STYLES } from "@/lib/oiUtils";
import { Plus, Edit2, Trash2, Power } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

const RULE_TYPES = Object.keys(RULE_TYPE_STYLES);
const SUGGESTED_RULES = [
  { rule_name: "Boost Banking roles", rule_type: "Boost", condition: "Sector contains Banking or Financial Services", action: "Increase priority by 10", priority: 8 },
  { rule_name: "Boost AI Governance", rule_type: "Boost", condition: "Title or keywords contain AI Governance", action: "Increase priority by 10", priority: 8 },
  { rule_name: "Prefer Governance over Engineering", rule_type: "Boost", condition: "Role has governance responsibilities", action: "Increase priority over pure engineering roles", priority: 7 },
  { rule_name: "Exclude Graduate roles", rule_type: "Exclude", condition: "Title contains Graduate, Intern or Apprentice", action: "Reject import", priority: 9 },
  { rule_name: "Exclude salary below minimum", rule_type: "Hard Stop", condition: "Salary below configured minimum", action: "Reject import", priority: 10 },
  { rule_name: "Require review for unclear sponsorship", rule_type: "Require Review", condition: "Sponsorship wording is unclear", action: "Flag for manual review", priority: 6 },
  { rule_name: "Reject expired vacancies", rule_type: "Hard Stop", condition: "Closing date has passed", action: "Reject import", priority: 10 },
  { rule_name: "Require review for security clearance", rule_type: "Require Review", condition: "Security clearance is mandatory", action: "Flag for manual review", priority: 6 },
];

export default function DiscoveryRules() {
  const { data: rules, loading, refetch } = useCollection("DiscoveryRule", () => listOwnedRecords("DiscoveryRule", {}, "-priority", 200));
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  function openAdd() { setEditing(null); setShowForm(true); }
  function openEdit(r) { setEditing(r); setShowForm(true); }
  async function toggle(r) { try { await updateOwnedRecord("DiscoveryRule", r.id, { enabled: !r.enabled }); refetch(); } catch { toast.error("Failed to update"); } }
  async function remove(r) { if (!confirm(`Delete "${r.rule_name}"?`)) return; try { await deleteOwnedRecord("DiscoveryRule", r.id); refetch(); toast.success("Rule deleted"); } catch { toast.error("Failed to delete"); } }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Discovery Rules" subtitle="Configure include, exclude, boost and hard-stop rules for vacancy filtering"
        actions={<button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add Rule</button>} />
      <OINav />
      <Notice tone="amber">Discovery rules do not override evidence-grounding safeguards. AI Match always verifies claims against your profile and Master CV.</Notice>
      {rules.length === 0 ? (
        <EmptyState title="No discovery rules configured" description="Rules help filter and prioritise vacancies automatically. Add rules or use the suggested defaults." action={<button onClick={openAdd} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">Add Rule</button>} />
      ) : (
        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{r.rule_name}</h3>
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", RULE_TYPE_STYLES[r.rule_type] || RULE_TYPE_STYLES["Include"])}>{r.rule_type}</span>
                    {!r.enabled && <span className="text-xs text-muted-foreground">(disabled)</span>}
                  </div>
                  {r.condition && <p className="text-sm text-muted-foreground mt-1"><strong>Condition:</strong> {r.condition}</p>}
                  {r.action && <p className="text-sm text-muted-foreground"><strong>Action:</strong> {r.action}</p>}
                  {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => toggle(r)} title={r.enabled ? "Disable" : "Enable"} className="rounded-lg p-2 hover:bg-muted"><Power className="h-4 w-4" /></button>
                  <button onClick={() => openEdit(r)} title="Edit" className="rounded-lg p-2 hover:bg-muted"><Edit2 className="h-4 w-4" /></button>
                  <button onClick={() => remove(r)} title="Delete" className="rounded-lg p-2 hover:bg-muted text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm && <RuleForm rule={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); refetch(); }} />}
    </div>
  );
}

function RuleForm({ rule, onClose, onSaved }) {
  const [form, setForm] = useState(rule || { rule_name: "", rule_type: "Include", condition: "", action: "", priority: 5, enabled: true, notes: "" });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!form.rule_name.trim()) { toast.error("Rule name is required"); return; }
    setSaving(true);
    try { if (form.id) await updateOwnedRecord("DiscoveryRule", form.id, form); else await createOwnedRecord("DiscoveryRule", form); toast.success("Rule saved"); onSaved(); }
    catch (e) { toast.error(e?.message || "Failed to save"); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{form.id ? "Edit Rule" : "Add Rule"}</h2>
        <div className="space-y-3">
          <F label="Rule Name"><input value={form.rule_name} onChange={e => setForm({ ...form, rule_name: e.target.value })} className="input" /></F>
          <F label="Rule Type"><select value={form.rule_type} onChange={e => setForm({ ...form, rule_type: e.target.value })} className="input">{RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></F>
          <F label="Condition"><textarea value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} className="input min-h-[60px]" placeholder="e.g. Sector contains Banking" /></F>
          <F label="Action"><input value={form.action} onChange={e => setForm({ ...form, action: e.target.value })} className="input" placeholder="e.g. Increase priority by 10" /></F>
          <F label="Priority (1-10)"><input type="number" min="1" max="10" value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} className="input" /></F>
          <F label="Notes"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input min-h-[40px]" /></F>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> Enabled</label>
        </div>
        {!form.id && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Suggested rules:</p>
            <div className="space-y-1">
              {SUGGESTED_RULES.map(r => <button key={r.rule_name} onClick={() => setForm({ ...form, ...r, enabled: true })} className="block w-full text-left rounded-lg border border-border p-2 text-xs hover:bg-muted">{r.rule_name} ({r.rule_type})</button>)}
            </div>
          </div>
        )}
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
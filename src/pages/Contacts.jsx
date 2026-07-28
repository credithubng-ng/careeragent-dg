import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState } from "@/components/ui-kit";
import { Plus, X, Save, Mail, Phone, Linkedin } from "lucide-react";
import { toast } from "react-hot-toast";

export default function Contacts() {
  const { data: contacts, loading, refetch } = useCollection("Contact", () => base44.entities.Contact.list("-created_date", 200));
  const { data: candidates } = useCollection("Candidate", () => base44.entities.Candidate.list());
  const [editing, setEditing] = useState(null);

  function blank() { return { name: "", employer: "", role: "", email: "", telephone: "", linkedin_url: "", source: "", notes: "" }; }

  async function save(c) {
    if (!c.name) { toast.error("Name required"); return; }
    const candidate = candidates[0];
    const payload = { ...c, candidate_id: candidate?.id };
    if (c.id) await base44.entities.Contact.update(c.id, payload);
    else await base44.entities.Contact.create(payload);
    setEditing(null); refetch(); toast.success("Contact saved");
  }

  async function remove(id) { if (confirm("Delete contact?")) { await base44.entities.Contact.delete(id); refetch(); toast.success("Deleted"); } }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Contacts" subtitle="Recruiters, hiring managers and referrals"
        actions={<button onClick={() => setEditing(blank())} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"><Plus className="h-4 w-4" /> Add Contact</button>} />

      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet" description="Add recruiters and hiring managers you're in conversation with." action={<button onClick={() => setEditing(blank())} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add Contact</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="font-medium text-foreground">{c.name}</p>
              <p className="text-sm text-muted-foreground">{c.role}{c.employer ? ` · ${c.employer}` : ""}</p>
              <div className="flex flex-col gap-1 mt-2 text-xs text-muted-foreground">
                {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Mail className="h-3 w-3" /> {c.email}</a>}
                {c.telephone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {c.telephone}</span>}
                {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Linkedin className="h-3 w-3" /> LinkedIn</a>}
              </div>
              {c.source && <p className="text-xs text-muted-foreground mt-2">Source: {c.source}</p>}
              <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                <button onClick={() => setEditing(c)} className="text-xs font-medium text-primary hover:underline">Edit</button>
                <button onClick={() => remove(c.id)} className="text-xs font-medium text-rose-500 hover:underline ml-auto">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-card rounded-xl border border-border shadow-lg w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-3"><h3 className="font-medium text-foreground">{editing.id ? "Edit Contact" : "Add Contact"}</h3><button onClick={() => setEditing(null)}><X className="h-5 w-5 text-muted-foreground" /></button></div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[["name", "Name"], ["employer", "Employer"], ["role", "Role"], ["source", "Source"], ["email", "Email"], ["telephone", "Telephone"]].map(([k, l]) => (
                <div key={k}><label className="block text-sm font-medium text-foreground mb-1">{l}</label><input value={editing[k] || ""} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></div>
              ))}
              <div className="md:col-span-2"><label className="block text-sm font-medium text-foreground mb-1">LinkedIn URL</label><input value={editing.linkedin_url || ""} onChange={(e) => setEditing({ ...editing, linkedin_url: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-foreground mb-1">Notes</label><textarea value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
              <button onClick={() => save(editing)} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><Save className="h-4 w-4" /> Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
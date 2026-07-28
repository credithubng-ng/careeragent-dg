import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatusBadge } from "@/components/ui-kit";
import { Plus, X, Save, ExternalLink } from "lucide-react";
import { toast } from "react-hot-toast";

const SOURCE_TYPES = ["Job Board", "Recruitment Agency", "Employer Career Site", "Email Alert", "Referral", "LinkedIn Contact", "Manual Entry", "API Feed", "Other"];

export default function JobSources() {
  const { data: sources, loading, refetch } = useCollection("JobSource", () => base44.entities.JobSource.list("-created_date", 100));
  const { data: candidates } = useCollection("Candidate", () => base44.entities.Candidate.list());
  const { data: jobs } = useCollection("Job", () => base44.entities.Job.list("-created_date", 300));
  const { data: applications } = useCollection("Application", () => base44.entities.Application.list("-created_date", 300));
  const { data: interviews } = useCollection("Interview", () => base44.entities.Interview.list("-created_date", 100));
  const [editing, setEditing] = useState(null);

  function blank() { return { source_name: "", source_type: "Job Board", website: "", active_status: true, reliability_rating: 3, notes: "" }; }

  async function save(s) {
    if (!s.source_name) { toast.error("Source name required"); return; }
    const candidate = candidates[0];
    const payload = { ...s, candidate_id: candidate?.id };
    if (s.id) await base44.entities.JobSource.update(s.id, payload);
    else await base44.entities.JobSource.create(payload);
    setEditing(null); refetch(); toast.success("Source saved");
  }

  const stats = (name) => {
    const srcJobs = jobs.filter((j) => j.job_source_name === name);
    const jobIds = new Set(srcJobs.map((j) => j.id));
    const apps = applications.filter((a) => jobIds.has(a.job_id)).length;
    const ints = interviews.filter((i) => jobIds.has(i.job_id)).length;
    return { jobs: srcJobs.length, apps, ints };
  };

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Job Sources" subtitle="Track where your opportunities come from"
        actions={<button onClick={() => setEditing(blank())} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"><Plus className="h-4 w-4" /> Add Source</button>} />

      {sources.length === 0 ? (
        <EmptyState title="No sources yet" description="Add job boards, agencies and referral sources." action={<button onClick={() => setEditing(blank())} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add Source</button>} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Source</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Jobs</th><th className="px-4 py-3 text-center">Apps</th><th className="px-4 py-3 text-center">Interviews</th>
                <th className="px-4 py-3 text-center">Reliability</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sources.map((s) => {
                const st = stats(s.source_name);
                return (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3"><div className="font-medium text-foreground">{s.source_name}</div>{s.website && <a href={s.website} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">{s.website}<ExternalLink className="h-3 w-3" /></a>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.source_type}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.active_status ? "Active" : "Archived"} /></td>
                    <td className="px-4 py-3 text-center">{st.jobs}</td>
                    <td className="px-4 py-3 text-center">{st.apps}</td>
                    <td className="px-4 py-3 text-center">{st.ints}</td>
                    <td className="px-4 py-3 text-center">{s.reliability_rating ? `${s.reliability_rating}/5` : "—"}</td>
                    <td className="px-4 py-3"><button onClick={() => setEditing(s)} className="text-xs font-medium text-primary hover:underline">Edit</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-card rounded-xl border border-border shadow-lg w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-3"><h3 className="font-medium text-foreground">{editing.id ? "Edit Source" : "Add Source"}</h3><button onClick={() => setEditing(null)}><X className="h-5 w-5 text-muted-foreground" /></button></div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2"><label className="block text-sm font-medium text-foreground mb-1">Source name</label><input value={editing.source_name} onChange={(e) => setEditing({ ...editing, source_name: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-foreground mb-1">Type</label><select value={editing.source_type} onChange={(e) => setEditing({ ...editing, source_type: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">{SOURCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-foreground mb-1">Reliability (1-5)</label><input type="number" min="1" max="5" value={editing.reliability_rating ?? ""} onChange={(e) => setEditing({ ...editing, reliability_rating: Number(e.target.value) })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-foreground mb-1">Website</label><input value={editing.website || ""} onChange={(e) => setEditing({ ...editing, website: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-foreground mb-1">Notes</label><textarea value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3 text-sm" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active_status} onChange={(e) => setEditing({ ...editing, active_status: e.target.checked })} /> Active</label>
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
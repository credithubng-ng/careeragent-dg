import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatusBadge } from "@/components/ui-kit";
import { ukDate, ukDateTime, daysUntil, todayISO } from "@/lib/format";
import { generateInterviewQuestions } from "@/lib/careerAI";
import { Plus, X, Save, Sparkles, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

const FORMATS = ["In Person", "Video", "Phone", "Assessment Centre", "Panel"];
const PREP = ["Not Started", "In Progress", "Prepared", "Completed"];

export default function Interviews() {
  const { data: interviews, loading, refetch } = useCollection("Interview", () => base44.entities.Interview.list("-interview_date", 100));
  const { data: candidates } = useCollection("Candidate", () => base44.entities.Candidate.list());
  const [editing, setEditing] = useState(null);
  const [generating, setGenerating] = useState(null);

  function blank() { return { employer: "", job_title: "", interview_stage: "First Interview", interview_date: todayISO(), interview_format: "Video", preparation_status: "Not Started", likely_questions: [] }; }

  async function save(iv) {
    if (!iv.employer) { toast.error("Employer required"); return; }
    const candidate = candidates[0];
    const payload = { ...iv, candidate_id: candidate?.id };
    if (iv.id) await base44.entities.Interview.update(iv.id, payload);
    else await base44.entities.Interview.create(payload);
    setEditing(null); refetch(); toast.success("Interview saved");
  }

  async function genQuestions(iv) {
    setGenerating(iv.id);
    try {
      const job = iv.job_id ? await base44.entities.Job.get(iv.job_id) : { job_title: iv.job_title, employer: iv.employer };
      const candidate = candidates[0];
      const qs = await generateInterviewQuestions(job, candidate);
      await base44.entities.Interview.update(iv.id, { likely_questions: qs });
      refetch();
      toast.success("Questions generated");
    } catch { toast.error("Failed to generate questions"); }
    finally { setGenerating(null); }
  }

  if (loading) return <Loading />;

  const upcoming = interviews.filter((i) => { const d = daysUntil(i.interview_date); return d != null && d >= -1; }).sort((a, b) => new Date(a.interview_date) - new Date(b.interview_date));
  const past = interviews.filter((i) => { const d = daysUntil(i.interview_date); return d != null && d < -1; });

  return (
    <div>
      <PageHeader title="Interviews" subtitle="Prepare and track your interview pipeline"
        actions={<button onClick={() => setEditing(blank())} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"><Plus className="h-4 w-4" /> Add Interview</button>} />

      {interviews.length === 0 && !editing ? (
        <EmptyState title="No interviews yet" description="Add an interview from a job or here." action={<button onClick={() => setEditing(blank())} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add Interview</button>} />
      ) : (
        <div className="space-y-6">
          <SectionCard title="Upcoming">
            {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming interviews.</p> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcoming.map((iv) => <InterviewCard key={iv.id} iv={iv} onEdit={() => setEditing(iv)} onGen={() => genQuestions(iv)} generating={generating === iv.id} />)}
              </div>
            )}
          </SectionCard>
          {past.length > 0 && (
            <SectionCard title="Past">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {past.map((iv) => <InterviewCard key={iv.id} iv={iv} onEdit={() => setEditing(iv)} onGen={() => genQuestions(iv)} generating={generating === iv.id} />)}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-card rounded-xl border border-border shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-3 sticky top-0 bg-card">
              <h3 className="font-medium text-foreground">{editing.id ? "Edit Interview" : "Add Interview"}</h3>
              <button onClick={() => setEditing(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Employer"><input value={editing.employer} onChange={(e) => setEditing({ ...editing, employer: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
              <Field label="Job title"><input value={editing.job_title || ""} onChange={(e) => setEditing({ ...editing, job_title: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
              <Field label="Stage"><input value={editing.interview_stage || ""} onChange={(e) => setEditing({ ...editing, interview_stage: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
              <Field label="Date & time"><input type="datetime-local" value={(editing.interview_date || "").replace(" ", "T")} onChange={(e) => setEditing({ ...editing, interview_date: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
              <Field label="Format"><select value={editing.interview_format} onChange={(e) => setEditing({ ...editing, interview_format: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">{FORMATS.map((f) => <option key={f}>{f}</option>)}</select></Field>
              <Field label="Preparation status"><select value={editing.preparation_status} onChange={(e) => setEditing({ ...editing, preparation_status: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">{PREP.map((f) => <option key={f}>{f}</option>)}</select></Field>
              <Field label="Location / link" full><input value={editing.location_or_link || ""} onChange={(e) => setEditing({ ...editing, location_or_link: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
              <Field label="Interviewers" full><input value={editing.interviewers || ""} onChange={(e) => setEditing({ ...editing, interviewers: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
              <Field label="Key competencies" full><textarea value={editing.key_competencies || ""} onChange={(e) => setEditing({ ...editing, key_competencies: e.target.value })} className="w-full min-h-[60px] rounded-lg border border-input bg-card p-3 text-sm" /></Field>
              <Field label="Candidate questions" full><textarea value={editing.candidate_questions || ""} onChange={(e) => setEditing({ ...editing, candidate_questions: e.target.value })} className="w-full min-h-[60px] rounded-lg border border-input bg-card p-3 text-sm" /></Field>
              <Field label="STAR examples" full><textarea value={editing.star_examples || ""} onChange={(e) => setEditing({ ...editing, star_examples: e.target.value })} className="w-full min-h-[60px] rounded-lg border border-input bg-card p-3 text-sm" /></Field>
              <Field label="Research notes (manual)" full><textarea value={editing.research_notes || ""} onChange={(e) => setEditing({ ...editing, research_notes: e.target.value })} className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3 text-sm" /></Field>
              <Field label="Outcome" full><input value={editing.outcome || ""} onChange={(e) => setEditing({ ...editing, outcome: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></Field>
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

function InterviewCard({ iv, onEdit, onGen, generating }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-foreground">{iv.job_title || "—"}</p>
          <p className="text-sm text-muted-foreground">{iv.employer}</p>
        </div>
        <StatusBadge status={iv.preparation_status} />
      </div>
      <p className="text-sm text-foreground mt-2">{ukDateTime(iv.interview_date)}</p>
      <p className="text-xs text-muted-foreground">{iv.interview_format} · {iv.interview_stage}</p>
      {iv.location_or_link && <p className="text-xs text-muted-foreground mt-1 truncate">{iv.location_or_link}</p>}
      {iv.likely_questions?.length > 0 && (
        <div className="mt-3 rounded-lg bg-muted/30 p-3">
          <p className="text-xs font-medium text-foreground mb-1">Likely questions</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">{iv.likely_questions.slice(0, 4).map((q, i) => <li key={i}>{q}</li>)}</ul>
        </div>
      )}
      <div className="flex gap-2 mt-3 pt-3 border-t border-border">
        <button onClick={onEdit} className="text-xs font-medium text-primary hover:underline">Edit</button>
        <button onClick={onGen} disabled={generating} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary">{generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Generate questions</button>
      </div>
    </div>
  );
}

function Field({ label, children, full }) {
  return <div className={full ? "md:col-span-2" : ""}><label className="block text-sm font-medium text-foreground mb-1">{label}</label>{children}</div>;
}
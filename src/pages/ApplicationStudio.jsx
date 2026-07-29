import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, Notice } from "@/components/ui-kit";
import { generateApplicationSection } from "@/lib/careerAI";
import { todayISO, ukDateTime } from "@/lib/format";
import { Sparkles, Check, Loader2, Wand2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { createOwnedRecord } from "@/lib/ownedEntities";

const SECTIONS = [
  { type: "Tailored Profile", label: "Tailored Profile", desc: "Revised professional summary aligned with the role" },
  { type: "CV Improvement", label: "CV Improvement", desc: "Recommendations to strengthen your CV" },
  { type: "Cover Letter", label: "Cover Letter", desc: "Professional UK-style cover letter" },
  { type: "Supporting Statement", label: "Supporting Statement", desc: "Role-specific supporting statement" },
  { type: "Recruiter Message", label: "Recruiter Message", desc: "Concise LinkedIn/email introduction" },
];

async function listOwnedRecords(entityName, query = {}, sort, limit) {
  const user = await base44.auth.me();
  const ownerEmail =
    typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!ownerEmail) throw new Error("A signed-in user with an email address is required.");
  return base44.entities[entityName].filter(
    { ...query, owner_email: ownerEmail },
    sort,
    limit
  );
}

export default function ApplicationStudio() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get("jobId");
  const [job, setJob] = useState(jobId ? null : null);
  const [docs, setDocs] = useState([]);
  const [match, setMatch] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [question, setQuestion] = useState("");
  const [generating, setGenerating] = useState(null);
  const { data: candidates, loading: candidatesLoading } = useCollection(
    "Candidate",
    () => listOwnedRecords("Candidate")
  );
  const { data: cvs, loading: cvsLoading } = useCollection(
    "CV",
    () => listOwnedRecords("CV")
  );
  const { data: allJobs } = useCollection(
    "Job",
    () => listOwnedRecords("Job", {}, "-created_date", 200)
  );

  useEffect(() => {
    if (!jobId) return;
    (async () => {
      try {
        setLoadError("");
        const [jobs, documents, matches] = await Promise.all([
          listOwnedRecords("Job", { id: jobId }),
          listOwnedRecords("ApplicationDocument", { job_id: jobId }, "-created_date", 50),
          listOwnedRecords("JobMatch", { job_id: jobId }, "-created_date", 1),
        ]);
        if (!jobs[0]) throw new Error("This job was not found in your account.");
        setJob(jobs[0]);
        setDocs(documents);
        setMatch(matches[0] || null);
      } catch (error) {
        setLoadError(error?.message || "Unable to load Application Studio.");
      }
    })();
  }, [jobId]);

  async function generate(section, questionText) {
    if (candidatesLoading || cvsLoading) {
      toast.error("Your Candidate Profile and Master CV are still loading.");
      return;
    }
    const candidate = candidates[0];
    if (!candidate) { toast.error("Create a candidate profile first"); return; }
    const master = cvs.find((c) =>
      c.is_master && c.processing_status === "Ready" && c.extracted_cv_text?.trim()
    );
    if (!master) {
      toast.error("Upload and process a Master CV before generating application content.");
      return;
    }
    const verifiedEvidence = [
      ...(match?.strong_reasons || []),
      ...(match?.partial_reasons || []),
      ...(match?.transferable_strengths || []),
    ];
    if (!match || verifiedEvidence.length === 0) {
      toast.error("Run a successful AI Match Analysis for this job first.");
      return;
    }
    setGenerating(section);
    const t = toast.loading(`Generating ${section}…`);
    try {
      const generated = await generateApplicationSection(
        section,
        job,
        candidate,
        master,
        match,
        questionText
      );
      const created = await createOwnedRecord("ApplicationDocument", {
        candidate_id: candidate.id, job_id: jobId, document_type: section, title: section,
        content: generated.content,
        source_cv_id: master?.id, date_generated: todayISO(), approval_status: "Draft", question_text: questionText || "",
        source_job_match_id: match.id,
        evidence_quotes: generated.evidenceQuotes,
        grounding_status: "Verified",
        generated_at: new Date().toISOString(),
      });
      setDocs((current) => [created, ...current]);
      toast.success(`${section} generated`, { id: t });
    } catch (error) {
      toast.error(error?.message || "Generation failed. Nothing was saved.", { id: t });
    }
    finally { setGenerating(null); }
  }

  async function updateDoc(id, payload) {
    try {
      await base44.entities.ApplicationDocument.update(id, payload);
      setDocs((current) => current.map((d) => (d.id === id ? { ...d, ...payload } : d)));
      return true;
    } catch (error) {
      toast.error(error?.message || "Unable to save your changes.");
      return false;
    }
  }

  async function approve(id, current) {
    const status = current === "Approved" ? "Not Approved" : "Approved";
    const document = docs.find((item) => item.id === id);
    if (
      status === "Approved" &&
      !["Verified", "Candidate Edited"].includes(document?.grounding_status)
    ) {
      toast.error("Regenerate this document with verified evidence before approving it.");
      return;
    }
    const saved = await updateDoc(id, { approval_status: status });
    if (saved) {
      toast.success(status === "Approved" ? "Marked approved" : "Marked not approved");
    }
  }

  const selectedJob = job || allJobs.find((j) => j.id === jobId);

  if (!jobId) {
    return (
      <div>
        <PageHeader title="Application Studio" subtitle="Generate tailored, reviewable application content for a specific role" />
        <SectionCard title="Select a Job">
          <div className="space-y-2">
            {allJobs.map((j) => (
              <button key={j.id} onClick={() => setParams({ jobId: j.id })} className="w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-muted">
                <p className="text-sm font-medium text-foreground">{j.job_title}</p>
                <p className="text-xs text-muted-foreground">{j.employer} · {j.location}</p>
              </button>
            ))}
          </div>
        </SectionCard>
      </div>
    );
  }

  if (loadError) {
    return <EmptyState title="Unable to open Application Studio" description={loadError} />;
  }
  if (!selectedJob) return <Loading />;

  return (
    <div>
      <Link to={`/jobs/${jobId}`} className="text-sm text-muted-foreground hover:text-foreground">← {selectedJob.job_title}</Link>
      <PageHeader title="Application Studio" subtitle={`${selectedJob.job_title} — ${selectedJob.employer}`} />
      <Notice tone="amber">AI drafts use your verified match evidence, Candidate Profile and Master CV. Review and approve every document before use.</Notice>
      {!match && (
        <Notice tone="rose">Run AI Match Analysis for this job before generating application content.</Notice>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {SECTIONS.map((s) => {
          const doc = docs.find((d) => d.document_type === s.type);
          return (
            <SectionCard key={s.type} title={s.label} description={s.desc}
              actions={doc ? <span className={cn("text-xs font-medium rounded-full px-2 py-0.5", doc.approval_status === "Approved" ? "bg-emerald-100 text-emerald-700" : doc.approval_status === "Not Approved" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>{doc.approval_status}</span> : null}>
              {doc ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Generated {ukDateTime(doc.generated_at || doc.date_generated)} · {doc.grounding_status || "Legacy draft"}</p>
                  <textarea defaultValue={doc.content} onBlur={(e) => updateDoc(doc.id, { content: e.target.value, grounding_status: "Candidate Edited" })} className="w-full min-h-[180px] rounded-lg border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => generate(s.type)} disabled={generating === s.type} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">{generating === s.type ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Regenerate</button>
                    <button onClick={() => approve(doc.id, doc.approval_status)} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium", doc.approval_status === "Approved" ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground")}><Check className="h-3.5 w-3.5" /> {doc.approval_status === "Approved" ? "Approved" : "Approve"}</button>
                  </div>
                </div>
              ) : (
                <EmptyState title={`No ${s.label} yet`} description="Generate draft content based on your profile and CV." action={<button onClick={() => generate(s.type)} disabled={generating === s.type} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium">{generating === s.type ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Generate</button>} />
              )}
            </SectionCard>
          );
        })}

        {/* Application questions */}
        <SectionCard title="Application Questions" description="Paste a question and generate a draft answer" className="lg:col-span-2">
          <div className="flex gap-2 mb-3">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Paste an application question…" className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <button onClick={() => generate("Application Question", question.trim())} disabled={!question.trim() || generating === "Application Question"} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50">{generating === "Application Question" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate Answer</button>
          </div>
          <div className="space-y-3">
            {docs.filter((d) => d.document_type === "Application Question").map((d) => (
              <div key={d.id} className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-foreground mb-1">Q: {d.question_text}</p>
                <p className="text-[11px] text-muted-foreground mb-2">Generated {ukDateTime(d.generated_at || d.date_generated)} · {d.approval_status} · {d.grounding_status || "Legacy draft"}</p>
                <textarea defaultValue={d.content} onBlur={(e) => updateDoc(d.id, { content: e.target.value, grounding_status: "Candidate Edited" })} className="w-full min-h-[120px] rounded-lg border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <div className="flex justify-end mt-2">
                  <button onClick={() => approve(d.id, d.approval_status)} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium", d.approval_status === "Approved" ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground")}><Check className="h-3.5 w-3.5" /> {d.approval_status === "Approved" ? "Approved" : "Approve"}</button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

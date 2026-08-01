import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, Notice } from "@/components/ui-kit";
import { generateApplicationSection } from "@/lib/careerAI";
import { todayISO, ukDateTime } from "@/lib/format";
import { Sparkles, Check, Loader2, Wand2, Send, Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { createOwnedRecord } from "@/lib/ownedEntities";
import DocumentView, { markdownToHtml } from "@/components/DocumentView";
import ReadinessChecklist from "@/components/ReadinessChecklist";

const SECTIONS = [
  { type: "Tailored Profile", label: "Tailored Profile", desc: "Revised professional summary aligned with the role" },
  { type: "CV Improvement", label: "CV Improvement", desc: "Recommendations to strengthen your CV" },
  { type: "Cover Letter", label: "Cover Letter", desc: "Professional UK-style cover letter" },
  { type: "Supporting Statement", label: "Supporting Statement", desc: "Role-specific supporting statement" },
  { type: "Recruiter Message", label: "Recruiter Message", desc: "Concise LinkedIn/email introduction" },
];

const PREPARATION_STAGES = ["Identified", "Reviewing", "Preparing"];

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function safeFileName(value) {
  return String(value || "document")
    .replace(/[^a-z0-9 _-]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "document";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
  const [application, setApplication] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [question, setQuestion] = useState("");
  const [generating, setGenerating] = useState(null);
  const [showSubmission, setShowSubmission] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingDocs, setEditingDocs] = useState({});
  const [submission, setSubmission] = useState({
    application_method: "Employer website",
    date_applied: todayISO(),
    follow_up_date: "",
    notes: "",
  });
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
        const [jobs, documents, matches, applications] = await Promise.all([
          listOwnedRecords("Job", { id: jobId }),
          listOwnedRecords("ApplicationDocument", { job_id: jobId }, "-created_date", 50),
          listOwnedRecords("JobMatch", { job_id: jobId }, "-created_date", 1),
          listOwnedRecords("Application", { job_id: jobId }, "-created_date", 1),
        ]);
        if (!jobs[0]) throw new Error("This job was not found in your account.");
        setJob(jobs[0]);
        setDocs(documents);
        setMatch(matches[0] || null);
        setApplication(applications[0] || null);
      } catch (error) {
        setLoadError(error?.message || "Unable to load Application Studio.");
      }
    })();
  }, [jobId]);

  async function ensureApplication(candidate, master) {
    if (application) {
      if (["Identified", "Reviewing"].includes(application.stage)) {
        await base44.entities.Application.update(application.id, { stage: "Preparing" });
        const updated = { ...application, stage: "Preparing" };
        setApplication(updated);
        await syncPreparingJobStatus();
        return updated;
      }
      if (application.stage === "Preparing") await syncPreparingJobStatus();
      return application;
    }

    const existing = await listOwnedRecords("Application", { job_id: job.id }, "-created_date", 1);
    if (existing[0]) {
      const tracked = existing[0];
      if (["Identified", "Reviewing"].includes(tracked.stage)) {
        await base44.entities.Application.update(tracked.id, { stage: "Preparing" });
        const updated = { ...tracked, stage: "Preparing" };
        setApplication(updated);
        await syncPreparingJobStatus();
        return updated;
      }
      setApplication(tracked);
      return tracked;
    }

    const created = await createOwnedRecord("Application", {
      candidate_id: candidate.id,
      job_id: job.id,
      job_title: job.job_title,
      employer: job.employer,
      contact_person: job.contact_person || "",
      cv_id: master.id,
      cv_name: master.cv_name,
      stage: "Preparing",
      application_document_ids: [],
    });
    setApplication(created);
    await syncPreparingJobStatus();
    return created;
  }

  async function syncPreparingJobStatus() {
    try {
      await base44.entities.Job.update(job.id, { job_status: "Preparing Application" });
    } catch {
      toast.error("Application tracking started, but the Job status could not be updated.");
    }
  }

  async function confirmVacancy() {
    try {
      const dateStr = todayISO();
      await base44.entities.Job.update(job.id, {
        vacancy_confirmed_active: true,
        vacancy_confirmed_date: dateStr,
      });
      setJob((current) => ({
        ...current,
        vacancy_confirmed_active: true,
        vacancy_confirmed_date: dateStr,
      }));
      toast.success("Vacancy confirmed active");
    } catch (error) {
      toast.error(error?.message || "Unable to confirm the vacancy.");
    }
  }

  async function generate(section, questionText) {
    if (candidatesLoading || cvsLoading) {
      toast.error("Your profile and Master CV are still loading.");
      return;
    }
    const candidate = candidates[0];
    if (!candidate) { toast.error("Create your profile first"); return; }
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
      const trackedApplication = await ensureApplication(candidate, master);
      const created = await createOwnedRecord("ApplicationDocument", {
        candidate_id: candidate.id, job_id: jobId, document_type: section, title: section,
        content: generated.content,
        application_id: trackedApplication.id,
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

  async function copyText(content, label) {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Unable to copy automatically. Select the text and copy it manually.");
    }
  }

  function downloadWord(document) {
    const bodyHtml = markdownToHtml(document.content);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(document.title)}</title><style>body{font-family:Calibri,Arial,sans-serif;line-height:1.5;color:#1a1a1a;margin:48px 56px;font-size:11pt}h1{font-size:18pt;font-weight:bold;margin:0 0 6pt}h2{font-size:13pt;font-weight:bold;margin:16pt 0 6pt}h3{font-size:11.5pt;font-weight:bold;margin:12pt 0 4pt}p{margin:0 0 8pt}ul,ol{margin:0 0 8pt 18pt}li{margin:0 0 3pt}strong{font-weight:bold}em{font-style:italic}blockquote{border-left:3pt solid #ccc;margin:0 0 8pt;padding-left:10pt;color:#555;font-style:italic}hr{border:none;border-top:1pt solid #ccc;margin:12pt 0}</style></head><body><h1>${escapeHtml(document.title)}</h1><p><strong>${escapeHtml(job.job_title)} — ${escapeHtml(job.employer)}</strong></p>${bodyHtml}</body></html>`;
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(job.employer)}-${safeFileName(document.document_type)}.doc`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function copyApprovedPack() {
    const approved = docs.filter((document) => document.approval_status === "Approved");
    if (approved.length === 0) {
      toast.error("Approve at least one document first.");
      return;
    }
    const content = approved
      .map((document) => `${document.title}\n\n${document.content}`)
      .join("\n\n----------------------------------------\n\n");
    await copyText(content, "Approved application pack");
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
    try {
      let trackedApplication = application;
      if (!trackedApplication) {
        const candidate = candidates[0];
        const master = cvs.find(
          (cv) => cv.is_master && cv.processing_status === "Ready" && cv.extracted_cv_text?.trim()
        );
        if (!candidate || !master) {
          toast.error("Your profile and a processed Master CV are required.");
          return;
        }
        trackedApplication = await ensureApplication(candidate, master);
      }
      const saved = await updateDoc(id, { approval_status: status });
      if (saved) {
        await syncApprovedDocument(document, status, trackedApplication);
        toast.success(status === "Approved" ? "Marked approved" : "Marked not approved");
      }
    } catch (error) {
      toast.error(error?.message || "The document changed, but its tracker link could not be updated.");
    }
  }

  async function syncApprovedDocument(document, status, trackedApplication) {
    const updatedDocuments = docs.map((item) =>
      item.id === document.id ? { ...item, approval_status: status } : item
    );
    const approvedDocuments = updatedDocuments.filter(
      (item) => item.approval_status === "Approved"
    );
    const documentIds = approvedDocuments.map((item) => item.id);
    const payload = { application_document_ids: documentIds };

    if (document.document_type === "Cover Letter") {
      payload.cover_letter_id =
        approvedDocuments.find((item) => item.document_type === "Cover Letter")?.id || "";
    }
    if (document.document_type === "Supporting Statement") {
      payload.supporting_statement_id =
        approvedDocuments.find((item) => item.document_type === "Supporting Statement")?.id || "";
    }

    await base44.entities.Application.update(trackedApplication.id, payload);
    const updated = { ...trackedApplication, ...payload };
    setApplication(updated);
  }

  async function markReadyToApply() {
    const approvedCoreDocument = docs.some(
      (document) =>
        ["Cover Letter", "Supporting Statement"].includes(document.document_type) &&
        document.approval_status === "Approved" &&
        application?.application_document_ids?.includes(document.id)
    );
    if (!application || !approvedCoreDocument) {
      toast.error("Approve a Cover Letter or Supporting Statement before marking this application ready.");
      return;
    }
    try {
      await base44.entities.Application.update(application.id, { stage: "Ready to Apply" });
      const updated = { ...application, stage: "Ready to Apply" };
      setApplication(updated);
      toast.success("Application marked Ready to Apply");
    } catch (error) {
      toast.error(error?.message || "Unable to update the application.");
    }
  }

  async function markApplied() {
    if (!application || application.stage !== "Ready to Apply") {
      toast.error("Mark the application Ready to Apply first.");
      return;
    }
    setShowSubmission(true);
  }

  async function confirmApplied() {
    if (!application || application.stage !== "Ready to Apply") {
      toast.error("Mark the application Ready to Apply first.");
      return;
    }
    if (!submission.application_method.trim() || !submission.date_applied) {
      toast.error("Enter the application method and application date.");
      return;
    }
    if (submission.date_applied > todayISO()) {
      toast.error("The application date cannot be in the future.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        stage: "Applied",
        application_method: submission.application_method.trim(),
        date_applied: submission.date_applied,
        follow_up_date: submission.follow_up_date || "",
        notes: submission.notes.trim(),
      };
      await base44.entities.Application.update(application.id, payload);
      const updated = { ...application, ...payload };
      setApplication(updated);
      setShowSubmission(false);
      try {
        await base44.entities.Job.update(job.id, { job_status: "Applied" });
        toast.success("Application marked Applied");
      } catch {
        toast.error("Application marked Applied, but the Job status could not be updated.");
      }
    } catch (error) {
      toast.error(error?.message || "Unable to mark the application as applied.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedJob = job || allJobs.find((j) => j.id === jobId);
  const applicationUrl = safeExternalUrl(selectedJob?.original_job_url);

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
      <Notice tone="amber">AI drafts use your verified match evidence, profile and Master CV. Review and approve every document before use.</Notice>
      {!match && (
        <Notice tone="rose">Run AI Match Analysis for this job before generating application content.</Notice>
      )}
      {application && (
        <SectionCard
          title="Application Tracking"
          description={`Current stage: ${application.stage}`}
          className="mt-4"
          actions={
            <div className="flex flex-wrap gap-2">
              {PREPARATION_STAGES.includes(application.stage) && (
                <button onClick={markReadyToApply} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium">
                  <Check className="h-4 w-4" /> Ready to Apply
                </button>
              )}
              {application.stage === "Ready to Apply" && (
                <button onClick={markApplied} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium">
                  <Send className="h-4 w-4" /> Mark Applied
                </button>
              )}
            </div>
          }
        >
          <p className="text-sm text-muted-foreground">
            Approved documents are linked automatically to this tracked application.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={copyApprovedPack} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
              <Copy className="h-4 w-4" /> Copy Approved Pack
            </button>
            {applicationUrl && (
              <a href={applicationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                <ExternalLink className="h-4 w-4" /> Open Application Page
              </a>
            )}
          </div>
        </SectionCard>
      )}
      {showSubmission && (
        <SectionCard title="Confirm Application Submission" description="Record the external submission after you have applied." className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-xs font-medium text-muted-foreground mb-1">Application method</span>
              <select value={submission.application_method} onChange={(e) => setSubmission({ ...submission, application_method: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2">
                <option>Employer website</option>
                <option>Email</option>
                <option>Recruiter</option>
                <option>LinkedIn</option>
                <option>Job board</option>
                <option>Other</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-muted-foreground mb-1">Date applied</span>
              <input type="date" max={todayISO()} value={submission.date_applied} onChange={(e) => setSubmission({ ...submission, date_applied: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-muted-foreground mb-1">Follow-up date</span>
              <input type="date" min={submission.date_applied || todayISO()} value={submission.follow_up_date} onChange={(e) => setSubmission({ ...submission, follow_up_date: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2" />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block text-xs font-medium text-muted-foreground mb-1">Submission notes</span>
              <textarea value={submission.notes} onChange={(e) => setSubmission({ ...submission, notes: e.target.value })} className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3" placeholder="Reference number, portal used, recruiter details or next steps…" />
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setShowSubmission(false)} disabled={submitting} className="rounded-lg border border-border px-3 py-2 text-sm">Cancel</button>
            <button onClick={confirmApplied} disabled={submitting} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-medium disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Confirm Applied
            </button>
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="lg:col-span-2">
          <ReadinessChecklist
            job={selectedJob}
            match={match}
            docs={docs}
            cvs={cvs}
            application={application}
            onReadyToApply={application && PREPARATION_STAGES.includes(application.stage) ? markReadyToApply : undefined}
            onConfirmVacancy={confirmVacancy}
            readyDisabled={!application || !PREPARATION_STAGES.includes(application.stage)}
          />
        </div>
        {SECTIONS.map((s) => {
          const doc = docs.find((d) => d.document_type === s.type);
          return (
            <SectionCard key={s.type} title={s.label} description={s.desc}
              actions={doc ? <span className={cn("text-xs font-medium rounded-full px-2 py-0.5", doc.approval_status === "Approved" ? "bg-emerald-100 text-emerald-700" : doc.approval_status === "Not Approved" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>{doc.approval_status}</span> : null}>
              {doc ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Generated {ukDateTime(doc.generated_at || doc.date_generated)} · {doc.grounding_status || "Legacy draft"}</p>
                  <DocumentView
                    content={doc.content || ""}
                    editing={!!editingDocs[doc.id]}
                    onEditChange={(editing) => setEditingDocs((prev) => ({ ...prev, [doc.id]: editing }))}
                    onChange={(value) => setDocs((current) => current.map((item) => item.id === doc.id ? { ...item, content: value, grounding_status: "Candidate Edited", approval_status: "Draft" } : item))}
                    onBlur={(value) => updateDoc(doc.id, { content: value, grounding_status: "Candidate Edited", approval_status: "Draft" })}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">{wordCount(doc.content)} words · {String(doc.content || "").length} characters</p>
                  <div className="flex flex-wrap justify-end gap-2 mt-2">
                    <button onClick={() => copyText(doc.content, doc.title)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"><Copy className="h-3.5 w-3.5" /> Copy</button>
                    <button onClick={() => downloadWord(doc)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"><Download className="h-3.5 w-3.5" /> Word</button>
                    <button onClick={() => generate(s.type)} disabled={Boolean(generating)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">{generating === s.type ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Regenerate</button>
                    <button onClick={() => approve(doc.id, doc.approval_status)} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium", doc.approval_status === "Approved" ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground")}><Check className="h-3.5 w-3.5" /> {doc.approval_status === "Approved" ? "Approved" : "Approve"}</button>
                  </div>
                </div>
              ) : (
                <EmptyState title={`No ${s.label} yet`} description="Generate draft content based on your profile and CV." action={<button onClick={() => generate(s.type)} disabled={Boolean(generating)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50">{generating === s.type ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Generate</button>} />
              )}
            </SectionCard>
          );
        })}

        {/* Application questions */}
        <SectionCard title="Application Questions" description="Paste a question and generate a draft answer" className="lg:col-span-2">
          <div className="flex gap-2 mb-3">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Paste an application question…" className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <button onClick={() => generate("Application Question", question.trim())} disabled={!question.trim() || Boolean(generating)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50">{generating === "Application Question" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate Answer</button>
          </div>
          <div className="space-y-3">
            {docs.filter((d) => d.document_type === "Application Question").map((d) => (
              <div key={d.id} className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-foreground mb-1">Q: {d.question_text}</p>
                <p className="text-[11px] text-muted-foreground mb-2">Generated {ukDateTime(d.generated_at || d.date_generated)} · {d.approval_status} · {d.grounding_status || "Legacy draft"}</p>
                <DocumentView
                  content={d.content || ""}
                  minHeight="120px"
                  editing={!!editingDocs[d.id]}
                  onEditChange={(editing) => setEditingDocs((prev) => ({ ...prev, [d.id]: editing }))}
                  onChange={(value) => setDocs((current) => current.map((item) => item.id === d.id ? { ...item, content: value, grounding_status: "Candidate Edited", approval_status: "Draft" } : item))}
                  onBlur={(value) => updateDoc(d.id, { content: value, grounding_status: "Candidate Edited", approval_status: "Draft" })}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{wordCount(d.content)} words · {String(d.content || "").length} characters</p>
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => copyText(d.content, "Application answer")} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"><Copy className="h-3.5 w-3.5" /> Copy</button>
<button onClick={() => downloadWord(d)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"><Download className="h-3.5 w-3.5" /> Word</button>
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
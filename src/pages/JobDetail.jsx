import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatusBadge, Notice } from "@/components/ui-kit";
import { ukDate, daysUntil, gbp } from "@/lib/format";
import { analyseJobMatch, getUsableCandidateCVs } from "@/lib/careerAI";
import { ArrowLeft, Sparkles, Flame, Check, X, HelpCircle, AlertTriangle, Wand2, Plus, ExternalLink, CalendarPlus, Pencil, Wrench, AlertCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { createOwnedRecord, getOwnedRecord, listOwnedRecords as sharedListOwned } from "@/lib/ownedEntities";
import { requireMatchResult } from "@/lib/aiResponse";
import { rankOpportunity } from "@/lib/opportunityRanking";
import { hydrateJobDescription } from "@/lib/jobDescriptionStorage";

const MATCH_TIMEOUT_MS = 180_000;
const JOB_UPDATE_TIMEOUT_MS = 15_000;
const SCORE_LABELS = {
  weight_experience: "Relevant experience",
  weight_essential_skills: "Essential skills",
  weight_seniority_leadership: "Seniority and leadership",
  weight_sector: "Sector experience",
  weight_responsibilities: "Responsibilities",
  weight_location: "Location and working pattern",
  weight_salary: "Salary and employment type",
  weight_qualifications: "Qualifications",
};

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

// Use the shared ownership-filtered helper for all entity reads.
const listOwnedRecords = sharedListOwned;

function ListBlock({ title, items, icon: Icon, tone = "default" }) {
  if (!items || items.length === 0) return null;
  const toneClass = tone === "green" ? "text-emerald-600" : tone === "red" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : "text-muted-foreground";
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-medium text-foreground mb-2"><Icon className={`h-4 w-4 ${toneClass}`} />{title}</p>
      <ul className="space-y-1.5">
        {items.map((it, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-border">•</span><span>{it}</span></li>)}
      </ul>
    </div>
  );
}

const STATUS_LABELS = {
  // v2 statuses
  "Strong Match": { label: "Strong Match", color: "text-emerald-600" },
  "Partial Match": { label: "Partial Match", color: "text-amber-600" },
  "No Match": { label: "No Match", color: "text-rose-600" },
  "Requirement Not Stated": { label: "Not Stated", color: "text-muted-foreground" },
  "Insufficient Information": { label: "Insufficient Info", color: "text-blue-600" },
  "Not Applicable": { label: "N/A", color: "text-muted-foreground" },
  // v1 backward-compatible mapping
  "Verified": { label: "Strong Match", color: "text-emerald-600" },
  "Partially Verified": { label: "Partial Match", color: "text-amber-600" },
  "Gap": { label: "No Match", color: "text-rose-600" },
  "Insufficient Job Information": { label: "Insufficient Info", color: "text-blue-600" },
  "Not assessed": { label: "Not Assessed", color: "text-muted-foreground" },
  "Needs evidence": { label: "Needs Evidence", color: "text-amber-600" },
};

function ScoreBreakdown({ breakdown, categoryAnalysis }) {
  const rows = Object.entries(SCORE_LABELS)
    .map(([key, label]) => ({ key, label, ...breakdown?.[key], analysis: categoryAnalysis?.[key] }))
    .filter((row) => row.maximum != null || row.status === "Requirement Not Stated");
  if (rows.length === 0) return null;

  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-2">Category-by-category analysis</p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {rows.map((row) => {
          const statusInfo = STATUS_LABELS[row.status] || STATUS_LABELS["Not assessed"];
          const showScore = [
            "Strong Match",
            "Partial Match",
            "No Match",
            "Verified",
            "Partially Verified",
            "Gap",
          ].includes(row.status);
          return (
            <div key={row.key} className="px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-foreground">{row.label}</p>
                  <p className={`text-xs ${statusInfo.color}`}>{statusInfo.label}</p>
                </div>
                <span className="font-medium text-foreground">{showScore ? `${row.score || 0}/${row.maximum}` : "—"}</span>
              </div>
              {row.analysis?.requirement && <p className="text-xs text-muted-foreground mt-1">Requirement: {row.analysis.requirement}</p>}
              {row.analysis?.explanation && <p className="text-xs text-muted-foreground mt-0.5">{row.analysis.explanation}</p>}
              {row.analysis?.unresolved_question && <p className="text-xs text-amber-600 mt-0.5">⚠ {row.analysis.unresolved_question}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(null);
  const [runningJobId, setRunningJobId] = useState(null);
  const [markingApplied, setMarkingApplied] = useState(false);
  const [matchError, setMatchError] = useState(null);
  const [changingStatus, setChangingStatus] = useState(null);
  const { data: candidates, loading: candidatesLoading } = useCollection(
    "Candidate",
    () => listOwnedRecords("Candidate")
  );
  const { data: cvs, loading: cvsLoading } = useCollection(
    "CV",
    () => listOwnedRecords("CV")
  );
  const { data: matches, refetch: refetchMatches } = useCollection(
    "JobMatch",
    () => listOwnedRecords("JobMatch", { job_id: id }, "-created_date", 5),
    [id]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setJob(null);
    (async () => {
      try {
        const j = await getOwnedRecord("Job", id);
        if (!j) throw new Error("This job could not be found in Angel's account.");
        if (!active) return;
        setJob(await hydrateJobDescription(j));
        const settings = await listOwnedRecords("ScoringSetting", { active: true });
        if (active) setScoring(settings[0] || null);
      } catch (error) {
        if (active) toast.error(error?.message || "Unable to load this job. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    setMatch(null);
    setMatchError(null);
    setRunningJobId(null);
  }, [id]);

  useEffect(() => {
    setMatch(matches[0] || null);
  }, [matches]);

  async function runMatch() {
    if (candidatesLoading || cvsLoading) {
      toast.error("Your profile and Master CV are still loading. Please try again.");
      return;
    }
    const candidate = candidates[0];
    if (!candidate) { toast.error("Create your profile first"); return; }
    if (getUsableCandidateCVs(cvs).length === 0) {
      toast.error("Upload and process a Master CV before running match analysis.");
      return;
    }
    if (!job.job_description && !job.responsibilities && !job.essential_requirements && !job.desirable_requirements) {
      toast.error("Add the job description or requirements before running match analysis.");
      return;
    }

    const targetJobId = id;
    setRunningJobId(targetJobId);
    setMatchError(null);
    const t = toast.loading("Analysing this job…");
    try {
      const result = requireMatchResult(await withTimeout(
        analyseJobMatch(job, candidate, cvs, scoring, job.job_content_status || "Complete"),
        MATCH_TIMEOUT_MS,
        "Match analysis timed out. Please try again."
      ));
      const payload = { candidate_id: candidate.id, job_id: targetJobId, ...result };
      const created = await createOwnedRecord("JobMatch", payload);

      try {
        await withTimeout(
          base44.entities.Job.update(targetJobId, {
            match_score: result.total_score,
            recommendation: result.recommendation,
            last_match_date: new Date().toISOString(),
          }),
          JOB_UPDATE_TIMEOUT_MS,
          "Job summary update timed out."
        );
      } catch {
        // Non-fatal: the JobMatch was saved; the Job list score can be updated on next refresh
      }

      if (targetJobId === id) {
        setMatch(created);
        setJob((current) => current ? ({
          ...current,
          match_score: result.total_score,
          recommendation: result.recommendation,
          last_match_date: new Date().toISOString(),
        }) : current);
        toast.success("Match analysis updated successfully.", { id: t });
        refetchMatches();
      } else {
        toast.success("Match analysis saved.", { id: t });
      }
    } catch (e) {
      const message = e?.message || "Match analysis could not be completed. Please try again.";
      if (targetJobId === id) {
        setMatchError(message);
      }
      toast.error(message, { id: t });
    } finally {
      setRunningJobId((current) => current === targetJobId ? null : current);
    }
  }

  async function setStatus(status, successMessage = `Marked as ${status}`, extraFields = {}) {
    if (changingStatus) return;
    setChangingStatus(status);
    try {
      await base44.entities.Job.update(id, { job_status: status, ...extraFields });
      setJob((current) => ({ ...current, job_status: status, ...extraFields }));
      toast.success(successMessage);
      if (status === "Skip") navigate("/jobs");
    } catch (error) {
      toast.error(error?.message || "Unable to update this job. Please try again.");
    } finally {
      setChangingStatus(null);
    }
  }

  async function markAsApplied() {
    if (markingApplied) return;
    const candidate = candidates[0];
    if (!candidate) {
      toast.error("Create your Candidate Profile first.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const dateApplied = prompt("Date applied (YYYY-MM-DD):", today);
    if (!dateApplied) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateApplied) || Number.isNaN(Date.parse(`${dateApplied}T00:00:00`))) {
      toast.error("Enter a valid date in YYYY-MM-DD format.");
      return;
    }

    setMarkingApplied(true);
    const notice = toast.loading("Moving this job to Applications…");
    try {
      const existing = await listOwnedRecords("Application", { job_id: id }, "-created_date", 1);
      const application = existing[0];
      const masterCv = getUsableCandidateCVs(cvs).find((cv) => cv.is_master) || getUsableCandidateCVs(cvs)[0];
      const applicationData = {
        candidate_id: candidate.id,
        job_id: id,
        job_title: job.job_title,
        employer: job.employer,
        contact_person: job.contact_person || "",
        stage: "Applied",
        date_applied: dateApplied,
        ...(masterCv ? { cv_id: masterCv.id, cv_name: masterCv.cv_name } : {}),
      };

      await base44.functions.invoke("updateApplicationWorkflow", applicationData);
      setJob((current) => ({ ...current, job_status: "Applied" }));
      toast.success(application ? "Application moved to Applied." : "Application recorded in the Applied Kanban.", { id: notice });
      navigate("/applications");
    } catch (error) {
      toast.error(error?.message || "Unable to record this application.", { id: notice });
    } finally {
      setMarkingApplied(false);
    }
  }

  async function generatePack() {
    navigate(`/studio?jobId=${id}`);
  }

  async function addFollowUp() {
    const date = prompt("Follow-up date (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!date) return;
    await createOwnedRecord("Task", { job_id: id, title: `Follow up: ${job.job_title} at ${job.employer}`, due_date: date, priority: "Medium", related_type: "Follow-Up", recommended_action: "Contact recruiter" });
    toast.success("Follow-up task added");
  }

  async function addInterview() {
    const candidate = candidates[0];
    await createOwnedRecord("Interview", { candidate_id: candidate?.id, job_id: id, employer: job.employer, job_title: job.job_title, interview_stage: "First Interview", interview_date: new Date().toISOString().slice(0, 10) });
    toast.success("Interview added");
  }

  async function enrichAndReassess() {
    const targetJobId = id;
    setRunningJobId(targetJobId);
    const t = toast.loading("Enriching and reassessing…");
    try {
      const res = await base44.functions.invoke("enrichAndReassess", { job_id: targetJobId });
      if (res.summary) {
        toast.success(`Enriched: ${res.summary.enriched}, Reassessed: ${res.summary.reassessed}`, { id: t });
        if (targetJobId === id) {
          const j = await base44.entities.Job.get(targetJobId);
          setJob(j);
          const newMatches = await listOwnedRecords("JobMatch", { job_id: targetJobId }, "-created_date", 5);
          setMatch(newMatches[0] || null);
        }
      } else {
        toast.error(res.error || "Enrichment failed", { id: t });
      }
    } catch (e) {
      toast.error(e?.message || "Enrichment failed", { id: t });
    } finally {
      setRunningJobId((current) => current === targetJobId ? null : current);
    }
  }

  if (loading) return <Loading />;
  if (!job) return <EmptyState title="Job not found" />;

  const closeDays = daysUntil(job.closing_date);
  const actions = [
    { label: "Edit Job", icon: Pencil, onClick: () => navigate(`/jobs/${id}/correct`), tone: "primary" },
    { label: "Correct Extraction", icon: Wrench, onClick: () => navigate(`/jobs/${id}/correct?tab=url`), tone: "primary" },
    { label: "Wrong Job Captured", icon: AlertCircle, onClick: () => navigate(`/jobs/${id}/correct?mode=wrong`), tone: "red" },
    { label: "Mark High Priority", icon: Flame, onClick: () => setStatus("High Priority"), tone: "violet" },
    { label: changingStatus === "Apply" ? "Shortlisting…" : "Shortlist to Apply", icon: Check, onClick: () => setStatus("Apply", "Added to Apply Today."), tone: "green", disabled: Boolean(changingStatus) },
    { label: markingApplied ? "Recording…" : "Mark as Applied", icon: Check, onClick: markAsApplied, tone: "green", disabled: markingApplied },
    { label: "Maybe", icon: HelpCircle, onClick: () => setStatus("Maybe"), tone: "amber" },
    { label: changingStatus === "Skip" ? "Removing…" : "Not Interested", icon: X, onClick: () => setStatus("Skip", "Removed from the active Job Board."), tone: "slate", disabled: Boolean(changingStatus) },
    { label: "Analyse Job Match", icon: Sparkles, onClick: runMatch, tone: "primary" },
    { label: "Generate Application Pack", icon: Wand2, onClick: generatePack, tone: "primary" },
    { label: "Add Follow-Up", icon: Plus, onClick: addFollowUp, tone: "blue" },
    { label: "Add Interview", icon: CalendarPlus, onClick: addInterview, tone: "violet" },
    { label: changingStatus === "Expired" ? "Marking Expired…" : "Mark Expired", icon: AlertTriangle, onClick: () => setStatus("Expired", "Job marked as expired.", { expired_status: true }), tone: "red", disabled: Boolean(changingStatus) },
    { label: "Enrich & Reassess", icon: Sparkles, onClick: () => enrichAndReassess(), tone: "primary" },
  ];

  return (
    <div>
      <Link to="/jobs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4" /> Back to Jobs</Link>
      <PageHeader
        title={job.job_title}
        subtitle={`${job.employer}${job.recruitment_agency ? ` · via ${job.recruitment_agency}` : ""}`}
        actions={<StatusBadge status={job.job_status} />}
      />

      {/* Opportunity ranking */}
      {(() => {
        const opp = rankOpportunity(job, match, candidates[0]);
        const toneClasses = {
          green: "border-emerald-200 bg-emerald-50 text-emerald-800",
          amber: "border-amber-200 bg-amber-50 text-amber-800",
          rose: "border-rose-200 bg-rose-50 text-rose-800",
          slate: "border-slate-200 bg-slate-50 text-slate-700",
        };
        return (
          <div className={`mb-6 rounded-xl border p-4 ${toneClasses[opp.tone] || toneClasses.slate}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold">{opp.label}</span>
            </div>
            <p className="text-sm opacity-90">{opp.explanation}</p>
          </div>
        );
      })()}

      <div className="flex flex-wrap gap-2 mb-6">
        {actions.map((a) => (
          <button key={a.label} onClick={a.onClick} disabled={a.disabled} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
            <a.icon className="h-3.5 w-3.5" /> {a.label}
          </button>
        ))}
        {job.original_job_url && <a href={job.original_job_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-primary hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" /> Open Original</a>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Match analysis */}
          <SectionCard
            title="AI Match Analysis"
            description="Positive match claims are shown only when their evidence can be verified in your profile or Master CV."
            actions={<button onClick={runMatch} disabled={runningJobId === id} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> {runningJobId === id ? "Analysing…" : match ? "Run Again" : "Run Analysis"}</button>}
          >
            {matchError && <div className="mb-4"><Notice tone="rose">{matchError}</Notice></div>}
            {(job.match_status === "Needs Reanalysis" || (match && (!match.matching_engine_version || match.matching_engine_version < 2))) && (
              <div className="mb-4">
                <Notice tone="amber">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-medium">
                        {match && (!match.matching_engine_version || match.matching_engine_version < 2)
                          ? "This match was produced by an earlier scoring engine and should be reanalysed for accuracy."
                          : "The job details have changed. The previous match analysis may no longer be accurate."}
                      </p>
                      <button onClick={runMatch} disabled={runningJobId === id} className="mt-1 text-xs font-medium text-amber-800 underline disabled:opacity-50">
                        Run Match Again
                      </button>
                    </div>
                  </div>
                </Notice>
              </div>
            )}
            {match ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    {match.confidence === "Insufficient evidence" ? (
                      <div className="text-xl font-bold text-foreground">Score unavailable</div>
                    ) : (
                      <>
                        <div className="text-4xl font-bold text-foreground">{match.total_score}<span className="text-lg text-muted-foreground">/100</span></div>
                        <StatusBadge status={match.recommendation} />
                      </>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">Confidence: <span className="font-medium text-foreground">{match.confidence}</span></div>
                  {match.suggested_cv && <div className="text-sm text-muted-foreground">Suggested CV: <span className="font-medium text-foreground">{match.suggested_cv}</span></div>}
                </div>
                {/* Assessment status, coverage, verified fit */}
                <div className="flex flex-wrap gap-3">
                  {match.assessment_status && (
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
                      match.assessment_status === "Final" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      match.assessment_status === "Preliminary" ? "bg-amber-50 text-amber-700 border-amber-200" :
                      match.assessment_status === "Restricted Source" ? "bg-rose-50 text-rose-700 border-rose-200" :
                      "bg-slate-50 text-slate-700 border-slate-200"
                    }`}>
                      {match.assessment_status === "Preliminary" && "Preliminary review — full job information required"}
                      {match.assessment_status === "Final" && "Final assessment"}
                      {match.assessment_status === "Restricted Source" && "Restricted source — full vacancy content required"}
                      {match.assessment_status === "Needs Review" && "Needs review"}
                    </span>
                  )}
                  {match.assessment_coverage != null && (
                    <span className="text-xs text-muted-foreground">Coverage: <span className="font-medium text-foreground">{match.assessment_coverage}%</span></span>
                  )}
                  {match.verified_fit != null && (
                    <span className="text-xs text-muted-foreground">Verified fit: <span className="font-medium text-foreground">{match.verified_fit} pts</span></span>
                  )}
                </div>
                {match.hard_stops?.length > 0 && (
                  <Notice tone="rose"><strong>Hard-stop warnings:</strong> {match.hard_stops.join("; ")}</Notice>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <ListBlock title="Strong-match reasons" items={match.strong_reasons} icon={Check} tone="green" />
                  <ListBlock title="Partial-match reasons" items={match.partial_reasons} icon={Check} />
                  <ListBlock title="Missing requirements" items={match.missing_requirements} icon={X} tone="red" />
                  <ListBlock title="Transferable strengths" items={match.transferable_strengths} icon={Check} tone="green" />
                  <ListBlock title="Potential concerns" items={match.concerns} icon={AlertTriangle} tone="amber" />
                  <ListBlock title="Questions to investigate" items={match.questions} icon={HelpCircle} tone="amber" />
                </div>
                <ScoreBreakdown breakdown={match.breakdown} categoryAnalysis={match.category_analysis} />
                {(match.recommended_action || match.application_priority || match.suggested_deadline) && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                    <p><span className="text-muted-foreground">Recommended action:</span> <span className="font-medium text-foreground">{match.recommended_action}</span></p>
                    {match.application_priority && <p className="mt-1"><span className="text-muted-foreground">Application priority:</span> <span className="font-medium text-foreground">{match.application_priority}</span></p>}
                    {match.suggested_deadline && <p className="mt-1"><span className="text-muted-foreground">Suggested deadline:</span> <span className="font-medium text-foreground">{ukDate(match.suggested_deadline)}</span></p>}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState title="No match analysis yet" description="Run the AI match analysis to score this job against your profile, identify gaps and get a recommendation." action={<button onClick={runMatch} disabled={runningJobId === id} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50"><Sparkles className="h-4 w-4" /> {runningJobId === id ? "Analysing…" : "Run Match Analysis"}</button>} />
            )}
          </SectionCard>

          {/* Job description */}
          <SectionCard
            title="Job Description"
            description={job.job_description_character_count ? `${Number(job.job_description_character_count).toLocaleString()} characters` : undefined}
            actions={job.job_description_file_url ? <a href={job.job_description_file_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">Open full source text</a> : undefined}
          >
            {job.job_description ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.job_description}</p> : <p className="text-sm text-muted-foreground">No description provided.</p>}
          </SectionCard>

          {job.responsibilities && <SectionCard title="Responsibilities"><p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.responsibilities}</p></SectionCard>}
          {job.essential_requirements && <SectionCard title="Essential Requirements"><p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.essential_requirements}</p></SectionCard>}
          {job.desirable_requirements && <SectionCard title="Desirable Requirements"><p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.desirable_requirements}</p></SectionCard>}
        </div>

        <div className="space-y-6">
          <SectionCard title="Job Details">
            <dl className="space-y-2 text-sm">
              {[
                ["Version", job.job_version ? `Version ${job.job_version}` : "Version 1"], ["Match Status", job.match_status || "Not Scored"],
                ["Job Content Status", job.job_content_status], ["Enrichment Status", job.enrichment_status], ["Enrichment Method", job.enrichment_method],
                ["Extraction Confidence", job.extraction_confidence], ["Employer", job.employer], ["Recruitment Agency", job.recruitment_agency], ["Source", job.job_source_name],
                ["Reference", job.job_reference], ["Location", job.location], ["Country", job.country],
                ["Working pattern", job.work_arrangement], ["Employment type", job.employment_type], ["Contract length", job.contract_length],
                ["Sector", job.sector], ["Salary", (job.salary_min || job.salary_max) ? `${gbp(job.salary_min)}${job.salary_max ? ` – ${gbp(job.salary_max)}` : ""}` : job.salary_description],
                ["Salary detail", job.salary_description], ["Currency", job.currency], ["Years required", job.required_years_experience],
                ["Qualifications", job.required_qualifications], ["Certifications", job.required_certifications],
                ["Technologies", job.required_technologies], ["Sector experience", job.required_sector_experience],
                ["Right to work", job.right_to_work_requirements], ["Security clearance", job.security_clearance_requirement],
                ["Canonical URL", job.canonical_job_url], ["Email Source URL", job.email_source_url],
                ["Date discovered", ukDate(job.date_discovered)], ["Date posted", ukDate(job.date_posted)],
                ["Last enriched", ukDate(job.enrichment_completed_at)], ["Last matched", ukDate(job.last_match_date)],
                ["Closing date", closeDays != null ? `${ukDate(job.closing_date)} (${closeDays === 0 ? "today" : closeDays < 0 ? "closed" : `in ${closeDays} day${closeDays === 1 ? "" : "s"}`})` : ukDate(job.closing_date)],
              ].map(([k, v]) => v ? [<dt key="k" className="text-muted-foreground">{k}</dt>, <dd key="v" className="font-medium text-foreground mb-2">{v}</dd>] : null)}
            </dl>
          </SectionCard>

          {(job.contact_person || job.contact_email || job.recruiter_linkedin_url) && (
            <SectionCard title="Contact">
              <dl className="space-y-2 text-sm">
                {job.contact_person && <><dt className="text-muted-foreground">Name</dt><dd className="font-medium text-foreground">{job.contact_person}</dd></>}
                {job.contact_email && <><dt className="text-muted-foreground">Email</dt><dd className="font-medium text-foreground"><a href={`mailto:${job.contact_email}`} className="text-primary hover:underline">{job.contact_email}</a></dd></>}
                {job.recruiter_linkedin_url && <><dt className="text-muted-foreground">LinkedIn</dt><dd><a href={job.recruiter_linkedin_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm">View profile</a></dd></>}
              </dl>
            </SectionCard>
          )}

          <SectionCard title="My Notes">
            <textarea
              defaultValue={job.candidate_notes || ""}
              onBlur={async (e) => { await base44.entities.Job.update(id, { candidate_notes: e.target.value }); }}
              placeholder="Add your notes about this role…"
              className="w-full min-h-[120px] rounded-lg border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

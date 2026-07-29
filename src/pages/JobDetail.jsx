import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatusBadge, Notice } from "@/components/ui-kit";
import { ukDate, daysUntil, gbp } from "@/lib/format";
import { analyseJobMatch, getUsableCandidateCVs } from "@/lib/careerAI";
import { ArrowLeft, Sparkles, Flame, Check, X, HelpCircle, AlertTriangle, Wand2, Plus, ExternalLink, CalendarPlus } from "lucide-react";
import { toast } from "react-hot-toast";
import { createOwnedRecord } from "@/lib/ownedEntities";

const MATCH_TIMEOUT_MS = 90_000;
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

function ScoreBreakdown({ breakdown }) {
  const rows = Object.entries(SCORE_LABELS)
    .map(([key, label]) => ({ key, label, ...breakdown?.[key] }))
    .filter((row) => row.maximum != null);
  if (rows.length === 0) return null;

  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-2">Verified score breakdown</p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <div>
              <p className="text-foreground">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.status}</p>
            </div>
            <span className="font-medium text-foreground">
              {row.status === "Not assessed" ? "Not assessed" : `${row.score || 0}/${row.maximum}`}
            </span>
          </div>
        ))}
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
  const [matching, setMatching] = useState(false);
  const { data: candidates, loading: candidatesLoading } = useCollection("Candidate", () => base44.entities.Candidate.list());
  const { data: cvs, loading: cvsLoading } = useCollection("CV", () => base44.entities.CV.list());
  const { data: matches } = useCollection("JobMatch", () => base44.entities.JobMatch.filter({ job_id: id }, "-created_date", 5));

  useEffect(() => {
    (async () => {
      try {
        const j = await base44.entities.Job.get(id);
        setJob(j);
        const settings = await base44.entities.ScoringSetting.list();
        setScoring(settings[0] || null);
      } finally {
        setLoading(false);
      }
    })();
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
    if (!candidate) { toast.error("Create a candidate profile first"); return; }
    if (getUsableCandidateCVs(cvs).length === 0) {
      toast.error("Upload and process a Master CV before running match analysis.");
      return;
    }
    if (!job.job_description && !job.responsibilities && !job.essential_requirements && !job.desirable_requirements) {
      toast.error("Add the job description or requirements before running match analysis.");
      return;
    }
    setMatching(true);
    const t = toast.loading("Analysing match…");
    try {
      const result = await withTimeout(
        analyseJobMatch(job, candidate, cvs, scoring),
        MATCH_TIMEOUT_MS,
        "Match analysis timed out. Please try again."
      );
      const payload = { candidate_id: candidate.id, job_id: id, ...result };
      const created = await createOwnedRecord("JobMatch", payload);
      setMatch(created);
      setMatching(false);
      toast.success("Match analysis saved", { id: t });

      try {
        await withTimeout(
          base44.entities.Job.update(id, {
            match_score: result.total_score,
            recommendation: result.recommendation,
          }),
          JOB_UPDATE_TIMEOUT_MS,
          "Job summary update timed out."
        );
        setJob((current) => ({
          ...current,
          match_score: result.total_score,
          recommendation: result.recommendation,
        }));
      } catch {
        toast.error("Analysis saved, but the Jobs list score could not be updated. Refresh and try again.");
      }
    } catch (e) {
      toast.error(e?.message || "Match analysis failed. Please try again.", { id: t });
    } finally {
      setMatching(false);
    }
  }

  async function setStatus(status) {
    await base44.entities.Job.update(id, { job_status: status });
    setJob({ ...job, job_status: status });
    toast.success(`Marked as ${status}`);
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

  if (loading) return <Loading />;
  if (!job) return <EmptyState title="Job not found" />;

  const closeDays = daysUntil(job.closing_date);
  const actions = [
    { label: "Mark High Priority", icon: Flame, onClick: () => setStatus("High Priority"), tone: "violet" },
    { label: "Apply", icon: Check, onClick: () => setStatus("Apply"), tone: "green" },
    { label: "Maybe", icon: HelpCircle, onClick: () => setStatus("Maybe"), tone: "amber" },
    { label: "Skip", icon: X, onClick: () => setStatus("Skip"), tone: "slate" },
    { label: "Generate Application Pack", icon: Wand2, onClick: generatePack, tone: "primary" },
    { label: "Add Follow-Up", icon: Plus, onClick: addFollowUp, tone: "blue" },
    { label: "Add Interview", icon: CalendarPlus, onClick: addInterview, tone: "violet" },
    { label: "Mark Expired", icon: AlertTriangle, onClick: () => { setStatus("Expired"); base44.entities.Job.update(id, { expired_status: true }); }, tone: "red" },
  ];

  return (
    <div>
      <Link to="/jobs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4" /> Back to Jobs</Link>
      <PageHeader
        title={job.job_title}
        subtitle={`${job.employer}${job.recruitment_agency ? ` · via ${job.recruitment_agency}` : ""}`}
        actions={<StatusBadge status={job.job_status} />}
      />

      <div className="flex flex-wrap gap-2 mb-6">
        {actions.map((a) => (
          <button key={a.label} onClick={a.onClick} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
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
            description="Positive match claims are shown only when their evidence can be verified in your Candidate Profile or Master CV."
            actions={<button onClick={runMatch} disabled={matching} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> {matching ? "Analysing…" : match ? "Run Again" : "Run Analysis"}</button>}
          >
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
                <ScoreBreakdown breakdown={match.breakdown} />
                {(match.recommended_action || match.application_priority || match.suggested_deadline) && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                    <p><span className="text-muted-foreground">Recommended action:</span> <span className="font-medium text-foreground">{match.recommended_action}</span></p>
                    {match.application_priority && <p className="mt-1"><span className="text-muted-foreground">Application priority:</span> <span className="font-medium text-foreground">{match.application_priority}</span></p>}
                    {match.suggested_deadline && <p className="mt-1"><span className="text-muted-foreground">Suggested deadline:</span> <span className="font-medium text-foreground">{ukDate(match.suggested_deadline)}</span></p>}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState title="No match analysis yet" description="Run the AI match analysis to score this job against your profile, identify gaps and get a recommendation." action={<button onClick={runMatch} disabled={matching} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50"><Sparkles className="h-4 w-4" /> {matching ? "Analysing…" : "Run Match Analysis"}</button>} />
            )}
          </SectionCard>

          {/* Job description */}
          <SectionCard title="Job Description">
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
                ["Employer", job.employer], ["Recruitment Agency", job.recruitment_agency], ["Source", job.job_source_name],
                ["Reference", job.job_reference], ["Location", job.location], ["Country", job.country],
                ["Working pattern", job.work_arrangement], ["Employment type", job.employment_type], ["Contract length", job.contract_length],
                ["Sector", job.sector], ["Salary", (job.salary_min || job.salary_max) ? `${gbp(job.salary_min)}${job.salary_max ? ` – ${gbp(job.salary_max)}` : ""}` : job.salary_description],
                ["Salary detail", job.salary_description], ["Currency", job.currency], ["Years required", job.required_years_experience],
                ["Qualifications", job.required_qualifications], ["Certifications", job.required_certifications],
                ["Technologies", job.required_technologies], ["Sector experience", job.required_sector_experience],
                ["Right to work", job.right_to_work_requirements], ["Security clearance", job.security_clearance_requirement],
                ["Date discovered", ukDate(job.date_discovered)], ["Date posted", ukDate(job.date_posted)],
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

          <SectionCard title="Candidate Notes">
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

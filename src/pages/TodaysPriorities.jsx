import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatusBadge } from "@/components/ui-kit";
import { ukDate, daysUntil } from "@/lib/format";
import { listOwnedRecords, updateOwnedRecord } from "@/lib/ownedEntities";
import { rankOpportunity } from "@/lib/opportunityRanking";
import { cn } from "@/lib/utils";
import {
  Flame, CalendarClock, Send, CheckCircle2, Circle, AlertTriangle,
  Eye, FileText, Users, Zap, ArrowRight, Wand2,
} from "lucide-react";

const PRIORITY_ICON = { Critical: AlertTriangle, High: Flame, Medium: CalendarClock, Low: CheckCircle2 };

function priorityRank(p) {
  return { Critical: 0, High: 1, Medium: 2, Low: 3 }[p] ?? 4;
}

const SUBMITTED_STAGES = ["Applied", "Recruiter Contact", "First Interview", "Further Interview", "Assessment", "Reference Check", "Offer"];
const EMAIL_REVIEW_STATUSES = ["Needs Review", "URL Restricted", "Partial", "Failed"];

function PriorityItem({ action, onComplete }) {
  const Icon = PRIORITY_ICON[action.priority] || Circle;
  const d = daysUntil(action.due_date);
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-start gap-4">
      <div className={cn("rounded-lg p-2 shrink-0",
        action.priority === "Critical" ? "bg-rose-100 text-rose-600"
        : action.priority === "High" ? "bg-amber-100 text-amber-600"
        : "bg-slate-100 text-slate-600"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[11px] font-semibold uppercase rounded px-1.5 py-0.5",
            action.priority === "Critical" ? "bg-rose-100 text-rose-700"
            : action.priority === "High" ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-600"
          )}>{action.priority}</span>
          {action.employer && <span className="text-xs text-muted-foreground">{action.employer}</span>}
          {action.match_score != null && <span className="text-xs font-medium text-foreground">{action.match_score}/100</span>}
        </div>
        <p className="font-medium text-foreground mt-1">{action.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {action.recommended_action}
          {action.due_date ? ` · Due ${ukDate(action.due_date)}${d != null ? ` (${d === 0 ? "today" : d < 0 ? "overdue" : `in ${d} day${d === 1 ? "" : "s"}`})` : ""}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {action.job_id && (
          <Link to={action.action_link || `/jobs/${action.job_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            {action.action_label || "Open"} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
        {onComplete && action.task_id && (
          <button onClick={() => onComplete(action.task_id)} className="text-muted-foreground hover:text-emerald-600" title="Mark complete">
            <Circle className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function TodaysPriorities() {
  const { data: jobs, loading: jobsLoading } = useCollection("Job", () => listOwnedRecords("Job", {}, "-created_date", 300));
  const { data: applications } = useCollection("Application", () => listOwnedRecords("Application", {}, "-created_date", 300));
  const { data: interviews } = useCollection("Interview", () => listOwnedRecords("Interview", {}, "-interview_date", 200));
  const { data: matches } = useCollection("JobMatch", () => listOwnedRecords("JobMatch", {}, "-created_date", 300));
  const { data: tasks, refetch: refetchTasks } = useCollection("Task", () => listOwnedRecords("Task", { completed: false }, "-due_date", 100));
  const { data: candidates } = useCollection("Candidate", () => listOwnedRecords("Candidate", {}, "-created_date", 5));

  const candidate = candidates[0];

  const actions = useMemo(() => {
    const list = [];
    const matchByJob = {};
    matches.forEach((m) => { if (!matchByJob[m.job_id]) matchByJob[m.job_id] = m; });

    // New email vacancies awaiting Angel's decision. Surface urgent and relevant
    // items in the daily workflow instead of leaving them hidden in a separate queue.
    jobs.filter((j) => EMAIL_REVIEW_STATUSES.includes(j.email_import_status)).forEach((j) => {
      const d = daysUntil(j.closing_date);
      if (d != null && d < 0) return;
      list.push({
        id: `email-review-${j.id}`,
        title: `Decide whether to keep: ${j.job_title}`,
        priority: d != null && d <= 2 ? "Critical" : j.relevance_tier === "Relevant" ? "High" : "Medium",
        due_date: j.closing_date,
        job_id: j.id,
        job_title: j.job_title,
        employer: j.employer,
        match_score: j.match_score,
        related_type: "Email Review",
        recommended_action: `${j.email_source || "Email"} · ${j.email_import_status}`,
        action_label: "Decide",
        action_link: "/email-review",
      });
    });

    // A. Applications with deadlines within 72 hours
    jobs.forEach((j) => {
      const d = daysUntil(j.closing_date);
      if (d != null && d >= 0 && d <= 3 && !["Skip", "Rejected", "Withdrawn", "Expired"].includes(j.job_status)) {
        const m = matchByJob[j.id];
        list.push({
          id: `closing-${j.id}`,
          title: `Apply for "${j.job_title}" before closing date`,
          priority: d <= 1 ? "Critical" : "High",
          due_date: j.closing_date,
          job_id: j.id,
          job_title: j.job_title,
          employer: j.employer,
          match_score: j.match_score,
          related_type: "Application",
          recommended_action: "Submit application now",
          action_label: "Studio",
          action_link: `/studio?jobId=${j.id}`,
        });
      }
    });

    // B. Strong-fit jobs not yet reviewed
    jobs.filter((j) => j.match_score >= 70 && j.job_status === "New" && !EMAIL_REVIEW_STATUSES.includes(j.email_import_status)).forEach((j) => {
      list.push({
        id: `strong-${j.id}`,
        title: `Review strong-match role: ${j.job_title}`,
        priority: "High",
        due_date: j.closing_date,
        job_id: j.id,
        job_title: j.job_title,
        employer: j.employer,
        match_score: j.match_score,
        related_type: "Review",
        recommended_action: "Review match analysis and decide",
        action_label: "Open",
        action_link: `/jobs/${j.id}`,
      });
    });

    // C. Applications marked Preparing
    applications.filter((a) => a.stage === "Preparing").forEach((a) => {
      list.push({
        id: `prep-${a.id}`,
        title: `Complete application pack for ${a.job_title}`,
        priority: "Medium",
        due_date: a.follow_up_date || jobs.find((j) => j.id === a.job_id)?.closing_date,
        job_id: a.job_id,
        job_title: a.job_title,
        employer: a.employer,
        match_score: jobs.find((j) => j.id === a.job_id)?.match_score,
        related_type: "Document",
        recommended_action: "Generate and approve application documents",
        action_label: "Studio",
        action_link: `/studio?jobId=${a.job_id}`,
      });
    });

    // D. Applications marked Ready to Apply
    applications.filter((a) => a.stage === "Ready to Apply").forEach((a) => {
      list.push({
        id: `ready-${a.id}`,
        title: `Submit application for ${a.job_title}`,
        priority: "High",
        due_date: jobs.find((j) => j.id === a.job_id)?.closing_date,
        job_id: a.job_id,
        job_title: a.job_title,
        employer: a.employer,
        match_score: jobs.find((j) => j.id === a.job_id)?.match_score,
        related_type: "Application",
        recommended_action: "Submit externally and mark as Applied",
        action_label: "Studio",
        action_link: `/studio?jobId=${a.job_id}`,
      });
    });

    // E. Follow-ups due today or overdue
    const today = new Date().toISOString().slice(0, 10);
    applications.filter((a) => a.follow_up_date && a.follow_up_date <= today && !["Offer", "Rejected", "Withdrawn"].includes(a.stage)).forEach((a) => {
      const d = daysUntil(a.follow_up_date);
      list.push({
        id: `followup-${a.id}`,
        title: `Follow up with ${a.contact_person || a.employer || "recruiter"}`,
        priority: d <= 0 ? "High" : "Medium",
        due_date: a.follow_up_date,
        job_id: a.job_id,
        job_title: a.job_title,
        employer: a.employer,
        match_score: jobs.find((j) => j.id === a.job_id)?.match_score,
        related_type: "Follow-Up",
        recommended_action: "Send follow-up message",
        action_label: "Open",
        action_link: `/jobs/${a.job_id}`,
      });
    });

    // F. Upcoming interviews requiring preparation
    interviews.forEach((iv) => {
      const d = daysUntil(iv.interview_date);
      if (d != null && d >= 0 && d <= 7 && iv.preparation_status !== "Completed") {
        list.push({
          id: `ivprep-${iv.id}`,
          title: `Prepare for interview: ${iv.job_title} at ${iv.employer}`,
          priority: d <= 2 ? "Critical" : "High",
          due_date: iv.interview_date,
          job_id: iv.job_id,
          job_title: iv.job_title,
          employer: iv.employer,
          related_type: "Interview",
          recommended_action: "Complete interview preparation",
          action_label: "Prepare",
          action_link: `/interviews`,
        });
      }
    });

    // G. Recruiter contacts requiring a response (applied but no response)
    applications.filter((a) => a.stage === "Applied").forEach((a) => {
      const appliedDate = a.date_applied || a.created_date?.slice(0, 10);
      if (appliedDate) {
        const daysSince = daysUntil(appliedDate);
        if (daysSince != null && daysSince <= -7) {
          list.push({
            id: `chase-${a.id}`,
            title: `Chase application: ${a.job_title} at ${a.employer}`,
            priority: "Medium",
            due_date: new Date().toISOString().slice(0, 10),
            job_id: a.job_id,
            job_title: a.job_title,
            employer: a.employer,
            match_score: jobs.find((j) => j.id === a.job_id)?.match_score,
            related_type: "Follow-Up",
            recommended_action: "Send a polite follow-up to the recruiter",
            action_label: "Open",
            action_link: `/jobs/${a.job_id}`,
          });
        }
      }
    });

    // H. Recently discovered jobs not yet analysed
    const recentJobs = jobs
      .filter((j) => j.job_status === "New" && j.match_score == null && !EMAIL_REVIEW_STATUSES.includes(j.email_import_status) && !["Skip", "Expired"].includes(j.job_status))
      .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))
      .slice(0, 5);
    recentJobs.forEach((j) => {
      list.push({
        id: `analyse-${j.id}`,
        title: `Run match analysis: ${j.job_title}`,
        priority: "Medium",
        due_date: j.closing_date,
        job_id: j.id,
        job_title: j.job_title,
        employer: j.employer,
        match_score: null,
        related_type: "Review",
        recommended_action: "Run AI Match Analysis to score this role",
        action_label: "Analyse",
        action_link: `/jobs/${j.id}`,
      });
    });

    list.sort((a, b) => {
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      return (daysUntil(a.due_date) ?? 99) - (daysUntil(b.due_date) ?? 99);
    });
    return list;
  }, [jobs, applications, interviews, matches]);

  const completeToday = actions.slice(0, 5);

  async function completeTask(id) {
    await updateOwnedRecord("Task", id, { completed: true });
    refetchTasks();
  }

  if (jobsLoading) return <Loading label="Loading priorities…" />;

  return (
    <div>
      <PageHeader title="Today's Priorities" subtitle="Your most important actions, auto-generated from your live job-search data" />

      {!candidate && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You need a profile to power AI matching. <Link to="/profile" className="font-medium underline">Create your profile</Link>.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {actions.length === 0 ? (
            <EmptyState title="No priority actions today" description="You're up to date. New actions will appear here as jobs, applications and interviews progress." />
          ) : (
            <>
              {/* Complete Today section */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-blue-600" /> Complete Today — your top {completeToday.length} priorities
                </p>
                <div className="space-y-2">
                  {completeToday.map((a) => (
                    <div key={a.id} className="rounded-lg border border-blue-100 bg-card p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.employer}{a.match_score != null ? ` · ${a.match_score}/100` : ""}</p>
                      </div>
                      {a.job_id && (
                        <Link to={a.action_link || `/jobs/${a.job_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0">
                          {a.action_label || "Open"} <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Full priority list */}
              {actions.map((a) => (
                <PriorityItem key={a.id} action={a} />
              ))}
            </>
          )}
        </div>
        <div>
          <SectionCard title="Open Tasks" description="Manual tasks you've created">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No open tasks.</p>
            ) : (
              <div className="space-y-2">
                {tasks.slice(0, 10).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <button onClick={() => completeTask(t.id)} className="text-muted-foreground hover:text-emerald-600"><Circle className="h-4 w-4" /></button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                      {t.due_date && <p className="text-xs text-muted-foreground">Due {ukDate(t.due_date)}</p>}
                    </div>
                    <StatusBadge status={t.priority} />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Priority Summary" className="mt-4">
            <div className="space-y-2 text-sm">
              {[
                { label: "Closing within 72h", count: actions.filter((a) => a.related_type === "Application" && a.priority === "Critical").length, tone: "rose" },
                { label: "Strong-fit to review", count: actions.filter((a) => a.id.startsWith("strong-")).length, tone: "green" },
                { label: "Preparing", count: actions.filter((a) => a.id.startsWith("prep-")).length, tone: "amber" },
                { label: "Ready to apply", count: actions.filter((a) => a.id.startsWith("ready-")).length, tone: "blue" },
                { label: "Follow-ups due", count: actions.filter((a) => a.related_type === "Follow-Up").length, tone: "amber" },
                { label: "Interviews to prep", count: actions.filter((a) => a.id.startsWith("ivprep-")).length, tone: "violet" },
                { label: "Unanalysed jobs", count: actions.filter((a) => a.id.startsWith("analyse-")).length, tone: "slate" },
                { label: "Email decisions", count: actions.filter((a) => a.id.startsWith("email-review-")).length, tone: "blue" },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className={cn("font-medium",
                    s.tone === "rose" ? "text-rose-600" : s.tone === "green" ? "text-emerald-600"
                    : s.tone === "amber" ? "text-amber-600" : s.tone === "blue" ? "text-blue-600"
                    : s.tone === "violet" ? "text-violet-600" : "text-slate-600"
                  )}>{s.count}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatusBadge } from "@/components/ui-kit";
import { ukDate, daysUntil } from "@/lib/format";
import { Flame, CalendarClock, Send, FileText, Eye, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_ICON = { Critical: AlertTriangle, High: Flame, Medium: CalendarClock, Low: CheckCircle2 };

function priorityRank(p) {
  return { Critical: 0, High: 1, Medium: 2, Low: 3 }[p] ?? 4;
}

export default function TodaysPriorities() {
  const { data: jobs, loading } = useCollection("Job", () => base44.entities.Job.list("-created_date", 200));
  const { data: applications } = useCollection("Application", () => base44.entities.Application.list("-created_date", 200));
  const { data: interviews } = useCollection("Interview", () => base44.entities.Interview.list("-created_date", 100));
  const { data: tasks, refetch } = useCollection("Task", () => base44.entities.Task.filter({ completed: false }, "-due_date", 50));

  const actions = useMemo(() => {
    const list = [];
    // closing date priorities
    jobs.forEach((j) => {
      const d = daysUntil(j.closing_date);
      if (d != null && d >= 0 && d <= 7 && !["Skip", "Rejected", "Withdrawn", "Expired"].includes(j.job_status)) {
        list.push({
          title: `Apply for "${j.job_title}" before closing date`,
          priority: d <= 2 ? "Critical" : "High",
          due_date: j.closing_date,
          job_id: j.id,
          job_title: j.job_title,
          employer: j.employer,
          related_type: "Application",
          recommended_action: "Submit application",
        });
      }
    });
    // high match new jobs
    jobs.filter((j) => j.match_score >= 70 && j.job_status === "New").forEach((j) => {
      list.push({
        title: `Review newly discovered high-match role: ${j.job_title}`,
        priority: "High",
        due_date: j.closing_date,
        job_id: j.id,
        job_title: j.job_title,
        employer: j.employer,
        related_type: "Review",
        recommended_action: "Review match analysis",
      });
    });
    // follow-ups due
    applications.filter((a) => a.follow_up_date).forEach((a) => {
      const d = daysUntil(a.follow_up_date);
      if (d != null && d <= 3) {
        list.push({
          title: `Follow up with ${a.contact_person || a.employer || "recruiter"}`,
          priority: d <= 0 ? "High" : "Medium",
          due_date: a.follow_up_date,
          job_id: a.job_id,
          job_title: a.job_title,
          employer: a.employer,
          related_type: "Follow-Up",
          recommended_action: "Send follow-up message",
        });
      }
    });
    // interviews
    interviews.forEach((iv) => {
      const d = daysUntil(iv.interview_date);
      if (d != null && d >= 0 && d <= 5) {
        list.push({
          title: `Prepare for interview: ${iv.job_title} at ${iv.employer}`,
          priority: d <= 1 ? "Critical" : "High",
          due_date: iv.interview_date,
          job_id: iv.job_id,
          job_title: iv.job_title,
          employer: iv.employer,
          related_type: "Interview",
          recommended_action: "Complete interview preparation",
        });
      }
    });
    // preparing applications
    applications.filter((a) => a.stage === "Preparing").forEach((a) => {
      list.push({
        title: `Complete application pack for ${a.job_title}`,
        priority: "Medium",
        due_date: a.follow_up_date,
        job_id: a.job_id,
        job_title: a.job_title,
        employer: a.employer,
        related_type: "Document",
        recommended_action: "Generate application pack",
      });
    });
    list.sort((a, b) => {
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      return (daysUntil(a.due_date) ?? 99) - (daysUntil(b.due_date) ?? 99);
    });
    return list.slice(0, 8);
  }, [jobs, applications, interviews]);

  async function completeTask(id) {
    await base44.entities.Task.update(id, { completed: true });
    refetch();
  }

  if (loading) return <Loading label="Loading priorities…" />;

  return (
    <div>
      <PageHeader title="Today's Priorities" subtitle="Your most important actions, ranked by urgency and impact" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {actions.length === 0 ? (
            <EmptyState title="No priority actions today" description="You're up to date. New actions will appear here as jobs, applications and interviews progress." />
          ) : (
            actions.map((a, i) => {
              const Icon = PRIORITY_ICON[a.priority] || Circle;
              const d = daysUntil(a.due_date);
              return (
                <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-start gap-4">
                  <div className={cn("rounded-lg p-2 shrink-0", a.priority === "Critical" ? "bg-rose-100 text-rose-600" : a.priority === "High" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-600")}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-[11px] font-semibold uppercase rounded px-1.5 py-0.5", a.priority === "Critical" ? "bg-rose-100 text-rose-700" : a.priority === "High" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>{a.priority}</span>
                      {a.employer && <span className="text-xs text-muted-foreground">{a.employer}</span>}
                    </div>
                    <p className="font-medium text-foreground mt-1">{a.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.recommended_action}{a.due_date ? ` · Due ${ukDate(a.due_date)}${d != null ? ` (${d === 0 ? "today" : d < 0 ? "overdue" : `in ${d} day${d === 1 ? "" : "s"}`})` : ""}` : ""}</p>
                  </div>
                  {a.job_id && <Link to={`/jobs/${a.job_id}`} className="text-sm font-medium text-primary hover:underline shrink-0">Open</Link>}
                </div>
              );
            })
          )}
        </div>
        <div>
          <SectionCard title="Open Tasks" description="Manual tasks you've created">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No open tasks.</p>
            ) : (
              <div className="space-y-2">
                {tasks.slice(0, 8).map((t) => (
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
        </div>
      </div>
    </div>
  );
}
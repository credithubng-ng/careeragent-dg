import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatCard } from "@/components/ui-kit";
import GitHubIssues from "@/components/GitHubIssues";
import { daysUntil, ukDate } from "@/lib/format";
import { createOwnedRecord, listOwnedRecords, updateOwnedRecord } from "@/lib/ownedEntities";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";
import { Briefcase, Send, CalendarClock, Flame, Target, TrendingUp, Clock, Settings2, Check, ChevronUp, ChevronDown, RotateCcw, MailCheck, ArrowRight, X } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from "recharts";

const REVIEW_STATUSES = ["Needs Review", "URL Restricted", "Partial", "Failed"];
const DEFAULT_SECTIONS = ["actions", "key_metrics", "campaign_progress", "intake_health", "closing_soon", "interviews"];
const SECTION_CATALOGUE = [
  { id: "actions", label: "Today’s top actions", description: "The decisions and follow-ups that matter now", group: "Recommended" },
  { id: "key_metrics", label: "Key outcomes", description: "Reviews, matches, applications and interviews", group: "Recommended" },
  { id: "campaign_progress", label: "60-day progress", description: "Progress against weekly application targets", group: "Recommended" },
  { id: "intake_health", label: "Gmail intake health", description: "Latest scan and jobs awaiting review", group: "Recommended" },
  { id: "closing_soon", label: "Closing soon", description: "Active vacancies closing within seven days", group: "Recommended" },
  { id: "interviews", label: "Upcoming interviews", description: "Interview dates and preparation status", group: "Recommended" },
  { id: "match_bands", label: "Match-score distribution", description: "Detailed score-band chart", group: "Analytics" },
  { id: "pipeline", label: "Application pipeline", description: "Applications by stage", group: "Analytics" },
  { id: "weekly_trend", label: "Weekly activity trend", description: "Applications and interviews over time", group: "Analytics" },
  { id: "project_issues", label: "Project issues", description: "GitHub development issues", group: "Administration" },
];

function startOfWeek() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; }
function activeJob(job) { return !["Skip", "Rejected", "Withdrawn", "Expired"].includes(job.job_status); }

export default function Dashboard() {
  const { data: jobs, loading: jobsLoading } = useCollection("Job", () => listOwnedRecords("Job", {}, "-created_date", 500));
  const { data: applications, loading: appsLoading } = useCollection("Application", () => listOwnedRecords("Application", {}, "-created_date", 300));
  const { data: interviews } = useCollection("Interview", () => listOwnedRecords("Interview", {}, "-interview_date", 200));
  const { data: goals } = useCollection("CampaignGoal", () => listOwnedRecords("CampaignGoal", {}, "-created_date", 5));
  const { data: intakeStates } = useCollection("EmailIntakeState", () => listOwnedRecords("EmailIntakeState", {}, "-last_checked_at", 1));
  const { data: preferences, refetch: refetchPreferences } = useCollection("DashboardPreference", () => listOwnedRecords("DashboardPreference", {}, "-created_date", 1));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const preference = preferences[0];
  const visible = preference?.visible_sections?.length ? preference.visible_sections : DEFAULT_SECTIONS;
  const savedOrder = preference?.section_order?.length ? preference.section_order : SECTION_CATALOGUE.map((item) => item.id);
  const order = [...savedOrder, ...SECTION_CATALOGUE.map((item) => item.id).filter((id) => !savedOrder.includes(id))];
  const goal = goals[0];
  const intake = intakeStates[0];

  const stats = useMemo(() => {
    const week = startOfWeek();
    const submittedStages = ["Applied", "Recruiter Contact", "First Interview", "Further Interview", "Assessment", "Reference Check", "Offer"];
    const reviewed = jobs.filter((job) => job.job_status !== "New").length;
    const reviewedWeek = jobs.filter((job) => job.job_status !== "New" && job.created_date && new Date(job.created_date) >= week).length;
    const strong = jobs.filter((job) => job.match_score >= 70 && activeJob(job)).length;
    const submitted = applications.filter((app) => submittedStages.includes(app.stage)).length;
    const submittedWeek = applications.filter((app) => submittedStages.includes(app.stage) && app.date_applied && new Date(app.date_applied) >= week).length;
    const waiting = jobs.filter((job) => REVIEW_STATUSES.includes(job.email_import_status) && activeJob(job)).length;
    const followUps = applications.filter((app) => app.follow_up_date && daysUntil(app.follow_up_date) <= 0 && !["Offer", "Rejected", "Withdrawn"].includes(app.stage)).length;
    return { reviewed, reviewedWeek, strong, submitted, submittedWeek, waiting, followUps, interviews: interviews.length };
  }, [jobs, applications, interviews]);

  const closingSoon = useMemo(() => jobs.filter((job) => { const d = daysUntil(job.closing_date); return activeJob(job) && d != null && d >= 0 && d <= 7; }).sort((a, b) => daysUntil(a.closing_date) - daysUntil(b.closing_date)).slice(0, 6), [jobs]);
  const upcomingInterviews = useMemo(() => interviews.filter((item) => { const d = daysUntil(item.interview_date); return d != null && d >= 0; }).sort((a, b) => daysUntil(a.interview_date) - daysUntil(b.interview_date)).slice(0, 5), [interviews]);
  const actions = useMemo(() => {
    const items = [];
    if (stats.waiting) items.push({ label: `${stats.waiting} imported job${stats.waiting === 1 ? "" : "s"} need a decision`, hint: "Approve, archive or mark not interested", to: "/email-review", tone: "amber" });
    if (closingSoon.length) items.push({ label: `${closingSoon.length} active job${closingSoon.length === 1 ? "" : "s"} close within seven days`, hint: "Review deadlines before starting new work", to: "/jobs?view=Closing%20Soon", tone: "rose" });
    if (stats.followUps) items.push({ label: `${stats.followUps} application follow-up${stats.followUps === 1 ? "" : "s"} due`, hint: "Contact recruiters today", to: "/priorities", tone: "blue" });
    const ready = applications.filter((app) => app.stage === "Ready to Apply").length;
    if (ready) items.push({ label: `${ready} application${ready === 1 ? " is" : "s are"} ready to submit`, hint: "Submit and move to Applied", to: "/applications", tone: "green" });
    return items.slice(0, 5);
  }, [stats, closingSoon, applications]);

  const matchData = useMemo(() => [
    { name: "80–100", count: jobs.filter((job) => job.match_score >= 80).length },
    { name: "70–79", count: jobs.filter((job) => job.match_score >= 70 && job.match_score < 80).length },
    { name: "50–69", count: jobs.filter((job) => job.match_score >= 50 && job.match_score < 70).length },
    { name: "Below 50", count: jobs.filter((job) => job.match_score != null && job.match_score < 50).length },
  ], [jobs]);
  const pipelineData = useMemo(() => ["Preparing", "Ready to Apply", "Applied", "Recruiter Contact", "First Interview", "Offer"].map((stage) => ({ name: stage, count: applications.filter((app) => app.stage === stage).length })), [applications]);
  const weeklyData = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const offset = 5 - index; const start = new Date(); start.setDate(start.getDate() - offset * 7 - 6); const end = new Date(); end.setDate(end.getDate() - offset * 7);
    return { name: `${start.getDate()}/${start.getMonth() + 1}`, Applications: applications.filter((app) => app.date_applied && new Date(app.date_applied) >= start && new Date(app.date_applied) <= end).length, Interviews: interviews.filter((item) => item.interview_date && new Date(item.interview_date) >= start && new Date(item.interview_date) <= end).length };
  }), [applications, interviews]);

  async function savePreferences(nextVisible, nextOrder) {
    setSaving(true);
    try {
      const data = { visible_sections: nextVisible, section_order: nextOrder, layout_mode: "Focused" };
      if (preference?.id) await updateOwnedRecord("DashboardPreference", preference.id, data);
      else await createOwnedRecord("DashboardPreference", data);
      await refetchPreferences();
      toast.success("Dashboard preferences saved");
    } catch { toast.error("Dashboard preferences could not be saved"); }
    finally { setSaving(false); }
  }

  if (jobsLoading || appsLoading) return <Loading label="Loading your dashboard…" />;

  const sections = {
    actions: <ActionsSection actions={actions} />,
    key_metrics: <KeyMetrics stats={stats} />,
    campaign_progress: <CampaignProgress goal={goal} stats={stats} />,
    intake_health: <IntakeHealth intake={intake} awaiting={stats.waiting} />,
    closing_soon: <ClosingSoon jobs={closingSoon} />,
    interviews: <UpcomingInterviews interviews={upcomingInterviews} />,
    match_bands: <ChartSection title="Match-score distribution" data={matchData} />,
    pipeline: <ChartSection title="Application pipeline" data={pipelineData} horizontal />,
    weekly_trend: <WeeklyTrend data={weeklyData} />,
    project_issues: <GitHubIssues />,
  };

  return <div>
    <PageHeader title="Dashboard" subtitle="A focused view of the outcomes and actions you selected" actions={<button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Settings2 className="h-4 w-4" />Edit Dashboard</button>} />
    {visible.length === 0 ? <EmptyState title="Your dashboard is empty" description="Choose the information you want to see." action={<button onClick={() => setEditing(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Choose sections</button>} /> : <div className="space-y-6">{order.filter((id) => visible.includes(id)).map((id) => <React.Fragment key={id}>{sections[id]}</React.Fragment>)}</div>}
    {editing && <DashboardEditor visible={visible} order={order} saving={saving} onClose={() => setEditing(false)} onSave={async (nextVisible, nextOrder) => { await savePreferences(nextVisible, nextOrder); setEditing(false); }} />}
  </div>;
}

function ActionsSection({ actions }) { return <SectionCard title="Today’s top actions" description="Complete these before browsing more jobs" actions={<Link to="/priorities" className="text-sm font-medium text-primary">View all priorities</Link>}>{actions.length ? <div className="grid gap-3 md:grid-cols-2">{actions.map((item) => <Link key={item.label} to={item.to} className="flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-muted/30"><span className={cn("h-9 w-1 rounded-full", item.tone === "rose" ? "bg-rose-500" : item.tone === "amber" ? "bg-amber-500" : item.tone === "green" ? "bg-emerald-500" : "bg-blue-500")} /><span className="flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="text-xs text-muted-foreground">{item.hint}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}</div> : <p className="py-5 text-center text-sm text-muted-foreground">Nothing urgent. Angel is up to date.</p>}</SectionCard>; }
function KeyMetrics({ stats }) { return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Link to="/email-review"><StatCard label="Awaiting Decisions" value={stats.waiting} icon={Target} accent="amber" className="h-full hover:shadow-md" /></Link><Link to="/jobs?view=Best%20Matches"><StatCard label="Strong Matches" value={stats.strong} icon={Flame} accent="green" className="h-full hover:shadow-md" /></Link><Link to="/applications"><StatCard label="Applications" value={stats.submitted} hint={`${stats.submittedWeek} this week`} icon={Send} accent="blue" className="h-full hover:shadow-md" /></Link><Link to="/interviews"><StatCard label="Interviews" value={stats.interviews} icon={CalendarClock} accent="violet" className="h-full hover:shadow-md" /></Link></div>; }
function CampaignProgress({ goal, stats }) { const days = goal?.target_end_date ? daysUntil(goal.target_end_date) : null; const applicationTarget = goal?.target_applications || 15; const pct = Math.min(100, Math.round(stats.submitted / applicationTarget * 100)); return <SectionCard title="60-day progress" description={goal ? `${ukDate(goal.start_date)} – ${ukDate(goal.target_end_date)}` : "Set campaign dates in Settings"} actions={days != null && <div className="text-right"><p className="text-2xl font-bold">{Math.max(0, days)}</p><p className="text-xs text-muted-foreground">days left</p></div>}><div className="grid gap-5 md:grid-cols-2"><div><div className="mb-2 flex justify-between text-sm"><span>Applications submitted</span><strong>{stats.submitted} / {applicationTarget}</strong></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Jobs reviewed</p><p className="text-xl font-semibold">{stats.reviewed}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">This week</p><p className="text-xl font-semibold">{stats.reviewedWeek}</p></div></div></div></SectionCard>; }
function IntakeHealth({ intake, awaiting }) { return <SectionCard title="Gmail intake health" description="A concise operational check" actions={<Link to="/settings" className="text-sm font-medium text-primary">Manage Gmail</Link>}><div className="grid gap-3 sm:grid-cols-3"><MiniMetric icon={MailCheck} label="Last successful check" value={intake?.last_checked_at ? new Date(intake.last_checked_at).toLocaleString("en-GB") : "No recorded scan"} /><MiniMetric icon={Briefcase} label="Emails processed" value={intake?.total_emails_processed ?? "—"} /><MiniMetric icon={Clock} label="Awaiting review" value={awaiting} /></div></SectionCard>; }
function MiniMetric({ icon: Icon, label, value }) { return <div className="rounded-lg border border-border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div><p className="mt-2 text-lg font-semibold">{value}</p></div>; }
function ClosingSoon({ jobs }) { return <SectionCard title="Closing soon" description="Active opportunities closing within seven days" actions={<Link to="/jobs?view=Closing%20Soon" className="text-sm font-medium text-primary">View all</Link>}>{jobs.length ? <div className="divide-y divide-border">{jobs.map((job) => <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="flex-1 min-w-0"><span className="block truncate text-sm font-medium">{job.job_title}</span><span className="text-xs text-muted-foreground">{job.employer}</span></span><span className={cn("text-xs font-medium", daysUntil(job.closing_date) <= 2 ? "text-rose-600" : "text-amber-600")}>{daysUntil(job.closing_date) === 0 ? "Today" : `${daysUntil(job.closing_date)} days`}</span></Link>)}</div> : <p className="py-5 text-center text-sm text-muted-foreground">No active deadlines within seven days.</p>}</SectionCard>; }
function UpcomingInterviews({ interviews }) { return <SectionCard title="Upcoming interviews" actions={<Link to="/interviews" className="text-sm font-medium text-primary">Interview workspace</Link>}>{interviews.length ? <div className="divide-y divide-border">{interviews.map((item) => <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><CalendarClock className="h-5 w-5 text-violet-600" /><span className="flex-1"><span className="block text-sm font-medium">{item.job_title || "Interview"}</span><span className="text-xs text-muted-foreground">{item.employer} · {ukDate(item.interview_date)}</span></span><span className="text-xs text-muted-foreground">{item.preparation_status || "Not started"}</span></div>)}</div> : <p className="py-5 text-center text-sm text-muted-foreground">No upcoming interviews.</p>}</SectionCard>; }
function ChartSection({ title, data, horizontal }) { return <SectionCard title={title}><ResponsiveContainer width="100%" height={260}><BarChart data={data} layout={horizontal ? "vertical" : "horizontal"}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis type={horizontal ? "number" : "category"} dataKey={horizontal ? undefined : "name"} tick={{ fontSize: 11 }} /><YAxis type={horizontal ? "category" : "number"} dataKey={horizontal ? "name" : undefined} width={horizontal ? 110 : undefined} allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="count" fill="#6366f1" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} /></BarChart></ResponsiveContainer></SectionCard>; }
function WeeklyTrend({ data }) { return <SectionCard title="Weekly activity trend"><ResponsiveContainer width="100%" height={260}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line dataKey="Applications" stroke="#6366f1" strokeWidth={2} /><Line dataKey="Interviews" stroke="#10b981" strokeWidth={2} /></LineChart></ResponsiveContainer></SectionCard>; }

function DashboardEditor({ visible, order, saving, onClose, onSave }) {
  const [selected, setSelected] = useState(visible);
  const [sequence, setSequence] = useState(order);
  function move(id, direction) { const index = sequence.indexOf(id); const next = index + direction; if (next < 0 || next >= sequence.length) return; const copy = [...sequence]; [copy[index], copy[next]] = [copy[next], copy[index]]; setSequence(copy); }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card shadow-2xl"><div className="sticky top-0 flex items-start justify-between border-b border-border bg-card p-5"><div><h2 className="text-lg font-semibold">Edit Dashboard</h2><p className="text-sm text-muted-foreground">Show only what helps Angel take action. Use arrows to change the order.</p></div><button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div><div className="p-5"><div className="space-y-2">{sequence.map((id, index) => { const item = SECTION_CATALOGUE.find((entry) => entry.id === id); if (!item) return null; const checked = selected.includes(id); return <div key={id} className={cn("flex items-center gap-3 rounded-xl border p-3", checked ? "border-primary/40 bg-primary/5" : "border-border")}><button onClick={() => setSelected(checked ? selected.filter((value) => value !== id) : [...selected, id])} className={cn("flex h-5 w-5 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{checked && <Check className="h-3 w-3" />}</button><div className="flex-1"><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.description} · {item.group}</p></div><div className="flex"><button disabled={index === 0} onClick={() => move(id, -1)} className="p-1 text-muted-foreground disabled:opacity-30" aria-label={`Move ${item.label} up`}><ChevronUp className="h-4 w-4" /></button><button disabled={index === sequence.length - 1} onClick={() => move(id, 1)} className="p-1 text-muted-foreground disabled:opacity-30" aria-label={`Move ${item.label} down`}><ChevronDown className="h-4 w-4" /></button></div></div>; })}</div></div><div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card p-5"><button onClick={() => { setSelected(DEFAULT_SECTIONS); setSequence(SECTION_CATALOGUE.map((item) => item.id)); }} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><RotateCcw className="h-4 w-4" />Reset recommended</button><div className="flex gap-2"><button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</button><button disabled={saving} onClick={() => onSave(selected, sequence)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : "Save Dashboard"}</button></div></div></div></div>;
}

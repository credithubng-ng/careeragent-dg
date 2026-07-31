import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatCard } from "@/components/ui-kit";
import GitHubIssues from "@/components/GitHubIssues";
import { ukDate, daysUntil } from "@/lib/format";
import { listOwnedRecords } from "@/lib/ownedEntities";
import { cn } from "@/lib/utils";
import {
  Briefcase, Send, CalendarClock, Trophy, Target, TrendingUp,
  Flame, Users, Clock, CheckCircle2, AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

const MATCH_BANDS = [
  { name: "Excellent", color: "#10b981", min: 85 },
  { name: "Strong", color: "#22c55e", min: 70 },
  { name: "Possible", color: "#f59e0b", min: 55 },
  { name: "Weak", color: "#f97316", min: 40 },
  { name: "Do Not Apply", color: "#f43f5e", min: 0 },
];
const PIE_COLORS = ["#10b981", "#22c55e", "#f59e0b", "#f97316", "#f43f5e"];

// Weekly targets for a 60-day campaign
const WEEKLY_TARGETS = {
  jobsReviewed: 25,
  applications: 10,
  recruiterContacts: 5,
  interviewPrep: 2,
};

function weekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday as week start
  return d;
}

function ProgressBar({ value, target, tone }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const tones = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-rose-500",
    blue: "bg-blue-500",
  };
  const labels = {
    green: "On Track",
    amber: "Needs Attention",
    red: "Behind Target",
    blue: "In Progress",
  };
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{value} / {target}</span>
        <span className={cn("font-medium", tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "red" ? "text-rose-600" : "text-blue-600")}>{labels[tone]}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={cn("h-full rounded-full", tones[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function progressTone(value, target) {
  if (target <= 0) return "blue";
  const pct = value / target;
  if (pct >= 1) return "green";
  if (pct >= 0.5) return "amber";
  return "red";
}

export default function Dashboard() {
  const { data: jobs, loading: jobsLoading } = useCollection("Job", () => listOwnedRecords("Job", {}, "-created_date", 300));
  const { data: applications, loading: appsLoading } = useCollection("Application", () => listOwnedRecords("Application", {}, "-created_date", 300));
  const { data: interviews } = useCollection("Interview", () => listOwnedRecords("Interview", {}, "-interview_date", 200));
  const { data: goals } = useCollection("CampaignGoal", () => listOwnedRecords("CampaignGoal", {}, "-created_date", 5));
  const { data: contacts } = useCollection("Contact", () => listOwnedRecords("Contact", {}, "-created_date", 200));

  const goal = goals[0];

  const stats = useMemo(() => {
    const ws = weekStart();
    const newJobs = jobs.filter((j) => j.job_status === "New").length;
    const jobsReviewed = jobs.filter((j) => j.job_status !== "New").length;
    const jobsReviewedThisWeek = jobs.filter((j) => j.job_status !== "New" && j.created_date && new Date(j.created_date) >= ws).length;
    const strongFit = jobs.filter((j) => j.match_score != null && j.match_score >= 70).length;
    const submittedStages = ["Applied", "Recruiter Contact", "First Interview", "Further Interview", "Assessment", "Reference Check", "Offer"];
    const submitted = applications.filter((a) => submittedStages.includes(a.stage)).length;
    const submittedThisWeek = applications.filter((a) => submittedStages.includes(a.stage) && a.date_applied && new Date(a.date_applied) >= ws).length;
    const recruiterContacts = applications.filter((a) => ["Recruiter Contact", "First Interview", "Further Interview", "Assessment", "Reference Check", "Offer"].includes(a.stage)).length;
    const recruiterContactsThisWeek = contacts.filter((c) => c.created_date && new Date(c.created_date) >= ws).length + applications.filter((a) => a.stage === "Recruiter Contact" && a.date_applied && new Date(a.date_applied) >= ws).length;
    const interviewCount = interviews.length;
    const offers = applications.filter((a) => a.stage === "Offer").length;
    const scored = jobs.filter((j) => j.match_score != null);
    const avgScore = scored.length ? Math.round(scored.reduce((s, j) => s + j.match_score, 0) / scored.length) : 0;
    const appsToInterview = submitted ? Math.round((interviewCount / submitted) * 100) : 0;
    const today = new Date().toISOString().slice(0, 10);
    const followUpsDue = applications.filter((a) => a.follow_up_date && a.follow_up_date <= today && !["Offer", "Rejected", "Withdrawn"].includes(a.stage)).length;
    const awaitingAction = applications.filter((a) => ["Preparing", "Ready to Apply"].includes(a.stage)).length;
    const interviewPrepThisWeek = interviews.filter((iv) => iv.preparation_status && iv.preparation_status !== "Not Started" && iv.created_date && new Date(iv.created_date) >= ws).length;
    return {
      newJobs, jobsReviewed, jobsReviewedThisWeek, strongFit, submitted, submittedThisWeek,
      recruiterContacts, recruiterContactsThisWeek, interviewCount, offers, avgScore,
      appsToInterview, followUpsDue, awaitingAction, interviewPrepThisWeek,
    };
  }, [jobs, applications, interviews, contacts]);

  const daysLeft = useMemo(() => goal?.target_end_date ? daysUntil(goal.target_end_date) : null, [goal]);
  const campaignDays = useMemo(() => {
    if (!goal?.start_date || !goal?.target_end_date) return 60;
    const diff = daysUntil(goal.start_date);
    return diff != null ? Math.max(1, 60 + (60 - (diff + 60))) : 60;
  }, [goal]);

  const bandData = useMemo(() => {
    const bands = MATCH_BANDS.map((b) => ({ name: b.name, count: 0, color: b.color }));
    jobs.forEach((j) => {
      const s = j.match_score;
      if (s == null) return;
      for (const b of MATCH_BANDS) {
        if (s >= b.min) { bands.find((x) => x.name === b.name).count++; break; }
      }
    });
    return bands;
  }, [jobs]);

  const stageData = useMemo(() => {
    const stages = ["Identified", "Reviewing", "Preparing", "Ready to Apply", "Applied", "Recruiter Contact", "First Interview", "Further Interview", "Assessment", "Offer", "Rejected", "Withdrawn"];
    return stages.map((s) => ({ name: s, count: applications.filter((a) => a.stage === s).length }));
  }, [applications]);

  const sourceData = useMemo(() => {
    const map = {};
    jobs.forEach((j) => { const s = j.job_source_name || "Unknown"; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [jobs]);

  const sectorData = useMemo(() => {
    const map = {};
    jobs.forEach((j) => { const s = j.sector || "Unspecified"; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  }, [jobs]);

  const weeklyData = useMemo(() => {
    const weeks = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now); start.setDate(start.getDate() - i * 7 - 6);
      const end = new Date(now); end.setDate(end.getDate() - i * 7);
      const apps = applications.filter((a) => a.date_applied && new Date(a.date_applied) >= start && new Date(a.date_applied) <= end).length;
      const ints = interviews.filter((iv) => iv.interview_date && new Date(iv.interview_date) >= start && new Date(iv.interview_date) <= end).length;
      weeks.push({ name: `${start.getDate()}/${start.getMonth() + 1}`, Applications: apps, Interviews: ints });
    }
    return weeks;
  }, [applications, interviews]);

  if (jobsLoading || appsLoading) return <Loading label="Loading dashboard…" />;

  const hasActivity = jobs.length > 0 || applications.length > 0;

  if (!hasActivity && !goal) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Your 60-day Data Governance job-search campaign" />
        <EmptyState
          title="No campaign activity yet"
          description="Import a job or add Angel's profile to begin. The dashboard will populate as you review jobs, run match analysis and submit applications."
          action={<Link to="/jobs/import" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">Import a Job</Link>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your 60-day Data Governance job-search campaign" />

      {/* 60-Day Scorecard */}
      <SectionCard title="60-Day Job Search Scorecard" className="mb-6"
        description={goal ? `${ukDate(goal.start_date)} – ${ukDate(goal.target_end_date)}` : "Set your campaign dates in Settings"}
        actions={
          daysLeft != null ? (
            <div className="text-right">
              <p className={cn("text-3xl font-bold", daysLeft <= 7 ? "text-rose-600" : daysLeft <= 14 ? "text-amber-600" : "text-foreground")}>{daysLeft}</p>
              <p className="text-xs text-muted-foreground">days remaining</p>
            </div>
          ) : <Link to="/settings" className="text-sm font-medium text-primary hover:underline">Set up campaign</Link>
        }
      >
        {goal ? (
          <div className="space-y-5">
            {/* Key metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="Jobs Reviewed" value={stats.jobsReviewed} hint={`${stats.jobsReviewedThisWeek} this week`} icon={Briefcase} accent="blue" />
              <StatCard label="Strong-Fit Jobs" value={stats.strongFit} hint="Match score ≥ 70" icon={Flame} accent="green" />
              <StatCard label="Applications Submitted" value={stats.submitted} hint={`${stats.submittedThisWeek} this week`} icon={Send} accent="primary" />
              <StatCard label="Recruiter Contacts" value={stats.recruiterContacts} hint={`${stats.recruiterContactsThisWeek} this week`} icon={Users} accent="violet" />
              <StatCard label="Interviews Secured" value={stats.interviewCount} icon={CalendarClock} accent="violet" />
              <StatCard label="Follow-Ups Due" value={stats.followUpsDue} icon={Clock} accent={stats.followUpsDue > 0 ? "amber" : "green"} />
              <StatCard label="Awaiting Action" value={stats.awaitingAction} hint="Preparing / Ready" icon={Target} accent="amber" />
              <StatCard label="Avg Match Score" value={stats.avgScore || "—"} icon={TrendingUp} accent="green" />
              <StatCard label="App→Interview Rate" value={`${stats.appsToInterview}%`} icon={TrendingUp} accent="blue" />
              <StatCard label="Offers" value={stats.offers} icon={Trophy} accent="green" />
            </div>

            {/* Weekly targets */}
            <div>
              <p className="text-sm font-medium text-foreground mb-3">Progress toward weekly targets</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">Jobs reviewed this week</span>
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <ProgressBar value={stats.jobsReviewedThisWeek} target={WEEKLY_TARGETS.jobsReviewed} tone={progressTone(stats.jobsReviewedThisWeek, WEEKLY_TARGETS.jobsReviewed)} />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">Applications submitted this week</span>
                    <Send className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <ProgressBar value={stats.submittedThisWeek} target={WEEKLY_TARGETS.applications} tone={progressTone(stats.submittedThisWeek, WEEKLY_TARGETS.applications)} />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">Recruiter contacts this week</span>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <ProgressBar value={stats.recruiterContactsThisWeek} target={WEEKLY_TARGETS.recruiterContacts} tone={progressTone(stats.recruiterContactsThisWeek, WEEKLY_TARGETS.recruiterContacts)} />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">Interview prep sessions this week</span>
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <ProgressBar value={stats.interviewPrepThisWeek} target={WEEKLY_TARGETS.interviewPrep} tone={progressTone(stats.interviewPrepThisWeek, WEEKLY_TARGETS.interviewPrep)} />
                </div>
              </div>
              {stats.followUpsDue > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{stats.followUpsDue} follow-up{stats.followUpsDue === 1 ? "" : "s"} due — complete them before starting new applications.</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState title="No campaign set" description="Set your campaign start date, targets and end date in Settings to activate the scorecard." action={<Link to="/settings" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">Set up campaign</Link>} />
        )}
      </SectionCard>

      {/* Quick stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="New Jobs" value={stats.newJobs} icon={Briefcase} accent="blue" />
        <StatCard label="High Priority" value={jobs.filter((j) => j.job_status === "High Priority").length} icon={Flame} accent="violet" />
        <StatCard label="In Preparation" value={stats.awaitingAction} icon={Target} accent="amber" />
        <StatCard label="Apps (7 days)" value={stats.submittedThisWeek} icon={Send} accent="primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SectionCard title="Jobs by Match Band">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bandData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {bandData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Applications by Stage">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stageData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Jobs by Source">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sourceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Jobs by Sector">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={sectorData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name }) => name}>
                {sectorData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <div className="mb-6">
        <GitHubIssues />
      </div>

      <SectionCard title="Applications & Interviews by Week">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="Applications" stroke="#6366f1" strokeWidth={2} />
            <Line type="monotone" dataKey="Interviews" stroke="#10b981" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </SectionCard>
    </div>
  );
}
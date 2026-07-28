import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, StatCard, SectionCard, Loading, EmptyState, ScoreBadge } from "@/components/ui-kit";
import GitHubIssues from "@/components/GitHubIssues";
import { ukDate, daysUntil, recommendationBand } from "@/lib/format";
import { Briefcase, Send, CalendarClock, Trophy, Target, TrendingUp, AlertCircle, Flame } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";

const MATCH_BANDS = [
  { name: "Excellent", color: "#10b981", min: 85 },
  { name: "Strong", color: "#22c55e", min: 70 },
  { name: "Possible", color: "#f59e0b", min: 55 },
  { name: "Weak", color: "#f97316", min: 40 },
  { name: "Do Not Apply", color: "#f43f5e", min: 0 },
];

const PIE_COLORS = ["#10b981", "#22c55e", "#f59e0b", "#f97316", "#f43f5e"];

export default function Dashboard() {
  const { data: jobs, loading: jobsLoading } = useCollection("Job", () => base44.entities.Job.list("-created_date", 200));
  const { data: applications, loading: appsLoading } = useCollection("Application", () => base44.entities.Application.list("-created_date", 200));
  const { data: interviews } = useCollection("Interview", () => base44.entities.Interview.list("-created_date", 100));
  const { data: goals } = useCollection("CampaignGoal", () => base44.entities.CampaignGoal.list());

  const goal = goals[0];
  const daysLeft = useMemo(() => goal?.target_end_date ? daysUntil(goal.target_end_date) : null, [goal]);

  const stats = useMemo(() => {
    const newJobs = jobs.filter((j) => j.job_status === "New").length;
    const highPriority = jobs.filter((j) => j.job_status === "High Priority").length;
    const preparing = applications.filter((a) => ["Preparing", "Ready to Apply"].includes(a.stage)).length;
    const submitted = applications.filter((a) => ["Applied", "Recruiter Contact", "First Interview", "Further Interview", "Assessment", "Reference Check", "Offer"].includes(a.stage)).length;
    const interviewCount = interviews.length;
    const offers = applications.filter((a) => a.stage === "Offer").length;
    const scored = jobs.filter((j) => j.match_score != null);
    const avgScore = scored.length ? Math.round(scored.reduce((s, j) => s + j.match_score, 0) / scored.length) : 0;
    const appsToInterview = submitted ? Math.round((interviewCount / submitted) * 100) : 0;
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentApps = applications.filter((a) => a.date_applied && new Date(a.date_applied) >= sevenDaysAgo).length;
    return { newJobs, highPriority, preparing, submitted, interviewCount, offers, avgScore, appsToInterview, recentApps };
  }, [jobs, applications, interviews]);

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

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Executive overview of your Data Governance job-search campaign" />

      {/* Campaign tracker */}
      <SectionCard title="60-Day Campaign Tracker" className="mb-6">
        {goal ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <p className="font-medium text-foreground">{goal.campaign_name}</p>
                <p className="text-xs text-muted-foreground">{ukDate(goal.start_date)} – {ukDate(goal.target_end_date)}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-foreground">{daysLeft ?? "—"}</p>
                <p className="text-xs text-muted-foreground">days remaining</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Applications", val: stats.submitted, target: goal.target_applications },
                { label: "Recruiter Talks", val: applications.filter(a => a.stage === "Recruiter Contact").length, target: goal.target_recruiter_conversations },
                { label: "Interviews", val: stats.interviewCount, target: goal.target_interviews },
                { label: "Offers", val: stats.offers, target: goal.target_offers },
              ].map((g) => (
                <div key={g.label} className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{g.label}</p>
                  <p className="text-lg font-semibold text-foreground">{g.val}<span className="text-sm text-muted-foreground"> / {g.target ?? "—"}</span></p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState title="No campaign set" description="Set your campaign start date, targets and end date in Settings." action={<Link to="/settings" className="text-sm font-medium text-primary hover:underline">Set up campaign</Link>} />
        )}
      </SectionCard>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="New Jobs" value={stats.newJobs} icon={Briefcase} accent="blue" />
        <StatCard label="High Priority" value={stats.highPriority} icon={Flame} accent="violet" />
        <StatCard label="In Preparation" value={stats.preparing} icon={Target} accent="amber" />
        <StatCard label="Submitted" value={stats.submitted} icon={Send} accent="primary" />
        <StatCard label="Interviews" value={stats.interviewCount} icon={CalendarClock} accent="violet" />
        <StatCard label="Offers" value={stats.offers} icon={Trophy} accent="green" />
        <StatCard label="Avg Match Score" value={stats.avgScore} icon={TrendingUp} accent="green" />
        <StatCard label="Apps (7 days)" value={stats.recentApps} icon={Send} accent="blue" />
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
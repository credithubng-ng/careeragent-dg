import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatCard } from "@/components/ui-kit";
import { ukDate } from "@/lib/format";
import { listOwnedRecords } from "@/lib/ownedEntities";
import { cn } from "@/lib/utils";
import {
  Briefcase, Send, Users, CalendarClock, TrendingUp, AlertCircle,
  CheckCircle2, XCircle, BarChart3, Lightbulb,
} from "lucide-react";

function weekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 7); // Last 7 days
  return d;
}

const SUBMITTED_STAGES = ["Applied", "Recruiter Contact", "First Interview", "Further Interview", "Assessment", "Reference Check", "Offer"];

export default function WeeklyReview() {
  const { data: jobs, loading: jobsLoading } = useCollection("Job", () => listOwnedRecords("Job", {}, "-created_date", 500));
  const { data: applications } = useCollection("Application", () => listOwnedRecords("Application", {}, "-created_date", 500));
  const { data: interviews } = useCollection("Interview", () => listOwnedRecords("Interview", {}, "-interview_date", 200));
  const { data: matches } = useCollection("JobMatch", () => listOwnedRecords("JobMatch", {}, "-created_date", 500));

  const ws = weekStart();

  const review = useMemo(() => {
    const jobsThisWeek = jobs.filter((j) => j.created_date && new Date(j.created_date) >= ws);
    const jobsRejected = jobs.filter((j) => ["Skip", "Rejected", "Withdrawn", "Expired"].includes(j.job_status));
    const appsThisWeek = applications.filter((a) => SUBMITTED_STAGES.includes(a.stage) && a.date_applied && new Date(a.date_applied) >= ws);
    const scoredThisWeek = jobsThisWeek.filter((j) => j.match_score != null);
    const avgScore = scoredThisWeek.length ? Math.round(scoredThisWeek.reduce((s, j) => s + j.match_score, 0) / scoredThisWeek.length) : 0;
    const responsesReceived = applications.filter((a) => ["Recruiter Contact", "First Interview", "Further Interview", "Assessment", "Reference Check", "Offer", "Rejected"].includes(a.stage) && a.date_applied && new Date(a.date_applied) >= ws).length;
    const interviewsThisWeek = interviews.filter((iv) => iv.interview_date && new Date(iv.interview_date) >= ws).length;
    const rejectionsThisWeek = applications.filter((a) => a.stage === "Rejected" && a.date_applied && new Date(a.date_applied) >= ws).length;
    const activeApps = applications.filter((a) => !["Rejected", "Withdrawn"].includes(a.stage) && SUBMITTED_STAGES.includes(a.stage)).length;

    // Sources producing best opportunities
    const sourceMap = {};
    jobsThisWeek.forEach((j) => {
      const s = j.job_source_name || "Unknown";
      if (!sourceMap[s]) sourceMap[s] = { count: 0, totalScore: 0, scored: 0 };
      sourceMap[s].count++;
      if (j.match_score != null) { sourceMap[s].totalScore += j.match_score; sourceMap[s].scored++; }
    });
    const bestSources = Object.entries(sourceMap)
      .map(([name, data]) => ({ name, count: data.count, avgScore: data.scored ? Math.round(data.totalScore / data.scored) : null }))
      .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
      .slice(0, 5);

    // Role titles producing strongest matches
    const titleMap = {};
    jobs.forEach((j) => {
      if (j.match_score == null) return;
      const t = j.job_title || "Unknown";
      if (!titleMap[t]) titleMap[t] = { count: 0, totalScore: 0 };
      titleMap[t].count++;
      titleMap[t].totalScore += j.match_score;
    });
    const bestTitles = Object.entries(titleMap)
      .map(([name, data]) => ({ name, count: data.count, avgScore: Math.round(data.totalScore / data.count) }))
      .filter((t) => t.avgScore >= 50)
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);

    // Rejection reasons
    const reasonMap = {};
    jobsRejected.forEach((j) => {
      const r = j.candidate_notes || "Not specified";
      reasonMap[r] = (reasonMap[r] || 0) + 1;
    });
    const rejectionReasons = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Recurring gaps from match data
    const gapMap = {};
    matches.forEach((m) => {
      (m.missing_requirements || []).forEach((req) => {
        const key = req.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
        if (key) gapMap[key] = (gapMap[key] || 0) + 1;
      });
    });
    const recurringGaps = Object.entries(gapMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      jobsThisWeek: jobsThisWeek.length,
      jobsRejected: jobsRejected.length,
      rejectionReasons,
      appsThisWeek: appsThisWeek.length,
      avgScore,
      recruiterContacts: responsesReceived,
      responsesReceived,
      interviewsThisWeek,
      rejectionsThisWeek,
      activeApps,
      bestSources,
      bestTitles,
      recurringGaps,
    };
  }, [jobs, applications, interviews, matches]);

  // Generate weekly recommendation
  const recommendation = useMemo(() => {
    const points = [];
    if (review.appsThisWeek >= 8) {
      points.push({ tone: "green", text: "Strong application volume this week — you're maintaining momentum." });
    } else if (review.appsThisWeek < 4) {
      points.push({ tone: "amber", text: "Application volume is below target — aim for 8–12 quality applications per week." });
    }
    if (review.avgScore >= 70) {
      points.push({ tone: "green", text: `Your average match score of ${review.avgScore} is strong — continue targeting similar roles.` });
    } else if (review.avgScore > 0 && review.avgScore < 55) {
      points.push({ tone: "amber", text: `Average match score of ${review.avgScore} is low — consider adjusting your target role titles or sources.` });
    }
    if (review.bestSources.length > 0 && review.bestSources[0].avgScore >= 65) {
      points.push({ tone: "blue", text: `"${review.bestSources[0].name}" is producing your strongest opportunities — use this source more.` });
    }
    if (review.bestTitles.length > 0) {
      points.push({ tone: "blue", text: `Prioritise "${review.bestTitles[0].name}" roles — these are producing your strongest matches.` });
    }
    if (review.recurringGaps.length > 0) {
      points.push({ tone: "amber", text: `Recurring gap: "${review.recurringGaps[0][0]}" appears in ${review.recurringGaps[0][1]} match analyses — address this in your CV or profile.` });
    }
    if (review.rejectionsThisWeek > 0) {
      points.push({ tone: "amber", text: `${review.rejectionsThisWeek} rejection(s) this week — review the reasons and adjust your targeting.` });
    }
    if (review.responsesReceived === 0 && review.appsThisWeek > 0) {
      points.push({ tone: "amber", text: "No responses received yet this week — follow up on applications submitted over 7 days ago." });
    }
    if (points.length === 0) {
      points.push({ tone: "blue", text: "Keep adding jobs and running match analysis to generate weekly insights." });
    }
    return points;
  }, [review]);

  if (jobsLoading) return <Loading label="Loading weekly review…" />;

  return (
    <div>
      <PageHeader title="Weekly Review" subtitle={`Performance summary for the last 7 days (since ${ukDate(ws.toISOString())})`} />

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Jobs Identified" value={review.jobsThisWeek} icon={Briefcase} accent="blue" />
        <StatCard label="Jobs Rejected/Skipped" value={review.jobsRejected} icon={XCircle} accent="red" />
        <StatCard label="Applications Submitted" value={review.appsThisWeek} icon={Send} accent="primary" />
        <StatCard label="Avg Match Score" value={review.avgScore || "—"} icon={TrendingUp} accent="green" />
        <StatCard label="Responses Received" value={review.responsesReceived} icon={Users} accent="violet" />
        <StatCard label="Interviews" value={review.interviewsThisWeek} icon={CalendarClock} accent="violet" />
        <StatCard label="Rejections" value={review.rejectionsThisWeek} icon={XCircle} accent="red" />
        <StatCard label="Active Applications" value={review.activeApps} icon={CheckCircle2} accent="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly recommendation */}
        <SectionCard title="Weekly Recommendation" description="Auto-generated insights from your data" className="lg:col-span-2">
          <div className="space-y-3">
            {recommendation.map((p, i) => (
              <div key={i} className={cn("flex items-start gap-3 rounded-lg border p-3",
                p.tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : p.tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-blue-200 bg-blue-50 text-blue-800"
              )}>
                <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="text-sm">{p.text}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Best sources */}
        <SectionCard title="Best Sources This Week" description="Where your strongest opportunities come from">
          {review.bestSources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs identified this week yet.</p>
          ) : (
            <div className="space-y-2">
              {review.bestSources.map((s) => (
                <div key={s.name} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.count} job{s.count === 1 ? "" : "s"}</p>
                  </div>
                  {s.avgScore != null && (
                    <span className="text-sm font-semibold text-foreground">{s.avgScore}/100</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Strongest role titles */}
        <SectionCard title="Strongest Matching Role Titles" description="Roles producing your best match scores">
          {review.bestTitles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scored jobs yet.</p>
          ) : (
            <div className="space-y-2">
              {review.bestTitles.map((t) => (
                <div key={t.name} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.count} job{t.count === 1 ? "" : "s"}</p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{t.avgScore}/100</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Rejection reasons */}
        {review.rejectionReasons.length > 0 && (
          <SectionCard title="Jobs Rejected — Reasons" description="Why roles were skipped or rejected">
            <div className="space-y-2">
              {review.rejectionReasons.map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <span className="text-sm text-foreground truncate">{reason}</span>
                  <span className="text-sm font-semibold text-muted-foreground">{count}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Recurring gaps */}
        {review.recurringGaps.length > 0 && (
          <SectionCard title="Recurring Match Gaps" description="Requirements repeatedly missing across your match analyses">
            <div className="space-y-2">
              {review.recurringGaps.map(([gap, count]) => (
                <div key={gap} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <span className="text-sm text-foreground truncate">{gap}</span>
                  <span className="text-sm font-semibold text-amber-600">{count}×</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>

      <div className="mt-6 flex justify-center">
        <Link to="/" className="text-sm font-medium text-primary hover:underline">← Back to Dashboard</Link>
      </div>
    </div>
  );
}
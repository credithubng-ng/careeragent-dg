import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "@/lib/entityHooks";
import { listOwnedRecords } from "@/lib/ownedEntities";
import { PageHeader, SectionCard, Loading, StatCard, EmptyState } from "@/components/ui-kit";
import OINav from "@/components/opportunity-intelligence/OINav";
import { todayISO } from "@/lib/format";
import { Compass, Database, Building2, Mail, Search, Briefcase, Copy, Star, AlertCircle, CalendarClock, TrendingUp, Award } from "lucide-react";

export default function Overview() {
  const { data: sources, loading } = useCollection("OpportunitySource", () => listOwnedRecords("OpportunitySource", {}, "-created_date", 200));
  const { data: employers } = useCollection("TargetEmployer", () => listOwnedRecords("TargetEmployer", {}, "-created_date", 200));
  const { data: jobs } = useCollection("Job", () => listOwnedRecords("Job", {}, "-created_date", 500));
  const { data: runs } = useCollection("DiscoveryRun", () => listOwnedRecords("DiscoveryRun", {}, "-created_date", 100));
  const { data: schedules } = useCollection("SearchSchedule", () => listOwnedRecords("SearchSchedule", {}, "-created_date", 100));
  const { data: emailImports } = useCollection("EmailImport", () => listOwnedRecords("EmailImport", {}, "-created_date", 100));
  const { data: applications } = useCollection("Application", () => listOwnedRecords("Application", {}, "-created_date", 200));

  const stats = useMemo(() => {
    const today = todayISO();
    const activeSources = sources.filter(s => s.monitoring_status === "Active").length;
    const monitoredEmployers = employers.filter(e => e.status === "Monitoring").length;
    const emailsToday = emailImports.filter(e => (e.processed_date || "").startsWith(today)).length;
    const runsToday = runs.filter(r => (r.start_time || "").startsWith(today)).length;
    const jobsToday = jobs.filter(j => (j.date_discovered || j.created_date || "").startsWith(today)).length;
    const duplicatesPrevented = runs.reduce((sum, r) => sum + (r.duplicates || 0), 0);
    const strongOpps = jobs.filter(j => (j.match_score || 0) >= 80).length;
    const priorityA = jobs.filter(j => (j.match_score || 0) >= 90).length;
    const failedRuns = runs.filter(r => r.status === "Failed").length;
    const nextRun = schedules.filter(s => s.next_run).sort((a, b) => a.next_run.localeCompare(b.next_run))[0];
    const bestSource = sources.filter(s => s.jobs_imported > 0).sort((a, b) => b.jobs_imported - a.jobs_imported)[0];
    const bestEmployer = employers.filter(e => e.vacancies_found > 0).sort((a, b) => b.vacancies_found - a.vacancies_found)[0];
    const titleCounts = {};
    jobs.forEach(j => { if (j.job_title) titleCounts[j.job_title] = (titleCounts[j.job_title] || 0) + 1; });
    const bestTitle = Object.entries(titleCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    const pipeline = {
      Discovered: jobs.length,
      "Awaiting Extraction": jobs.filter(j => j.enrichment_status === "Pending").length,
      Imported: jobs.length,
      "Awaiting Match": jobs.filter(j => !j.match_score).length,
      Analysed: jobs.filter(j => j.match_score != null).length,
      "Priority A": jobs.filter(j => (j.match_score || 0) >= 90).length,
      "Priority B": jobs.filter(j => (j.match_score || 0) >= 80 && (j.match_score || 0) < 90).length,
      Consider: jobs.filter(j => (j.match_score || 0) >= 70 && (j.match_score || 0) < 80).length,
      "Do Not Apply": jobs.filter(j => j.match_score != null && j.match_score < 50).length,
      "Preparing Application": jobs.filter(j => j.job_status === "Preparing Application").length,
      "Ready to Apply": applications.filter(a => a.stage === "Ready to Apply").length,
      Applied: jobs.filter(j => j.job_status === "Applied").length,
      Interview: jobs.filter(j => j.job_status === "Interview").length,
      Offer: jobs.filter(j => j.job_status === "Offer").length,
      Rejected: jobs.filter(j => j.job_status === "Rejected").length,
      Expired: jobs.filter(j => j.expired_status).length,
    };
    return { activeSources, monitoredEmployers, emailsToday, runsToday, jobsToday, duplicatesPrevented, strongOpps, priorityA, failedRuns, nextRun, bestSource, bestEmployer, bestTitle, pipeline };
  }, [sources, employers, jobs, runs, schedules, emailImports, applications]);

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Opportunity Intelligence" subtitle="Central control centre for vacancy discovery, monitoring and pipeline" />
      <OINav />
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard label="Active Sources" value={stats.activeSources} icon={Database} accent="blue" />
          <StatCard label="Employers Monitored" value={stats.monitoredEmployers} icon={Building2} accent="violet" />
          <StatCard label="Emails Today" value={stats.emailsToday} icon={Mail} accent="blue" />
          <StatCard label="Searches Today" value={stats.runsToday} icon={Search} accent="primary" />
          <StatCard label="Jobs Found Today" value={stats.jobsToday} icon={Briefcase} accent="green" />
          <StatCard label="Duplicates Prevented" value={stats.duplicatesPrevented} icon={Copy} accent="amber" />
          <StatCard label="Strong Opportunities" value={stats.strongOpps} icon={Star} accent="green" />
          <StatCard label="Priority A" value={stats.priorityA} icon={Award} accent="green" />
          <StatCard label="Failed Runs" value={stats.failedRuns} icon={AlertCircle} accent="red" />
          <StatCard label="Next Scheduled" value={stats.nextRun ? stats.nextRun.schedule_name : "—"} hint={stats.nextRun?.next_run} icon={CalendarClock} accent="primary" />
          <StatCard label="Best Source" value={stats.bestSource?.source_name || "—"} hint={`${stats.bestSource?.jobs_imported || 0} jobs`} icon={TrendingUp} accent="green" />
          <StatCard label="Best Employer" value={stats.bestEmployer?.employer_name || "—"} hint={`${stats.bestEmployer?.vacancies_found || 0} vacancies`} icon={Building2} accent="violet" />
        </div>

        <SectionCard title="Opportunity Pipeline" description="Every vacancy flows through the same core process">
          {jobs.length === 0 ? (
            <EmptyState title="No jobs in pipeline yet" description="Import jobs via email, URL, paste or PDF to populate the pipeline." action={<Link to="/jobs/import" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">Import Jobs</Link>} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              {Object.entries(stats.pipeline).map(([label, count]) => (
                <div key={label} className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                  <div className="text-2xl font-semibold text-foreground">{count}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {stats.bestTitle && (
          <SectionCard title="Top Job Title" description="Most frequently discovered vacancy title">
            <p className="text-lg font-medium text-foreground">{stats.bestTitle}</p>
          </SectionCard>
        )}

        <SectionCard title="Safety and Transparency" description="What this module does and does not do">
          <ul className="space-y-1.5 text-sm text-muted-foreground list-disc list-inside">
            <li>Sources show <strong>Configuration Required</strong> until a working integration is connected.</li>
            <li>Schedules display <strong>Actual Supported Frequency</strong> alongside configured frequency.</li>
            <li>No source is shown as monitoring 24/7 without a functioning backend process.</li>
            <li>Discovery Runs are logged for every real search — no claim of a search without a record.</li>
            <li>Email messages are never deleted. Destructive actions require explicit configuration.</li>
            <li>No automatic application submission or recruiter messages without your approval.</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
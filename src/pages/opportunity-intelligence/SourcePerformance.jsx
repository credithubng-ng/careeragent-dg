import React, { useMemo } from "react";
import { useCollection } from "@/lib/entityHooks";
import { listOwnedRecords } from "@/lib/ownedEntities";
import { PageHeader, SectionCard, Loading, EmptyState, StatCard } from "@/components/ui-kit";
import OINav from "@/components/opportunity-intelligence/OINav";
import { SOURCE_TYPE_ICONS } from "@/lib/oiUtils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, AlertCircle } from "lucide-react";

const BREAKDOWN_TYPES = ["Email", "Job Board", "Employer Career Site", "Browser Extension", "Manual Entry", "URL Import", "PDF Upload", "Recruitment Agency"];

export default function SourcePerformance() {
  const { data: sources, loading } = useCollection("OpportunitySource", () => listOwnedRecords("OpportunitySource", {}, "-created_date", 200));
  const { data: jobs } = useCollection("Job", () => listOwnedRecords("Job", {}, "-created_date", 500));
  const { data: applications } = useCollection("Application", () => listOwnedRecords("Application", {}, "-created_date", 200));

  const perf = useMemo(() => {
    const byType = {};
    BREAKDOWN_TYPES.forEach(t => { byType[t] = { type: t, jobs_found: 0, jobs_imported: 0, duplicates: 0, failed: 0, applications: 0, interviews: 0, offers: 0, match_scores: [] }; });
    sources.forEach(s => {
      const type = BREAKDOWN_TYPES.includes(s.source_type) ? s.source_type : "Other";
      if (!byType[type]) byType[type] = { type, jobs_found: 0, jobs_imported: 0, duplicates: 0, failed: 0, applications: 0, interviews: 0, offers: 0, match_scores: [] };
      byType[type].jobs_found += s.jobs_found || 0;
      byType[type].jobs_imported += s.jobs_imported || 0;
      byType[type].duplicates += s.duplicate_jobs || 0;
      byType[type].failed += s.failed_imports || 0;
      if (s.average_match_score) byType[type].match_scores.push(s.average_match_score);
    });
    // Count applications by job source
    const jobSourceMap = {};
    jobs.forEach(j => { jobSourceMap[j.id] = j.source_type || j.import_method || "Other"; });
    applications.forEach(a => {
      const type = jobSourceMap[a.job_id] || "Other";
      if (!byType[type]) byType[type] = { type, jobs_found: 0, jobs_imported: 0, duplicates: 0, failed: 0, applications: 0, interviews: 0, offers: 0, match_scores: [] };
      byType[type].applications++;
      if (a.stage === "First Interview" || a.stage === "Further Interview") byType[type].interviews++;
      if (a.stage === "Offer") byType[type].offers++;
    });
    const rows = Object.values(byType).filter(r => r.jobs_found > 0 || r.jobs_imported > 0 || r.applications > 0);
    rows.forEach(r => {
      r.duplicate_rate = r.jobs_found > 0 ? Math.round((r.duplicates / r.jobs_found) * 100) : null;
      r.extraction_rate = r.jobs_found > 0 ? Math.round(((r.jobs_found - r.failed) / r.jobs_found) * 100) : null;
      r.avg_match = r.match_scores.length ? Math.round(r.match_scores.reduce((a, b) => a + b, 0) / r.match_scores.length) : null;
    });
    return rows;
  }, [sources, jobs, applications]);

  const totals = useMemo(() => ({
    jobsFound: sources.reduce((s, x) => s + (x.jobs_found || 0), 0),
    jobsImported: sources.reduce((s, x) => s + (x.jobs_imported || 0), 0),
    duplicates: sources.reduce((s, x) => s + (x.duplicate_jobs || 0), 0),
    failed: sources.reduce((s, x) => s + (x.failed_imports || 0), 0),
  }), [sources]);

  if (loading) return <Loading />;

  const chartData = perf.map(r => ({ name: r.type.replace(" Employer Career Site", " Career").replace("Browser Extension", "Extension"), "Jobs Found": r.jobs_found, "Jobs Imported": r.jobs_imported, Applications: r.applications }));

  return (
    <div>
      <PageHeader title="Source Performance" subtitle="Measure how effectively each source type discovers and converts vacancies" />
      <OINav />
      {perf.length === 0 ? (
        <EmptyState title="No performance data yet" description="Performance metrics appear once sources start finding and importing vacancies." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Jobs Found" value={totals.jobsFound} icon={TrendingUp} accent="blue" />
            <StatCard label="Total Imported" value={totals.jobsImported} icon={TrendingUp} accent="green" />
            <StatCard label="Duplicates Prevented" value={totals.duplicates} icon={AlertCircle} accent="amber" />
            <StatCard label="Failed Imports" value={totals.failed} icon={AlertCircle} accent="red" />
          </div>

          {chartData.length > 0 && (
            <SectionCard title="Jobs by Source Type" description="Found, imported and applied — broken down by source type">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="Jobs Found" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Jobs Imported" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Applications" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}

          <SectionCard title="Detailed Breakdown" description="Conversion rates show 'Insufficient data' where sample size is too small">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left p-2 font-medium">Source Type</th>
                    <th className="text-center p-2 font-medium">Found</th>
                    <th className="text-center p-2 font-medium">Imported</th>
                    <th className="text-center p-2 font-medium">Dup. Rate</th>
                    <th className="text-center p-2 font-medium">Extraction</th>
                    <th className="text-center p-2 font-medium">Avg Match</th>
                    <th className="text-center p-2 font-medium">Applications</th>
                    <th className="text-center p-2 font-medium">Interviews</th>
                    <th className="text-center p-2 font-medium">Offers</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.map(r => {
                    const Icon = SOURCE_TYPE_ICONS[r.type] || SOURCE_TYPE_ICONS["Other"];
                    return (
                      <tr key={r.type} className="border-b border-border">
                        <td className="p-2"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" /> {r.type}</div></td>
                        <td className="p-2 text-center">{r.jobs_found}</td>
                        <td className="p-2 text-center">{r.jobs_imported}</td>
                        <td className="p-2 text-center">{r.duplicate_rate != null ? `${r.duplicate_rate}%` : "Insufficient data"}</td>
                        <td className="p-2 text-center">{r.extraction_rate != null ? `${r.extraction_rate}%` : "Insufficient data"}</td>
                        <td className="p-2 text-center">{r.avg_match != null ? `${r.avg_match}%` : "Insufficient data"}</td>
                        <td className="p-2 text-center">{r.applications || "Insufficient data"}</td>
                        <td className="p-2 text-center">{r.interviews || "Insufficient data"}</td>
                        <td className="p-2 text-center">{r.offers || "Insufficient data"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatusBadge, ScoreBadge } from "@/components/ui-kit";
import { ukDate, daysUntil, formatSalary } from "@/lib/format";
import { Plus, Upload, Search, Filter, ExternalLink, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { listOwnedRecords } from "@/lib/ownedEntities";

const SAVED_VIEWS = [
  { label: "Best Matches", filter: (j) => j.match_score >= 70 },
  { label: "Apply Today", filter: (j) => ["Apply", "High Priority"].includes(j.job_status) },
  { label: "Closing Soon", filter: (j) => { const d = daysUntil(j.closing_date); return d != null && d >= 0 && d <= 5; } },
  { label: "Remote Roles", filter: (j) => j.work_arrangement === "Remote" },
  { label: "Contract Roles", filter: (j) => ["Contract", "Interim"].includes(j.employment_type) },
  { label: "All", filter: () => true },
];

export default function Jobs() {
  const { data: jobs, loading, refetch } = useCollection("Job", () => listOwnedRecords("Job", {}, "-created_date", 300));
  const [search, setSearch] = useState("");
  const [view, setView] = useState("All");
  const [filters, setFilters] = useState({ status: "", employment_type: "", work_arrangement: "", minScore: "" });

  const filtered = useMemo(() => {
    let list = jobs.filter(SAVED_VIEWS.find((v) => v.label === view).filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((j) => [j.job_title, j.employer, j.location, j.sector].some((f) => (f || "").toLowerCase().includes(q)));
    }
    if (filters.status) list = list.filter((j) => j.job_status === filters.status);
    if (filters.employment_type) list = list.filter((j) => j.employment_type === filters.employment_type);
    if (filters.work_arrangement) list = list.filter((j) => j.work_arrangement === filters.work_arrangement);
    if (filters.minScore) list = list.filter((j) => (j.match_score || 0) >= Number(filters.minScore));
    return list;
  }, [jobs, search, view, filters]);

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle={`${filtered.length} ${filtered.length === 1 ? "opportunity" : "opportunities"} shown`}
        actions={
          <>
            <Link to="/jobs/import" className="inline-flex items-center gap-2 rounded-lg bg-secondary text-secondary-foreground px-3 py-2 text-sm font-medium hover:bg-secondary/80"><Upload className="h-4 w-4" /> Add Opportunity</Link>
            <Link to="/jobs/new" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"><Plus className="h-4 w-4" /> Add Job</Link>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {SAVED_VIEWS.map((v) => (
          <button key={v.label} onClick={() => setView(v.label)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", view === v.label ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted")}>{v.label}</button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, employer, location, sector…" className="w-full rounded-lg border border-input bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="rounded-lg border border-input bg-card px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {["New", "Reviewing", "High Priority", "Apply", "Maybe", "Skip", "Preparing Application", "Applied", "Interview", "Offer", "Rejected", "Withdrawn", "Expired"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.employment_type} onChange={(e) => setFilters({ ...filters, employment_type: e.target.value })} className="rounded-lg border border-input bg-card px-3 py-2 text-sm">
          <option value="">All types</option>
          {["Permanent", "Contract", "Interim", "Fixed Term", "Part-time"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.work_arrangement} onChange={(e) => setFilters({ ...filters, work_arrangement: e.target.value })} className="rounded-lg border border-input bg-card px-3 py-2 text-sm">
          <option value="">All arrangements</option>
          {["Remote", "Hybrid", "Office", "Unspecified"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.minScore} onChange={(e) => setFilters({ ...filters, minScore: e.target.value })} className="rounded-lg border border-input bg-card px-3 py-2 text-sm">
          <option value="">Any score</option>
          <option value="85">Excellent (85+)</option>
          <option value="70">Strong (70+)</option>
          <option value="55">Possible (55+)</option>
        </select>
      </div>

      {loading ? <Loading /> : jobs.length === 0 ? (
        <EmptyState title="No jobs imported yet" description="Import a job description or add one manually to start tracking opportunities." action={<Link to="/jobs/import" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"><Upload className="h-4 w-4" /> Import Job</Link>} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No jobs found" description="Try adjusting your filters or search." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((j) => {
            const d = daysUntil(j.closing_date);
            return (
              <Link key={j.id} to={`/jobs/${j.id}`} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{j.job_title}</p>
                    <p className="text-sm text-muted-foreground truncate">{j.employer}{j.recruitment_agency ? ` · via ${j.recruitment_agency}` : ""}</p>
                  </div>
                  <StatusBadge status={j.job_status} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                  {j.location && <span>📍 {j.location}</span>}
                  {j.work_arrangement && <span>{j.work_arrangement}</span>}
                  {j.employment_type && <span>{j.employment_type}</span>}
                  <span>{formatSalary(j)}</span>
                  {j.closing_date && <span className={cn(d != null && d <= 3 ? "text-rose-600 font-medium" : "")}>Closes {ukDate(j.closing_date)}</span>}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <ScoreBadge score={j.match_score} />
                  {j.sector && <span className="text-xs text-muted-foreground">{j.sector}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
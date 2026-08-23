import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState } from "@/components/ui-kit";
import { listOwnedRecords, updateOwnedRecord } from "@/lib/ownedEntities";
import { daysUntil, ukDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";
import { ExternalLink, Check, Eye, Mail, Search, X, AlertTriangle, CalendarClock } from "lucide-react";

const REVIEW_STATUSES = ["Needs Review", "URL Restricted", "Partial", "Failed"];
const RELEVANCE_RANK = { Relevant: 0, "Possibly Relevant": 1, "Unlikely Relevant": 2 };

function urgency(job) {
  const days = daysUntil(job.closing_date);
  if (days != null && days < 0) return { label: "Expired", rank: 5, tone: "slate" };
  if (days != null && days <= 2) return { label: days === 0 ? "Closes today" : `Closes in ${days}d`, rank: 0, tone: "rose" };
  if (days != null && days <= 7) return { label: `Closes in ${days}d`, rank: 1, tone: "amber" };
  return { label: job.closing_date ? `Closes ${ukDate(job.closing_date)}` : "No closing date", rank: 3, tone: "slate" };
}

function priorityValue(job) {
  const u = urgency(job);
  const relevance = RELEVANCE_RANK[job.relevance_tier] ?? 3;
  const scoreRank = job.match_score == null ? 101 : 100 - job.match_score;
  const completeness = job.email_import_status === "URL Restricted" ? 1 : job.email_import_status === "Failed" ? 3 : 0;
  return u.rank * 10000 + relevance * 1000 + scoreRank * 5 + completeness;
}

export default function EmailImportReview() {
  const navigate = useNavigate();
  const { data: jobs, loading, refetch } = useCollection("Job", () =>
    listOwnedRecords("Job", { discovered_from_email: true }, "-created_date", 1000)
  );
  const { data: emailImports } = useCollection("EmailImport", () =>
    listOwnedRecords("EmailImport", {}, "-created_date", 200)
  );
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [relevance, setRelevance] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [deadline, setDeadline] = useState("active");
  const [sort, setSort] = useState("priority");
  const [selected, setSelected] = useState([]);
  const [working, setWorking] = useState(false);

  const reviewJobs = useMemo(() => (jobs || []).filter((job) => REVIEW_STATUSES.includes(job.email_import_status)), [jobs]);
  const sources = useMemo(() => [...new Set(reviewJobs.map((job) => job.email_source).filter(Boolean))].sort(), [reviewJobs]);

  const visibleJobs = useMemo(() => {
    let list = [...reviewJobs];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((job) => [job.job_title, job.employer, job.location, job.job_description]
        .some((value) => (value || "").toLowerCase().includes(q)));
    }
    if (source) list = list.filter((job) => job.email_source === source);
    if (relevance) list = list.filter((job) => job.relevance_tier === relevance);
    if (reviewStatus) list = list.filter((job) => job.email_import_status === reviewStatus);
    if (deadline === "active") list = list.filter((job) => urgency(job).label !== "Expired");
    if (deadline === "soon") list = list.filter((job) => { const d = daysUntil(job.closing_date); return d != null && d >= 0 && d <= 7; });
    if (deadline === "expired") list = list.filter((job) => urgency(job).label === "Expired");
    list.sort((a, b) => sort === "newest"
      ? new Date(b.created_date || 0) - new Date(a.created_date || 0)
      : sort === "score"
        ? (b.match_score ?? -1) - (a.match_score ?? -1)
        : priorityValue(a) - priorityValue(b));
    return list;
  }, [reviewJobs, query, source, relevance, reviewStatus, deadline, sort]);

  const closingSoon = reviewJobs.filter((job) => { const d = daysUntil(job.closing_date); return d != null && d >= 0 && d <= 7; }).length;
  const relevant = reviewJobs.filter((job) => job.relevance_tier === "Relevant").length;
  const restricted = reviewJobs.filter((job) => job.email_import_status === "URL Restricted").length;

  async function updateJobs(ids, data, successMessage) {
    if (!ids.length) return;
    setWorking(true);
    try {
      await Promise.all(ids.map((id) => updateOwnedRecord("Job", id, data)));
      setSelected([]);
      await refetch();
      toast.success(successMessage);
    } catch {
      toast.error("Some jobs could not be updated. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  const approve = (ids) => updateJobs(ids, { email_import_status: "Complete", job_status: "New" }, `${ids.length} job${ids.length === 1 ? "" : "s"} approved`);
  const notInterested = (ids) => updateJobs(ids, { email_import_status: "Complete", job_status: "Skip" }, `${ids.length} job${ids.length === 1 ? "" : "s"} marked not interested`);
  const markExpired = (ids) => updateJobs(ids, { email_import_status: "Complete", job_status: "Expired" }, `${ids.length} job${ids.length === 1 ? "" : "s"} archived as expired`);
  const allVisibleSelected = visibleJobs.length > 0 && visibleJobs.every((job) => selected.includes(job.id));

  if (loading) return <Loading label="Loading review queue…" />;

  return (
    <div>
      <PageHeader title="Email Import Review" subtitle="Decide the best new opportunities first; nothing is scored as suitable merely because it was imported" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QueueStat label="Awaiting decision" value={reviewJobs.length} active={!relevance && !reviewStatus && deadline === "active"} onClick={() => { setRelevance(""); setReviewStatus(""); setDeadline("active"); }} />
        <QueueStat label="Relevant" value={relevant} active={relevance === "Relevant"} onClick={() => setRelevance("Relevant")} tone="green" />
        <QueueStat label="Closing within 7 days" value={closingSoon} active={deadline === "soon"} onClick={() => setDeadline("soon")} tone="amber" />
        <QueueStat label="Restricted URLs" value={restricted} active={reviewStatus === "URL Restricted"} onClick={() => { setReviewStatus("URL Restricted"); setDeadline("all"); }} tone="rose" />
      </div>

      <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, employer, location or description…" className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm" />
          </div>
          <select value={source} onChange={(event) => setSource(event.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-sm">
            <option value="">All sources</option>{sources.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={relevance} onChange={(event) => setRelevance(event.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-sm">
            <option value="">All relevance levels</option><option>Relevant</option><option>Possibly Relevant</option><option>Unlikely Relevant</option>
          </select>
          <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-sm">
            <option value="">All review reasons</option>{REVIEW_STATUSES.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={deadline} onChange={(event) => setDeadline(event.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-sm">
            <option value="active">Active only</option><option value="soon">Closing within 7 days</option><option value="expired">Expired only</option><option value="all">All deadlines</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-sm">
            <option value="priority">Priority order</option><option value="score">Highest score</option><option value="newest">Newest first</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? selected.filter((id) => !visibleJobs.some((job) => job.id === id)) : [...new Set([...selected, ...visibleJobs.map((job) => job.id)])])} />
            Select all {visibleJobs.length} shown
          </label>
          {selected.length > 0 && <div className="flex flex-wrap gap-2">
            <button disabled={working} onClick={() => approve(selected)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Approve {selected.length}</button>
            <button disabled={working} onClick={() => notInterested(selected)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50">Not interested</button>
            <button disabled={working} onClick={() => markExpired(selected)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50">Mark expired</button>
            <button onClick={() => setSelected([])} className="p-1.5 text-muted-foreground" aria-label="Clear selection"><X className="h-4 w-4" /></button>
          </div>}
        </div>
      </div>

      {visibleJobs.length === 0 ? <EmptyState title="No jobs match these filters" description="Change a filter or wait for the next Gmail intake run." /> : (
        <div className="space-y-3">
          {visibleJobs.map((job) => <ReviewJobCard key={job.id} job={job} selected={selected.includes(job.id)} onSelect={() => setSelected((current) => current.includes(job.id) ? current.filter((id) => id !== job.id) : [...current, job.id])} onApprove={() => approve([job.id])} onReject={() => notInterested([job.id])} onExpire={() => markExpired([job.id])} onOpen={() => navigate(`/jobs/${job.id}`)} />)}
        </div>
      )}

      {emailImports?.length > 0 && <SectionCard title="Recent intake health" description="Latest Gmail processing results" className="mt-6">
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          {emailImports.slice(0, 5).map((item) => <div key={item.id} className="rounded-lg border border-border p-3"><p className="font-medium truncate">{item.source || "Unknown source"}</p><p className="text-xs text-muted-foreground truncate">{item.subject || "No subject"}</p><p className="mt-1 text-xs">{item.jobs_imported || 0} imported · {item.duplicates_skipped || 0} duplicate</p></div>)}
        </div>
      </SectionCard>}
    </div>
  );
}

function QueueStat({ label, value, onClick, active, tone = "blue", hint }) {
  const tones = { blue: "text-blue-700", green: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700" };
  return <button onClick={onClick} className={cn("rounded-xl border bg-card p-4 text-left shadow-sm transition", active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/30")}><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className={cn("mt-1 text-2xl font-semibold", tones[tone])}>{value}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</button>;
}

function ReviewJobCard({ job, selected, onSelect, onApprove, onReject, onExpire, onOpen }) {
  const u = urgency(job);
  const statusColors = { "Needs Review": "bg-amber-100 text-amber-700", "URL Restricted": "bg-rose-100 text-rose-700", Partial: "bg-blue-100 text-blue-700", Failed: "bg-rose-100 text-rose-700" };
  return <div className={cn("rounded-xl border bg-card p-4 shadow-sm", selected ? "border-primary ring-1 ring-primary" : "border-border")}>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <input type="checkbox" checked={selected} onChange={onSelect} className="mt-1" aria-label={`Select ${job.job_title}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-foreground">{job.job_title || "Untitled role"}</h3><span className={cn("rounded-full px-2 py-0.5 text-xs", statusColors[job.email_import_status] || "bg-slate-100 text-slate-600")}>{job.email_import_status}</span><span className={cn("rounded-full px-2 py-0.5 text-xs", job.relevance_tier === "Relevant" ? "bg-emerald-100 text-emerald-700" : job.relevance_tier === "Possibly Relevant" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>{job.relevance_tier || "Not classified"}</span>{job.match_score != null && <span className="text-xs font-semibold">{job.match_score}% match</span>}</div>
        <p className="mt-1 text-sm text-muted-foreground">{job.employer || "Unknown employer"}{job.location ? ` · ${job.location}` : ""}{job.salary_description ? ` · ${job.salary_description}` : ""}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Mail className="h-3 w-3" />{job.email_source || "Email"}</span><span className={cn("flex items-center gap-1", u.tone === "rose" ? "font-medium text-rose-700" : u.tone === "amber" ? "font-medium text-amber-700" : "")}><CalendarClock className="h-3 w-3" />{u.label}</span>{job.email_sender_trust === "Unrecognised" && <span className="flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3 w-3" />New sender</span>}</div>
        {job.job_description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{job.job_description}</p>}
        {job.original_job_url && <a href={job.original_job_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" />Open original advert</a>}
      </div>
      <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
        <button onClick={onOpen} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"><Eye className="h-4 w-4" />Review</button>
        <button onClick={onApprove} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"><Check className="h-4 w-4" />Approve</button>
        {u.label === "Expired" ? <button onClick={onExpire} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium">Archive expired</button> : <button onClick={onReject} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">Not interested</button>}
      </div>
    </div>
  </div>;
}

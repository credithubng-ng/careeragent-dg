import React, { useState, useMemo } from "react";
import { useCollection } from "@/lib/entityHooks";
import { listOwnedRecords, createOwnedRecord, deleteOwnedRecord } from "@/lib/ownedEntities";
import { PageHeader, Loading, EmptyState, StatCard } from "@/components/ui-kit";
import OINav from "@/components/opportunity-intelligence/OINav";
import { RUN_STATUS_STYLES } from "@/lib/oiUtils";
import { ukDateTime } from "@/lib/format";
import { Zap, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

const TRIGGER_TYPES = ["Scheduled", "Manual", "Email Event", "Browser Extension", "API", "Retry"];

export default function DiscoveryRuns() {
  const { data: runs, loading, refetch } = useCollection("DiscoveryRun", () => listOwnedRecords("DiscoveryRun", {}, "-created_date", 100));
  const { data: agents } = useCollection("AgentConfiguration", () => listOwnedRecords("AgentConfiguration", {}, "-created_date", 50));
  const [expanded, setExpanded] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    if (filterStatus === "all") return runs;
    return runs.filter(r => r.status === filterStatus);
  }, [runs, filterStatus]);

  const totals = useMemo(() => ({
    jobsFound: runs.reduce((s, r) => s + (r.jobs_found || 0), 0),
    jobsImported: runs.reduce((s, r) => s + (r.jobs_imported || 0), 0),
    duplicates: runs.reduce((s, r) => s + (r.duplicates || 0), 0),
    failed: runs.filter(r => r.status === "Failed").length,
  }), [runs]);

  async function createManualRun() {
    setCreating(true);
    try {
      const now = new Date().toISOString();
      await createOwnedRecord("DiscoveryRun", { agent_name: "Manual Run", source_name: "Manual", start_time: now, end_time: now, status: "Completed", trigger_type: "Manual", triggered_by: "user", records_checked: 0, jobs_found: 0, jobs_imported: 0, duplicates: 0, duration_seconds: 0 });
      refetch(); toast.success("Manual run logged");
    } catch { toast.error("Failed to log run"); } finally { setCreating(false); }
  }

  async function remove(r) { if (!confirm("Delete this run record?")) return; try { await deleteOwnedRecord("DiscoveryRun", r.id); refetch(); toast.success("Run deleted"); } catch { toast.error("Failed to delete"); } }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Discovery Runs" subtitle="Log of every discovery search — no claim of a search without a record"
        actions={<button onClick={createManualRun} disabled={creating} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"><Zap className="h-4 w-4" /> Log Manual Run</button>} />
      <OINav />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Jobs Found" value={totals.jobsFound} accent="blue" />
        <StatCard label="Total Imported" value={totals.jobsImported} accent="green" />
        <StatCard label="Duplicates Prevented" value={totals.duplicates} accent="amber" />
        <StatCard label="Failed Runs" value={totals.failed} accent="red" />
      </div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setFilterStatus("all")} className={cn("rounded-lg px-3 py-1.5 text-sm", filterStatus === "all" ? "bg-primary text-primary-foreground" : "border border-border")}>All</button>
        {["Running", "Completed", "Failed", "Partially Completed", "Skipped"].map(s => <button key={s} onClick={() => setFilterStatus(s)} className={cn("rounded-lg px-3 py-1.5 text-sm", filterStatus === s ? "bg-primary text-primary-foreground" : "border border-border")}>{s}</button>)}
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No discovery runs logged" description="Runs are logged automatically when a search executes. You can also log a manual run." />
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className="rounded-xl border border-border bg-card shadow-sm">
              <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="w-full flex items-center justify-between p-4 text-left">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{r.agent_name}</h3>
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", RUN_STATUS_STYLES[r.status] || RUN_STATUS_STYLES["Skipped"])}>{r.status}</span>
                    <span className="text-xs text-muted-foreground">{r.trigger_type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.source_name || "—"} · {ukDateTime(r.start_time)}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="hidden md:flex gap-4 text-center text-xs">
                    <div><div className="font-semibold">{r.jobs_found || 0}</div><div className="text-muted-foreground">Found</div></div>
                    <div><div className="font-semibold">{r.jobs_imported || 0}</div><div className="text-muted-foreground">Imported</div></div>
                    <div><div className="font-semibold">{r.duplicates || 0}</div><div className="text-muted-foreground">Dupes</div></div>
                  </div>
                  {expanded === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {expanded === r.id && (
                <div className="border-t border-border p-4 bg-muted/30">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Start:</span> {ukDateTime(r.start_time)}</div>
                    <div><span className="text-muted-foreground">End:</span> {ukDateTime(r.end_time)}</div>
                    <div><span className="text-muted-foreground">Duration:</span> {r.duration_seconds ? `${r.duration_seconds}s` : "—"}</div>
                    <div><span className="text-muted-foreground">Triggered by:</span> {r.triggered_by || "—"}</div>
                    <div><span className="text-muted-foreground">Records checked:</span> {r.records_checked || 0}</div>
                    <div><span className="text-muted-foreground">Jobs updated:</span> {r.jobs_updated || 0}</div>
                    <div><span className="text-muted-foreground">Strong matches:</span> {r.strong_matches || 0}</div>
                    <div><span className="text-muted-foreground">Weak matches:</span> {r.weak_matches || 0}</div>
                  </div>
                  {r.error_summary && <p className="text-sm text-rose-600 mt-3">{r.error_summary}</p>}
                  {r.errors && <p className="text-xs text-rose-600 mt-1">{r.errors}</p>}
                  <button onClick={() => remove(r)} className="mt-3 inline-flex items-center gap-1 text-xs text-rose-600 hover:underline"><Trash2 className="h-3 w-3" /> Delete run</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
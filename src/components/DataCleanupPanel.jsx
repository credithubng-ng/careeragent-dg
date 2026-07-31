import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { SectionCard, Notice } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { Trash2, AlertTriangle, CheckCircle2, Loader2, FlaskConical } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  previewDataCleanup, executeDataCleanup,
  previewTestingReset, executeTestingReset,
} from "@/lib/dataCleanup";

export default function DataCleanupPanel() {
  const [cleanupPreview, setCleanupPreview] = useState(null);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [testingPreview, setTestingPreview] = useState(null);
  const [testingResult, setTestingResult] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [running, setRunning] = useState(false);

  async function loadCleanupPreview() {
    setLoadingPreview("cleanup");
    try {
      const me = await base44.auth.me();
      const result = await previewDataCleanup(me.email);
      setCleanupPreview(result);
      setConfirming("cleanup");
    } catch (error) {
      toast.error(error?.message || "Unable to scan for placeholder data.");
    } finally {
      setLoadingPreview(null);
    }
  }

  async function runCleanup() {
    setRunning(true);
    const t = toast.loading("Removing demo and placeholder data…");
    try {
      const me = await base44.auth.me();
      const result = await executeDataCleanup(me.email);
      setCleanupResult(result);
      setConfirming(null);
      setCleanupPreview(null);
      toast.success(`Cleanup complete — ${result.placeholderRemoved} placeholder record(s) removed.`, { id: t });
    } catch (error) {
      toast.error(error?.message || "Cleanup failed.", { id: t });
    } finally {
      setRunning(false);
    }
  }

  async function loadTestingPreview() {
    setLoadingPreview("testing");
    try {
      const me = await base44.auth.me();
      const result = await previewTestingReset(me.email);
      setTestingPreview(result);
      setConfirming("testing");
    } catch (error) {
      toast.error(error?.message || "Unable to scan for test data.");
    } finally {
      setLoadingPreview(null);
    }
  }

  async function runTestingReset() {
    setRunning(true);
    const t = toast.loading("Clearing testing activity…");
    try {
      const me = await base44.auth.me();
      const result = await executeTestingReset(me.email);
      setTestingResult(result);
      setConfirming(null);
      setTestingPreview(null);
      toast.success(`Testing reset complete — ${result.removed} record(s) removed.`, { id: t });
    } catch (error) {
      toast.error(error?.message || "Testing reset failed.", { id: t });
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <SectionCard
        title="Data Cleanup"
        description="Remove demo, sample and placeholder records from your account"
      >
        <Notice tone="amber">
          This will remove sample, demo and placeholder records owned by your account.
          Genuine records will be preserved.
        </Notice>

        <div className="mt-4">
          {loadingPreview === "cleanup" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Scanning for placeholder data…
            </div>
          ) : confirming === "cleanup" && cleanupPreview ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div><span className="text-muted-foreground">Placeholder records:</span> <span className="font-semibold text-rose-600">{cleanupPreview.totalPlaceholder}</span></div>
                  <div><span className="text-muted-foreground">Genuine records:</span> <span className="font-semibold text-emerald-600">{cleanupPreview.totalGenuine}</span></div>
                  <div><span className="text-muted-foreground">Orphaned documents:</span> <span className="font-semibold text-amber-600">{cleanupPreview.orphanedDocuments}</span></div>
                  <div><span className="text-muted-foreground">Duplicate candidates:</span> <span className="font-semibold text-amber-600">{cleanupPreview.duplicateCandidates}</span></div>
                </div>
                {cleanupPreview.totalPlaceholder > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs font-medium text-muted-foreground cursor-pointer">View placeholder records</summary>
                    <ul className="mt-1 text-xs text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto">
                      {Object.entries(cleanupPreview.entities)
                        .filter(([, v]) => v.placeholder > 0)
                        .flatMap(([entity, v]) =>
                          v.placeholderItems.map((item) => (
                            <li key={`${entity}-${item.id}`}>{entity}: {item.label}</li>
                          ))
                        )}
                    </ul>
                  </details>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setConfirming(null); setCleanupPreview(null); }} disabled={running} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
                <button onClick={runCleanup} disabled={running || cleanupPreview.totalPlaceholder === 0} className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium", cleanupPreview.totalPlaceholder > 0 ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-muted text-muted-foreground")}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {cleanupPreview.totalPlaceholder > 0 ? `Remove ${cleanupPreview.totalPlaceholder} Record(s)` : "Nothing to Remove"}
                </button>
              </div>
            </div>
          ) : cleanupResult ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-center gap-2 font-medium mb-2"><CheckCircle2 className="h-4 w-4" /> Cleanup Complete</div>
                <ul className="space-y-1 text-xs">
                  <li>Placeholder records removed: <strong>{cleanupResult.placeholderRemoved}</strong></li>
                  <li>Duplicate records resolved: <strong>{cleanupResult.duplicatesResolved}</strong></li>
                  <li>Genuine records preserved: <strong>{cleanupResult.genuinePreserved}</strong></li>
                  <li>Orphaned records removed: <strong>{cleanupResult.orphanedRemoved}</strong></li>
                  {cleanupResult.manualReview.length > 0 && (
                    <li className="text-amber-700">Records requiring manual review: <strong>{cleanupResult.manualReview.length}</strong></li>
                  )}
                </ul>
              </div>
              <button onClick={() => { setCleanupResult(null); }} className="text-sm text-muted-foreground hover:text-foreground">Dismiss</button>
            </div>
          ) : (
            <button onClick={loadCleanupPreview} disabled={loadingPreview !== null} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> Remove Demo and Placeholder Data
            </button>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Clear Testing Activity"
        description="Remove test jobs, matches, applications, documents, contacts and interviews created during controlled testing"
        className="mt-6"
      >
        <Notice tone="blue">
          This option removes only records created during controlled testing. Your Candidate Profile,
          Master CV and Settings are preserved.
        </Notice>

        <div className="mt-4">
          {loadingPreview === "testing" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Scanning for test records…
            </div>
          ) : confirming === "testing" && testingPreview ? (
            <div className="space-y-3">
              {testingPreview.totalTest === 0 ? (
                <p className="text-sm text-muted-foreground">No test records found.</p>
              ) : (
                <>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <p className="mb-2"><span className="text-muted-foreground">Test records to remove:</span> <span className="font-semibold text-rose-600">{testingPreview.totalTest}</span></p>
                    <details>
                      <summary className="text-xs font-medium text-muted-foreground cursor-pointer">View test records</summary>
                      <ul className="mt-1 text-xs text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto">
                        {Object.entries(testingPreview.entities)
                          .filter(([, v]) => v.testCount > 0)
                          .flatMap(([entity, v]) =>
                            v.items.map((item) => (
                              <li key={`${entity}-${item.id}`}>{entity}: {item.label} ({item.created})</li>
                            ))
                          )}
                      </ul>
                    </details>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setConfirming(null); setTestingPreview(null); }} disabled={running} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
                    <button onClick={runTestingReset} disabled={running} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 text-white px-4 py-2 text-sm font-medium hover:bg-rose-700">
                      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                      Clear {testingPreview.totalTest} Test Record(s)
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : testingResult ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-center gap-2 font-medium mb-2"><CheckCircle2 className="h-4 w-4" /> Testing Reset Complete</div>
                <ul className="space-y-1 text-xs">
                  <li>Test records removed: <strong>{testingResult.removed}</strong></li>
                  <li>Preserved: <strong>{testingResult.preserved.join(", ")}</strong></li>
                  {testingResult.errors.length > 0 && (
                    <li className="text-amber-700">Errors: {testingResult.errors.length}</li>
                  )}
                </ul>
              </div>
              <button onClick={() => setTestingResult(null)} className="text-sm text-muted-foreground hover:text-foreground">Dismiss</button>
            </div>
          ) : (
            <button onClick={loadTestingPreview} disabled={loadingPreview !== null} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              <FlaskConical className="h-4 w-4" /> Clear Testing Activity
            </button>
          )}
        </div>
      </SectionCard>
    </>
  );
}
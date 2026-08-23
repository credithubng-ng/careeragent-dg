import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { SectionCard, Loading } from "@/components/ui-kit";
import { useCollection } from "@/lib/entityHooks";
import { listOwnedRecords } from "@/lib/ownedEntities";
import { toast } from "react-hot-toast";
import { Mail, Loader2, Plug, PlugZap, RefreshCw, Sparkles, AlertCircle, CheckCircle2, Clock, MailOpen, FileText, Copy, XCircle } from "lucide-react";

const CONNECTOR_ID = "6a6dbe19898b53557d5ea634";

export default function GmailConnectionCard() {
  const [user, setUser] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [gmailAddress, setGmailAddress] = useState("");
  const [connectionError, setConnectionError] = useState("");

  const { data: emailImports, refetch: refetchImports } = useCollection("EmailImport", () => listOwnedRecords("EmailImport", {}, "-created_date", 200));
  const { data: emailJobs, refetch: refetchJobs } = useCollection("Job", () => listOwnedRecords("Job", { discovered_from_email: true }, "-created_date", 500));
  const { data: intakeStates, refetch: refetchState } = useCollection("EmailIntakeState", () => listOwnedRecords("EmailIntakeState", {}, "-last_checked_at", 1));

  const fetchData = useCallback(async () => {
    try {
      const authed = await base44.auth.isAuthenticated();
      if (!authed) { setLoading(false); return; }
      const me = await base44.auth.me();
      setUser(me);
      setConnectionError("");

      // Check connection by calling the backend function with a lightweight check
      try {
        const res = await base44.functions.invoke("processGmailAlerts", { mode: "check" });
        if (res.data?.not_connected) {
          setConnected(false);
        } else {
          setConnected(true);
          // Try to get Gmail address from the response or profile
          setGmailAddress(me.email || "");
        }
      } catch (err) {
        if (err?.response?.data?.not_connected) {
          setConnected(false);
        } else {
          setConnected(false);
          setConnectionError(err?.response?.data?.error || err?.message || "Unable to verify the Gmail connection.");
        }
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConnect = async () => {
    try {
      const url = await base44.connectors.connectAppUser(CONNECTOR_ID);
      const popup = window.open(url, "_blank");
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          fetchData();
        }
      }, 500);
    } catch {
      toast.error("Failed to start Gmail connection flow");
    }
  };

  const handleDisconnect = async () => {
    try {
      await base44.connectors.disconnectAppUser(CONNECTOR_ID);
      setConnected(false);
      setGmailAddress("");
      toast.success("Gmail disconnected");
    } catch {
      toast.error("Failed to disconnect Gmail");
    }
  };

  const handleImport = async (mode) => {
    setImporting(true);
    setSummary(null);
    try {
      const res = await base44.functions.invoke("processGmailAlerts", { mode, maxJobs: 20 });
      setSummary(res.data?.summary);
      await Promise.all([refetchImports(), refetchJobs(), refetchState()]);
      if (res.data?.summary) {
        const s = res.data.summary;
        toast.success(`Import complete: ${s.jobs_imported} jobs imported, ${s.duplicates_skipped} duplicates skipped`);
      } else if (res.data?.error) {
        toast.error(res.data.error);
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Import failed";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  // Calculate stats
  const intakeState = intakeStates?.[0];
  const stats = intakeState ? {
    emailsProcessed: intakeState.total_emails_processed || 0,
    jobsExtracted: intakeState.total_jobs_imported || 0,
    duplicatesSkipped: intakeState.total_duplicates_skipped || 0,
    failedEmails: intakeState.total_failed_emails || 0,
  } : {
    emailsProcessed: emailImports?.length === 200 ? "200+" : emailImports?.length || 0,
    jobsExtracted: emailJobs?.length === 500 ? "500+" : emailJobs?.length || 0,
    duplicatesSkipped: emailImports?.reduce((sum, ei) => sum + (ei.duplicates_skipped || 0), 0) || 0,
    failedEmails: emailImports?.filter((ei) => ei.processing_status === "Failed").length || 0,
  };

  const lastCheck = intakeState?.last_checked_at || emailImports?.[0]?.processed_date;
  const nextCheck = "Automatic event; manual check available";

  if (loading) return <Loading label="Checking Gmail connection…" />;

  return (
    <SectionCard
      title="Email Job Alerts"
      description="Connect Gmail to automatically import vacancies from job-alert emails"
      actions={connected && (
        <button
          onClick={handleDisconnect}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          <PlugZap className="h-4 w-4" /> Disconnect
        </button>
      )}
    >
      {!connected ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Mail className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium text-foreground">Gmail not connected</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Connect your Gmail account to import job vacancies from job-alert emails. CareerAgent searches for emails from known job-alert senders (Indeed, LinkedIn, Totaljobs, etc.) — it will never read your other mail or send emails.
          </p>
          <p className="mt-2 max-w-md text-xs text-amber-700">
            Gmail access does not transfer when the CareerAgent login email changes. Reconnect it once for this account.
          </p>
          {connectionError && <p role="alert" className="mt-2 max-w-md text-xs text-rose-600">{connectionError}</p>}
          <button
            onClick={handleConnect}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            <Plug className="h-4 w-4" /> Connect Gmail
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Connection status */}
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-800">Connected: {gmailAddress || "Gmail account"}</span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox icon={MailOpen} label="Emails Processed" value={stats.emailsProcessed} />
            <StatBox icon={FileText} label="Jobs Extracted" value={stats.jobsExtracted} />
            <StatBox icon={Copy} label="Duplicates Skipped" value={stats.duplicatesSkipped} />
            <StatBox icon={XCircle} label="Failed Emails" value={stats.failedEmails} />
          </div>

          {/* Schedule info */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>Last check: {lastCheck ? new Date(lastCheck).toLocaleString("en-GB") : "Not yet run"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4" />
              <span>Next scheduled: {nextCheck}</span>
            </div>
          </div>

          {/* Import buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleImport("initial")}
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {importing ? "Importing…" : "Import First 20 Vacancies"}
            </button>
            <button
              onClick={() => handleImport("incremental")}
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" /> Check Gmail Now
            </button>
          </div>

          {/* Import summary */}
          {summary && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="font-medium text-foreground mb-2">Import Summary</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <SummaryItem label="Emails Processed" value={summary.emails_processed} />
                <SummaryItem label="Emails Scanned" value={summary.emails_scanned} />
                <SummaryItem label="Jobs Imported" value={summary.jobs_imported} />
                <SummaryItem label="Duplicates Skipped" value={summary.duplicates_skipped} />
                <SummaryItem label="Irrelevant Excluded" value={summary.jobs_rejected} />
                <SummaryItem label="Failed Emails" value={summary.failed_emails} />
                <SummaryItem label="New Senders for Review" value={summary.unknown_queued} />
              </div>
              {summary.message && (
                <p className="mt-2 text-sm text-muted-foreground">{summary.message}</p>
              )}
              {summary.errors?.length > 0 && (
                <div className="mt-2 flex items-start gap-1.5 text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{summary.errors[0]}</span>
                </div>
              )}
            </div>
          )}

          {/* How it works */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <p className="font-medium">How Email Import Works</p>
            <p className="mt-1">
              CareerAgent searches recognised job-alert senders and job-like subjects. Recognised sources continue through normal import;
              vacancies from a new sender are held in Email Import Review without automatic scoring until you approve them.
              Every scan is recorded, including scans that find no new vacancies.
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function StatBox({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

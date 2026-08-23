import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, Loading, EmptyState } from "@/components/ui-kit";
import { listOwnedRecords, updateOwnedRecord } from "@/lib/ownedEntities";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Inbox, Sparkles, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Mail, Clock, ThumbsUp, X, RefreshCw } from "lucide-react";

const POSITIVE = ["Interview Invitation", "Interview Feedback", "Progression", "Offer", "Reference Check", "Onboarding"];
const FILTERS = ["Priority", "Action Required", "Needs Review", "Positive", "Rejections", "All"];

export default function ApplicationInbox() {
  const { data: communications, loading, refetch } = useCollection("ApplicationCommunication", () => listOwnedRecords("ApplicationCommunication", {}, "-received_date", 500));
  const { data: applications, refetch: refetchApplications } = useCollection("Application", () => listOwnedRecords("Application", {}, "-created_date", 300));
  const [filter, setFilter] = useState("Priority");
  const [scanning, setScanning] = useState(false);
  const applicationById = useMemo(() => Object.fromEntries(applications.map((item) => [item.id, item])), [applications]);
  const open = communications.filter((item) => !["Dismissed", "Handled"].includes(item.review_status));
  const positive = open.filter((item) => POSITIVE.includes(item.communication_type));
  const actionRequired = open.filter((item) => item.requires_action);
  const unmatched = open.filter((item) => !item.application_id || item.confidence < 75);

  const visible = useMemo(() => {
    let list = [...communications];
    if (filter === "Priority") list = list.filter((item) => !["Dismissed", "Handled"].includes(item.review_status) && (item.priority === "Critical" || item.priority === "High"));
    if (filter === "Action Required") list = list.filter((item) => item.requires_action && !["Dismissed", "Handled"].includes(item.review_status));
    if (filter === "Needs Review") list = list.filter((item) => item.review_status === "Needs Review");
    if (filter === "Positive") list = list.filter((item) => POSITIVE.includes(item.communication_type));
    if (filter === "Rejections") list = list.filter((item) => item.communication_type === "Rejection");
    return list.sort((a, b) => rank(a) - rank(b) || new Date(b.received_date || 0) - new Date(a.received_date || 0));
  }, [communications, filter]);

  async function scan() {
    setScanning(true);
    try {
      const response = await base44.functions.invoke("processApplicationEmails", { days: 21 });
      const summary = response.data?.summary;
      await refetch();
      toast.success(summary ? `Found ${summary.captured} application email${summary.captured === 1 ? "" : "s"}; ${summary.positive} positive` : "Application inbox checked");
    } catch (error) { toast.error(error?.response?.data?.error || "Gmail application check failed"); }
    finally { setScanning(false); }
  }

  async function confirm(item, updateStage) {
    try {
      if (updateStage && item.application_id && item.suggested_stage) {
        await updateOwnedRecord("Application", item.application_id, { stage: item.suggested_stage, follow_up_date: item.requires_action ? item.action_due_date || undefined : undefined });
      }
      await updateOwnedRecord("ApplicationCommunication", item.id, { review_status: item.requires_action ? "Confirmed" : "Handled" });
      await Promise.all([refetch(), refetchApplications()]);
      toast.success(updateStage && item.suggested_stage ? `Application moved to ${item.suggested_stage}` : "Email recorded without changing the stage");
    } catch { toast.error("The communication could not be confirmed"); }
  }

  async function setStatus(item, status) { try { await updateOwnedRecord("ApplicationCommunication", item.id, { review_status: status }); await refetch(); toast.success(status === "Dismissed" ? "Email dismissed" : "Action marked handled"); } catch { toast.error("Update failed"); } }

  if (loading) return <Loading label="Loading application emails…" />;
  return <div>
    <PageHeader title="Application Inbox" subtitle="Recruiter replies and feedback, prioritised so positive outcomes are never buried" actions={<button onClick={scan} disabled={scanning} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{scanning ? "Checking Gmail…" : "Check Gmail Now"}</button>} />

    {positive.length > 0 && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-start gap-3"><ThumbsUp className="mt-0.5 h-5 w-5 text-emerald-700" /><div><p className="font-semibold text-emerald-900">{positive.length} positive application update{positive.length === 1 ? "" : "s"}</p><p className="text-sm text-emerald-800">Interview, progression, offer and onboarding messages are pinned above routine acknowledgements and rejections.</p></div></div></div>}

    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><InboxStat label="Positive updates" value={positive.length} tone="green" onClick={() => setFilter("Positive")} /><InboxStat label="Action required" value={actionRequired.length} tone="amber" onClick={() => setFilter("Action Required")} /><InboxStat label="Needs matching" value={unmatched.length} tone="rose" onClick={() => setFilter("Needs Review")} /><InboxStat label="All communications" value={communications.length} tone="blue" onClick={() => setFilter("All")} /></div>
    <div className="mb-4 flex flex-wrap gap-2">{FILTERS.map((item) => <button key={item} onClick={() => setFilter(item)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", filter === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")}>{item}</button>)}</div>

    {visible.length === 0 ? <EmptyState title="No application emails in this view" description="Use Check Gmail Now after applications have been submitted. Recruiter replies will be matched here." /> : <div className="space-y-3">{visible.map((item) => <CommunicationCard key={item.id} item={item} application={applicationById[item.application_id]} onConfirm={(updateStage) => confirm(item, updateStage)} onDismiss={() => setStatus(item, "Dismissed")} onHandled={() => setStatus(item, "Handled")} />)}</div>}
  </div>;
}

function rank(item) { if (item.communication_type === "Offer") return 0; if (item.communication_type === "Interview Invitation") return 1; if (POSITIVE.includes(item.communication_type)) return 2; if (item.requires_action) return 3; if (item.communication_type === "Rejection") return 9; return 5; }
function InboxStat({ label, value, tone, onClick }) { const tones = { green: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700", blue: "text-blue-700" }; return <button onClick={onClick} className="rounded-xl border border-border bg-card p-4 text-left shadow-sm hover:bg-muted/30"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className={cn("mt-1 text-2xl font-semibold", tones[tone])}>{value}</p></button>; }

function CommunicationCard({ item, application, onConfirm, onDismiss, onHandled }) {
  const isPositive = POSITIVE.includes(item.communication_type);
  return <div className={cn("rounded-xl border bg-card p-4 shadow-sm", isPositive ? "border-emerald-300" : item.requires_action ? "border-amber-300" : "border-border")}><div className="flex flex-col gap-3 lg:flex-row lg:items-start"><div className={cn("rounded-lg p-2", isPositive ? "bg-emerald-100 text-emerald-700" : item.communication_type === "Rejection" ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-700")}>{isPositive ? <Sparkles className="h-5 w-5" /> : <Mail className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", isPositive ? "bg-emerald-100 text-emerald-700" : item.requires_action ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>{item.communication_type}</span>{item.priority === "Critical" && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">Priority</span>}<span className="text-xs text-muted-foreground">{item.confidence || 0}% match confidence</span></div><h3 className="mt-2 font-semibold">{item.subject || "Application email"}</h3><p className="mt-1 text-sm text-muted-foreground">{item.summary}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{item.sender}</span><span>{item.received_date ? new Date(item.received_date).toLocaleString("en-GB") : ""}</span>{application ? <Link to={`/jobs/${application.job_id}`} className="font-medium text-primary">{application.job_title} · {application.employer}</Link> : <span className="flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3 w-3" />Application match needs confirmation</span>}</div>{item.requires_action && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>Action:</strong> {item.action_description || "Review and respond"}{item.action_due_date ? ` · Due ${item.action_due_date}` : ""}</div>}{item.suggested_stage && <p className="mt-2 text-sm"><span className="text-muted-foreground">Suggested stage:</span> <strong>{item.suggested_stage}</strong></p>}</div><div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">{application && item.suggested_stage && item.review_status === "Needs Review" && <button onClick={() => onConfirm(true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"><CheckCircle2 className="h-4 w-4" />Confirm & update</button>}{item.review_status === "Needs Review" && <button onClick={() => onConfirm(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium">Keep current stage</button>}{item.review_status === "Confirmed" && item.requires_action && <button onClick={onHandled} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Mark handled</button>}<button onClick={onDismiss} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Dismiss"><X className="h-4 w-4" /></button></div></div></div>;
}

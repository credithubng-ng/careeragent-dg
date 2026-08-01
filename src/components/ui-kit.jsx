import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, accent = "primary" }) {
  const accents = {
    primary: "bg-primary/10 text-primary",
    blue: "bg-blue-500/10 text-blue-600",
    green: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    red: "bg-rose-500/10 text-rose-600",
    violet: "bg-violet-500/10 text-violet-600",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && <div className={cn("rounded-lg p-1.5", accents[accent])}><Icon className="h-4 w-4" /></div>}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

const STATUS_STYLES = {
  "Excellent Match": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Good Match": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Worth Reviewing": "bg-amber-100 text-amber-700 border-amber-200",
  "Possible Match": "bg-slate-100 text-slate-600 border-slate-200",
  "Poor Match": "bg-rose-100 text-rose-700 border-rose-200",
  "Reject": "bg-rose-100 text-rose-700 border-rose-200",
  "Strong Match": "bg-green-100 text-green-700 border-green-200",
  "Weak Match": "bg-orange-100 text-orange-700 border-orange-200",
  "Do Not Apply": "bg-rose-100 text-rose-700 border-rose-200",
  New: "bg-blue-100 text-blue-700 border-blue-200",
  Reviewing: "bg-slate-100 text-slate-700 border-slate-200",
  "High Priority": "bg-violet-100 text-violet-700 border-violet-200",
  Apply: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Maybe: "bg-amber-100 text-amber-700 border-amber-200",
  Skip: "bg-slate-100 text-slate-500 border-slate-200",
  "Preparing Application": "bg-indigo-100 text-indigo-700 border-indigo-200",
  Applied: "bg-blue-100 text-blue-700 border-blue-200",
  Interview: "bg-violet-100 text-violet-700 border-violet-200",
  Offer: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Rejected: "bg-rose-100 text-rose-700 border-rose-200",
  Withdrawn: "bg-slate-100 text-slate-500 border-slate-200",
  Expired: "bg-slate-100 text-slate-500 border-slate-200",
  Active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Draft: "bg-slate-100 text-slate-600 border-slate-200",
  Archived: "bg-slate-100 text-slate-400 border-slate-200",
};

export function StatusBadge({ status, score }) {
  const label = status || (score != null ? "Pending" : "—");
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES[label] || "bg-slate-100 text-slate-600 border-slate-200")}>
      {label}
    </span>
  );
}

export function ScoreBadge({ score, scoring }) {
  if (scoring) return <span className="text-xs text-muted-foreground animate-pulse">AI Scoring…</span>;
  if (score == null) return <span className="text-xs text-muted-foreground">Not scored</span>;
  const band = score >= 90 ? "bg-emerald-700" : score >= 80 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : score >= 50 ? "bg-slate-400" : "bg-rose-500";
  const label = score >= 90 ? "Excellent Match" : score >= 80 ? "Good Match" : score >= 70 ? "Worth Reviewing" : score >= 50 ? "Possible Match" : "Poor Match";
  const labelColor = score >= 90 ? "text-emerald-700" : score >= 80 ? "text-emerald-600" : score >= 70 ? "text-amber-600" : score >= 50 ? "text-slate-500" : "text-rose-600";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 rounded-full bg-slate-100 overflow-hidden">
        <div className={cn("h-full rounded-full", band)} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="text-sm font-semibold text-foreground">{score}%</span>
      <span className={cn("text-xs font-medium", labelColor)}>{label}</span>
    </div>
  );
}

export function SectionCard({ title, description, children, className, actions }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            {title && <h3 className="font-medium text-foreground">{title}</h3>}
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-12 px-6 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <span className="ml-2 text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export function Notice({ children, tone = "amber" }) {
  const tones = {
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    rose: "bg-rose-50 text-rose-800 border-rose-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
  };
  return <div className={cn("rounded-lg border px-4 py-2.5 text-sm", tones[tone])}>{children}</div>;
}
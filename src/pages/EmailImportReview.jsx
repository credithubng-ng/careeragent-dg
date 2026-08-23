import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatusBadge, ScoreBadge } from "@/components/ui-kit";
import { listOwnedRecords, updateOwnedRecord, deleteOwnedRecord } from "@/lib/ownedEntities";
import { todayISO } from "@/lib/format";
import { toast } from "react-hot-toast";
import { ExternalLink, Check, Trash2, AlertCircle, Mail, Clock } from "lucide-react";

const REVIEW_STATUSES = ["Needs Review", "URL Restricted", "Partial", "Failed"];

export default function EmailImportReview() {
  const navigate = useNavigate();
  const { data: jobs, loading, refetch } = useCollection("Job", () =>
    listOwnedRecords("Job", { discovered_from_email: true }, "-created_date", 500)
  );
  const { data: emailImports } = useCollection("EmailImport", () =>
    listOwnedRecords("EmailImport", {}, "-created_date", 200)
  );

  const reviewJobs = (jobs || []).filter((j) => REVIEW_STATUSES.includes(j.email_import_status));

  async function handleApprove(job) {
    try {
      await updateOwnedRecord("Job", job.id, { email_import_status: "Complete" });
      refetch();
      toast.success("Job approved and moved to Jobs page");
    } catch {
      toast.error("Failed to approve job");
    }
  }

  async function handleReject(job) {
    try {
      await deleteOwnedRecord("Job", job.id);
      refetch();
      toast.success("Job rejected and removed");
    } catch {
      toast.error("Failed to reject job");
    }
  }

  if (loading) return <Loading label="Loading review queue…" />;

  return (
    <div>
      <PageHeader
        title="Email Import Review"
        subtitle="Vacancies from job-alert emails that need your review before matching"
      />

      {/* Email processing log */}
      {emailImports && emailImports.length > 0 && (
        <SectionCard title="Recent Email Processing" className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Source</th>
                  <th className="pb-2 pr-3 font-medium">Subject</th>
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">Detected</th>
                  <th className="pb-2 pr-3 font-medium">Imported</th>
                  <th className="pb-2 pr-3 font-medium">Dupes</th>
                  <th className="pb-2 pr-3 font-medium">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {emailImports.slice(0, 10).map((ei) => (
                  <tr key={ei.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 font-medium text-foreground">
                      {ei.source || "—"}
                      {ei.sender_trust === "Unrecognised" && <span className="ml-1 text-xs text-amber-700">New sender</span>}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground max-w-xs truncate">{ei.subject || "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{ei.received_date ? new Date(ei.received_date).toLocaleDateString("en-GB") : "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                        ei.processing_status === "Completed" ? "bg-emerald-100 text-emerald-700" :
                        ei.processing_status === "Failed" ? "bg-rose-100 text-rose-700" :
                        ei.processing_status === "Needs Review" ? "bg-amber-100 text-amber-700" :
                        ei.processing_status === "Skipped" ? "bg-slate-100 text-slate-500" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {ei.processing_status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{ei.jobs_detected || 0}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{ei.jobs_imported || 0}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{ei.duplicates_skipped || 0}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{ei.jobs_rejected || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Review queue */}
      {reviewJobs.length === 0 ? (
        <EmptyState
          title="No jobs need review"
          description="All email-imported vacancies have been reviewed. New imports from job-alert emails will appear here."
        />
      ) : (
        <div className="space-y-3">
          {reviewJobs.map((job) => (
            <ReviewJobCard key={job.id} job={job} onApprove={handleApprove} onReject={handleReject} onOpen={() => navigate(`/jobs/${job.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewJobCard({ job, onApprove, onReject, onOpen }) {
  const statusColors = {
    "Needs Review": "bg-amber-100 text-amber-700 border-amber-200",
    "URL Restricted": "bg-rose-100 text-rose-700 border-rose-200",
    "Partial": "bg-blue-100 text-blue-700 border-blue-200",
    "Failed": "bg-rose-100 text-rose-700 border-rose-200",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-foreground">{job.job_title || "Untitled role"}</h3>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusColors[job.email_import_status] || "bg-slate-100 text-slate-600"}`}>
              {job.email_import_status}
            </span>
            {job.relevance_tier && (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                job.relevance_tier === "Relevant" ? "bg-emerald-100 text-emerald-700" :
                job.relevance_tier === "Possibly Relevant" ? "bg-amber-100 text-amber-700" :
                "bg-slate-100 text-slate-500"
              }`}>
                {job.relevance_tier}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {job.employer || "Unknown employer"} {job.location && `· ${job.location}`}
            {job.salary_description && `· ${job.salary_description}`}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" /> {job.email_source || "Email"}
            </span>
            {job.closing_date && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Closes {job.closing_date}
              </span>
            )}
          </div>
          {job.job_description && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{job.job_description}</p>
          )}
          {job.original_job_url && (
            <a
              href={job.original_job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Open original URL
            </a>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => onOpen()}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Review Job
          </button>
          <button
            onClick={() => onApprove(job)}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-700"
          >
            <Check className="h-4 w-4" /> Approve
          </button>
          <button
            onClick={() => onReject(job)}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 text-rose-700 px-3 py-1.5 text-sm font-medium hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" /> Reject
          </button>
        </div>
      </div>
    </div>
  );
}

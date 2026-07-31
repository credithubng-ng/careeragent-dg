import React from "react";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

export default function DuplicateJobDialog({ duplicate, onOpenExisting, onUpdateExisting, onSaveNew }) {
  if (!duplicate) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-foreground">This opportunity already exists.</h3>
        <p className="text-sm text-muted-foreground mt-1">
          A job with matching details was found in your account.
        </p>
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
          <p className="font-medium text-foreground">{duplicate.job_title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {duplicate.employer || duplicate.recruitment_agency}
            {duplicate.location ? ` · ${duplicate.location}` : ""}
          </p>
          {duplicate.original_job_url && (
            <a
              href={duplicate.original_job_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> {duplicate.original_job_url}
            </a>
          )}
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onOpenExisting}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Open Existing
          </button>
          <button
            onClick={onUpdateExisting}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Update Existing
          </button>
          <button
            onClick={onSaveNew}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            Save as New Version
          </button>
        </div>
      </div>
    </div>
  );
}
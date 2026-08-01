import React, { useEffect, useState } from "react";
import { listOwnedRecords } from "@/lib/ownedEntities";
import { ukDate } from "@/lib/format";
import { Loading, EmptyState } from "@/components/ui-kit";
import { History } from "lucide-react";

/**
 * Displays the source correction history for a job, including version numbers,
 * edit methods, changed fields, and correction reasons.
 */
export default function SourceHistoryPanel({ jobId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const records = await listOwnedRecords("JobSourceHistory", { job_id: jobId }, "-edit_date", 20);
        setHistory(records);
      } catch {
        setHistory([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  if (loading) return <Loading label="Loading source history…" />;
  if (history.length === 0) {
    return (
      <EmptyState
        title="No corrections recorded"
        description="When you edit or re-extract this job, the changes will appear here with the reason, changed fields, and previous values."
      />
    );
  }

  return (
    <div className="space-y-3">
      {history.map((record) => (
        <div key={record.id} className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                Version {record.version_number}
              </span>
              <span className="text-xs text-muted-foreground">
                · {record.edit_method}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {ukDate(record.edit_date)}
            </span>
          </div>
          {record.reason_for_correction && (
            <p className="text-sm text-foreground mb-1">
              <span className="text-muted-foreground">Reason:</span> {record.reason_for_correction}
            </p>
          )}
          {record.correction_notes && (
            <p className="text-sm text-muted-foreground italic mb-2">{record.correction_notes}</p>
          )}
          {record.fields_changed?.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">Fields changed:</p>
              <div className="flex flex-wrap gap-1.5">
                {record.fields_changed.map((f) => (
                  <span key={f} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {f.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}
          {record.previous_url && record.new_url && record.previous_url !== record.new_url && (
            <p className="text-xs text-muted-foreground mt-2">
              URL changed: {record.previous_url} → {record.new_url}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { SectionCard, Loading, EmptyState } from "@/components/ui-kit";
import { ukDate } from "@/lib/format";
import { ExternalLink, GitBranch, AlertCircle, RefreshCw } from "lucide-react";

export default function GitHubIssues() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("syncGitHubIssues", {});
      setData(res.data);
    } catch (e) {
      setError(e?.message || "Failed to load issues");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIssues(); }, []);

  return (
    <SectionCard
      title="Project Issues"
      description={data?.repo ? `Open issues from ${data.repo}` : "Synced from GitHub"}
      actions={
        <button onClick={fetchIssues} disabled={loading} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      {loading ? (
        <Loading label="Loading issues…" />
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-rose-600">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      ) : !data?.issues?.length ? (
        <EmptyState title="No open issues" description="Open issues from your GitHub repo will appear here." />
      ) : (
        <ul className="divide-y divide-border">
          {data.issues.map((i) => (
            <li key={i.id} className="py-2.5 flex items-start gap-3">
              <GitBranch className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <a href={i.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-foreground hover:underline inline-flex items-center gap-1">
                  {i.title} <ExternalLink className="h-3 w-3" />
                </a>
                <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1">
                  <span>#{i.number}</span>
                  <span>·</span>
                  <span>{i.repo}</span>
                  <span>·</span>
                  <span>updated {ukDate(i.updated_at)}</span>
                </p>
                {i.labels?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {i.labels.map((l) => (
                      <span key={l} className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{l}</span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
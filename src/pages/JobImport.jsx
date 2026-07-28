import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading } from "@/components/ui-kit";
import { extractJobFromText } from "@/lib/careerAI";
import { todayISO } from "@/lib/format";
import { Sparkles, Save, ArrowLeft, FileText } from "lucide-react";
import { toast } from "react-hot-toast";
import { createOwnedRecord } from "@/lib/ownedEntities";

export default function JobImport() {
  const navigate = useNavigate();
  const { data: candidates } = useCollection("Candidate", () => base44.entities.Candidate.list());
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [review, setReview] = useState(null);

  async function extract() {
    if (!text.trim()) { toast.error("Paste a job description first"); return; }
    setExtracting(true);
    const t = toast.loading("Extracting job details with AI…");
    try {
      const result = await extractJobFromText(text);
      setReview({ ...result, date_discovered: todayISO(), currency: result.currency || "GBP", job_status: "New" });
      toast.success("Extraction complete — review and save", { id: t });
    } catch (e) {
      toast.error("Extraction failed", { id: t });
    } finally { setExtracting(false); }
  }

  async function save() {
    try {
      const candidate = candidates[0];
      await createOwnedRecord("Job", { ...review, candidate_id: candidate?.id });
      toast.success("Job saved");
      navigate("/jobs");
    } catch (e) { toast.error("Failed to save job"); }
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4" /> Back</button>
      <PageHeader title="Quick Import" subtitle="Paste a full job description and AI will extract the key fields for review" />

      {!review ? (
        <SectionCard title="Paste Job Description">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the entire job advert here…" className="w-full min-h-[320px] rounded-lg border border-input bg-card p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <div className="flex justify-end mt-4">
            <button onClick={extract} disabled={extracting} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"><Sparkles className="h-4 w-4" /> {extracting ? "Extracting…" : "Extract with AI"}</button>
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-6">
          <SectionCard title="Review Extracted Details" description="Check the AI-extracted fields before saving. Edit anything that looks wrong.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(review).filter(([k]) => !["job_description"].includes(k)).map(([k, v]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1 capitalize">{k.replace(/_/g, " ")}</label>
                  <input value={v ?? ""} onChange={(e) => setReview({ ...review, [k]: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              ))}
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Job description</label>
              <textarea value={review.job_description || ""} onChange={(e) => setReview({ ...review, job_description: e.target.value })} className="w-full min-h-[200px] rounded-lg border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </SectionCard>
          <div className="flex justify-end gap-2">
            <button onClick={() => setReview(null)} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">Re-extract</button>
            <button onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"><Save className="h-4 w-4" /> Save Job</button>
          </div>
        </div>
      )}
    </div>
  );
}

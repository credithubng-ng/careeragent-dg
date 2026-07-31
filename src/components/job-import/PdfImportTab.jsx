import React, { useState } from "react";
import { validateJobFile, importJobFromPdf } from "@/lib/jobUrlImport";
import { SectionCard } from "@/components/ui-kit";
import { Sparkles, Loader2, Upload, FileText } from "lucide-react";

const PROGRESS_LABELS = {
  upload: "Uploading document…",
  extract: "Reading content…",
  ai: "Extracting details with AI…",
};

export default function PdfImportTab({ onExtracted }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [error, setError] = useState("");

  function handleFileChange(e) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setError("");
    const validationError = validateJobFile(selected);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }
    setFile(selected);
  }

  async function handleExtract() {
    if (!file) return;
    setLoading(true);
    setError("");
    setProgressStep("upload");
    try {
      const data = await importJobFromPdf(file, (step) => setProgressStep(step));
      onExtracted(data, "PDF", "AI PDF Extract");
    } catch (err) {
      setError(err?.message || "Unable to extract from this file.");
      setProgressStep("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard title="Upload PDF" description="Upload a job description as a PDF or DOCX and AI will extract the details.">
      <div className="space-y-4">
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/60 hover:bg-muted/40">
          {loading ? (
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          ) : file ? (
            <FileText className="h-7 w-7 text-primary" />
          ) : (
            <Upload className="h-7 w-7 text-primary" />
          )}
          <span className="mt-2 text-sm font-medium text-foreground">
            {loading ? PROGRESS_LABELS[progressStep] || "Processing…" : file ? file.name : "Choose a PDF or DOCX file"}
          </span>
          {!file && !loading && (
            <span className="mt-1 text-xs text-muted-foreground">PDF or DOCX, up to 10 MB</span>
          )}
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={loading}
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>

        {error && (
          <p className="text-sm text-rose-600">{error}</p>
        )}

        {file && !loading && (
          <div className="flex justify-end">
            <button
              onClick={handleExtract}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" /> Extract with AI
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
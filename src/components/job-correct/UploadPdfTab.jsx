import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { extractJobFromText } from "@/lib/careerAI";
import { validateJobFile } from "@/lib/jobUrlImport";
import { extractDocxText } from "@/lib/docxExtract";
import ComparisonView from "./ComparisonView";
import { Loader2, Upload, AlertTriangle, FileText } from "lucide-react";

const PDF_TEXT_SCHEMA = { type: "object", properties: { text: { type: "string" } } };

/**
 * Upload a replacement PDF or DOCX file.
 * Extracts the content and compares it with the current job.
 * Does not overwrite the current job automatically.
 */
export default function UploadPdfTab({ currentJob, onExtracted, decisions, onDecisionsChange }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [extracted, setExtracted] = useState(null);
  const [rawText, setRawText] = useState("");
  const fileInputRef = useRef(null);

  function handleFileSelect(e) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const validationError = validateJobFile(selected);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }
    setError("");
    setFile(selected);
    setExtracted(null);
  }

  async function handleExtract() {
    if (!file) { setError("Choose a PDF or DOCX file first."); return; }
    setError("");
    setLoading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let text = "";
      if (ext === "docx") {
        text = await extractDocxText(file);
      } else {
        const upload = await base44.integrations.Core.UploadFile({ file });
        if (!upload?.file_url) throw new Error("The document could not be uploaded.");
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url: upload.file_url,
          json_schema: PDF_TEXT_SCHEMA,
        });
        text = result?.output?.text || result?.text || "";
      }
      if (!text?.trim()) throw new Error("No text could be read from this file.");
      if (text.length > 15000) text = text.slice(0, 15000);
      setRawText(text);

      const jobData = await extractJobFromText(text);
      // Preserve original URL
      if (!jobData.original_job_url && currentJob.original_job_url) {
        jobData.original_job_url = currentJob.original_job_url;
      }
      setExtracted(jobData);
      onExtracted(jobData, {
        editMethod: "PDF Replacement",
        newSourceType: "PDF Upload",
        newUrl: jobData.original_job_url || currentJob.original_job_url || "",
        extractionStatus: "Success",
        extractionConfidence: jobData.extraction_confidence || "Medium",
        rawExtractedText: text,
      });
    } catch (e) {
      setError(e?.message || "Unable to extract job details from the file. Try pasting the description instead.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Replacement PDF or DOCX file
        </label>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileSelect}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
          />
          {file && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" /> {file.name}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Upload a replacement job advert. The content will be extracted and compared with the current job.
        </p>
      </div>

      <button
        onClick={handleExtract}
        disabled={loading || !file}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {loading ? "Extracting…" : "Extract & Compare"}
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {extracted && (
        <ComparisonView
          currentJob={currentJob}
          newJob={extracted}
          decisions={decisions}
          onDecisionsChange={onDecisionsChange}
        />
      )}
    </div>
  );
}
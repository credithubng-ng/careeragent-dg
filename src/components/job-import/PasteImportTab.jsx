import React, { useState } from "react";
import { extractJobFromText } from "@/lib/careerAI";
import { SectionCard } from "@/components/ui-kit";
import { Sparkles, Loader2 } from "lucide-react";

const MAX_JOB_TEXT = 15000;

export default function PasteImportTab({ onExtracted, initialText }) {
  const [text, setText] = useState(initialText || "");
  const [extracting, setExtracting] = useState(false);

  async function handleExtract() {
    if (!text.trim()) return;
    if (text.trim().length < 100) return;
    if (text.trim().length > MAX_JOB_TEXT) return;
    setExtracting(true);
    try {
      const result = await extractJobFromText(text);
      onExtracted(
        { ...result, job_description: text.trim() },
        "Paste",
        "AI Text Extract"
      );
    } catch {
      setExtracting(false);
    } finally {
      setExtracting(false);
    }
  }

  const tooShort = text.trim().length > 0 && text.trim().length < 100;
  const tooLong = text.trim().length > MAX_JOB_TEXT;

  return (
    <SectionCard title="Paste Job Description" description="Paste the entire job advert and AI will extract the key fields for review.">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the entire job advert here…"
        className="w-full min-h-[320px] rounded-lg border border-input bg-card p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        disabled={extracting}
      />
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {tooShort && <span className="text-amber-600">Add more text — at least 100 characters for reliable extraction.</span>}
          {tooLong && <span className="text-rose-600">Text is too long (max {MAX_JOB_TEXT.toLocaleString()} characters). Trim and try again.</span>}
        </span>
        <span>{text.trim().length.toLocaleString()} chars</span>
      </div>
      <div className="flex justify-end mt-4">
        <button
          onClick={handleExtract}
          disabled={extracting || !text.trim() || tooShort || tooLong}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {extracting ? "Extracting…" : "Extract with AI"}
        </button>
      </div>
    </SectionCard>
  );
}
import React, { useState } from "react";
import { CORRECTION_REASONS } from "@/lib/jobCorrection";
import { X } from "lucide-react";

/**
 * Modal dialog for selecting a correction reason and optional notes.
 * Required before saving major changes.
 */
export default function CorrectionReasonDialog({ open, onConfirm, onCancel, editMethod }) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  function handleConfirm() {
    if (!reason) {
      setError("Please select a reason for this correction.");
      return;
    }
    onConfirm(reason, notes);
    setReason("");
    setNotes("");
    setError("");
  }

  function handleCancel() {
    setReason("");
    setNotes("");
    setError("");
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-medium text-foreground">Confirm Correction</h3>
          <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Reason for correction <span className="text-rose-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(""); }}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a reason…</option>
              {CORRECTION_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Additional notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Explain what was wrong and what you corrected…"
              className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <p className="text-xs text-muted-foreground">
            This correction will be recorded in the job's source history with the reason, changed fields, and previous values for audit purposes.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={handleCancel}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            Confirm & Save
          </button>
        </div>
      </div>
    </div>
  );
}
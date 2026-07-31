import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, Circle } from "lucide-react";

export default function ImportProgress({ steps, currentIndex, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-foreground mb-4">Processing</h3>
        <ol className="space-y-3">
          {steps.map((label, index) => {
            const isDone = index < currentIndex;
            const isActive = index === currentIndex;
            return (
              <li key={label} className="flex items-center gap-3">
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                ) : isActive ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                )}
                <span className={cn(
                  "text-sm",
                  isDone ? "text-muted-foreground line-through" : isActive ? "font-medium text-foreground" : "text-muted-foreground/60"
                )}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
        {onCancel && currentIndex < steps.length - 1 && (
          <div className="mt-5 flex justify-end">
            <button onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
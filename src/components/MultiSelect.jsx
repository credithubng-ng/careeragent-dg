import React from "react";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

export default function MultiSelect({ options, value, onChange, max = 10, placeholder = "Select options" }) {
  const selected = Array.isArray(value)
    ? value
    : typeof value === "string" && value
      ? value.split(", ").filter(Boolean)
      : [];

  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter((s) => s !== opt));
    else if (selected.length < max) onChange([...selected, opt]);
  };

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {s}
              <button type="button" onClick={() => toggle(s)} aria-label={`Remove ${s}`}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="max-h-44 overflow-y-auto rounded-lg border border-input bg-card p-2">
        <div className="flex items-center justify-between px-1 pb-1 text-xs text-muted-foreground">
          <span>{placeholder}</span>
          <span>{selected.length}/{max}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {options.map((opt) => {
            const active = selected.includes(opt);
            const disabled = !active && selected.length >= max;
            return (
              <button
                type="button"
                key={opt}
                onClick={() => toggle(opt)}
                disabled={disabled}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  active ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
                  disabled && "opacity-40 cursor-not-allowed"
                )}
              >
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", active ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                  {active && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
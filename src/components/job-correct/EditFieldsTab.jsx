import React from "react";
import { EDITABLE_FIELD_SECTIONS } from "@/lib/jobCorrection";

/**
 * Manual field editing tab. Renders all editable fields grouped by section.
 * Only changed fields are included in the save payload.
 */
export default function EditFieldsTab({ form, onFormChange }) {
  return (
    <div className="space-y-6">
      {EDITABLE_FIELD_SECTIONS.map((sec) => (
        <div key={sec.section}>
          <h3 className="text-sm font-semibold text-foreground mb-3">{sec.section}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sec.fields.map((f) => {
              const [name, label, type, options] = f;
              const isLong = type === "textarea";
              const required = f[3] === true;
              return (
                <div key={name} className={isLong ? "md:col-span-2" : ""}>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {label}
                    {required && <span className="text-rose-500"> *</span>}
                    {(name === "employer" || name === "recruitment_agency") && (
                      <span className="text-muted-foreground"> (one required)</span>
                    )}
                  </label>
                  {type === "textarea" ? (
                    <textarea
                      value={form[name] || ""}
                      onChange={(e) => onFormChange(name, e.target.value)}
                      className="w-full min-h-[100px] rounded-lg border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  ) : type === "select" ? (
                    <select
                      value={form[name] || ""}
                      onChange={(e) => onFormChange(name, e.target.value)}
                      className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {options.map((o) => (
                        <option key={o} value={o}>{o || "—"}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={type}
                      min={type === "number" ? "0" : undefined}
                      value={form[name] || ""}
                      onChange={(e) => onFormChange(name, e.target.value)}
                      className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
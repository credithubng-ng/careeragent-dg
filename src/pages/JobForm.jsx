import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading } from "@/components/ui-kit";
import { todayISO } from "@/lib/format";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "react-hot-toast";
import { createOwnedRecord } from "@/lib/ownedEntities";

const FIELDS = [
  { section: "Basic", fields: [
    ["job_title", "Job title", "text", true], ["employer", "Employer", "text"], ["recruitment_agency", "Recruitment agency", "text"],
    ["job_source_name", "Source name", "text"], ["job_reference", "Reference", "text"], ["original_job_url", "Original URL", "text"],
  ]},
  { section: "Dates", fields: [
    ["date_discovered", "Date discovered", "date"], ["date_posted", "Date posted", "date"], ["closing_date", "Closing date", "date"],
  ]},
  { section: "Role", fields: [
    ["employment_type", "Employment type", "select", ["", "Permanent", "Contract", "Interim", "Fixed Term", "Part-time"]],
    ["contract_length", "Contract length", "text"], ["location", "Location", "text"], ["country", "Country", "text"],
    ["work_arrangement", "Working pattern", "select", ["", "Remote", "Hybrid", "Office", "Unspecified"]],
    ["sector", "Sector", "text"],
  ]},
  { section: "Salary", fields: [
    ["salary_min", "Salary min", "number"], ["salary_max", "Salary max", "number"], ["salary_description", "Salary description", "text"], ["currency", "Currency", "text"],
  ]},
  { section: "Requirements", fields: [
    ["required_years_experience", "Years experience required", "number"], ["required_qualifications", "Qualifications", "textarea"],
    ["required_certifications", "Certifications", "textarea"], ["required_technologies", "Technologies", "textarea"],
    ["required_sector_experience", "Sector experience", "textarea"], ["right_to_work_requirements", "Right to work", "textarea"],
    ["security_clearance_requirement", "Security clearance", "textarea"],
  ]},
  { section: "Description", fields: [
    ["job_description", "Job description", "textarea"], ["responsibilities", "Responsibilities", "textarea"],
    ["essential_requirements", "Essential requirements", "textarea"], ["desirable_requirements", "Desirable requirements", "textarea"],
  ]},
  { section: "Contact", fields: [
    ["contact_person", "Contact person", "text"], ["contact_email", "Contact email", "text"], ["recruiter_linkedin_url", "Recruiter LinkedIn", "text"],
  ]},
];

export default function JobForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [form, setForm] = useState({ date_discovered: todayISO(), currency: "GBP", job_status: "New" });
  const [loading, setLoading] = useState(editing);
  const { data: candidates } = useCollection("Candidate", () => base44.entities.Candidate.list());

  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const j = await base44.entities.Job.get(id);
        setForm(j);
      } finally { setLoading(false); }
    })();
  }, [id]);

  async function save(e) {
    e.preventDefault();
    try {
      const candidate = candidates[0];
      const payload = { ...form, candidate_id: candidate?.id };
      if (editing) {
        await base44.entities.Job.update(id, payload);
        toast.success("Job updated");
      } else {
        await createOwnedRecord("Job", payload);
        toast.success("Job added");
      }
      navigate("/jobs");
    } catch (err) { toast.error("Failed to save job"); }
  }

  if (loading) return <Loading />;

  return (
    <div>
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4" /> Back</button>
      <PageHeader title={editing ? "Edit Job" : "Add Job"} subtitle="Enter the job details manually" />
      <form onSubmit={save} className="space-y-6">
        {FIELDS.map((sec) => (
          <SectionCard key={sec.section} title={sec.section}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sec.fields.map((f) => {
                const [name, label, type, options] = f;
                return (
                  <div key={name} className={type === "textarea" ? "md:col-span-2" : ""}>
                    <label className="block text-sm font-medium text-foreground mb-1">{label}{f[3] === true && <span className="text-rose-500"> *</span>}</label>
                    {type === "textarea" ? (
                      <textarea value={form[name] || ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} className="w-full min-h-[100px] rounded-lg border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    ) : type === "select" ? (
                      <select value={form[name] || ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        {options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                      </select>
                    ) : (
                      <input type={type} value={form[name] || ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate("/jobs")} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"><Save className="h-4 w-4" /> {editing ? "Update Job" : "Add Job"}</button>
        </div>
      </form>
    </div>
  );
}

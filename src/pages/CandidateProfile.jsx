import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState } from "@/components/ui-kit";
import { Save, Plus, Trash2, X, User } from "lucide-react";
import { toast } from "react-hot-toast";
import { createOwnedRecord } from "@/lib/ownedEntities";

const SKILL_CATEGORIES = ["Data Governance", "Data Quality", "Data Strategy", "Data Management", "Metadata", "Data Lineage", "Data Stewardship", "Master Data Management", "Regulatory Compliance", "Risk and Controls", "Privacy", "Technology Platforms", "Leadership", "Stakeholder Management", "Programme Management", "Sector Knowledge"];
const RIGHT_TO_WORK = ["UK Citizen", "UK ILR/Settled", "UK Visa Sponsorship Required", "EU Right to Work", "Other"];

export default function CandidateProfile() {
  const { data: candidates, loading, refetch } = useCollection("Candidate", () => base44.entities.Candidate.list());
  const { data: cvs } = useCollection("CV", () => base44.entities.CV.list("-created_date", 50));
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function initBlank() {
      let full_name = "";
      let email = "";
      try {
        const me = await base44.auth.me();
        full_name = me?.full_name || "";
        email = me?.email || "";
      } catch {
        /* ignore */
      }
      // Seed from the most relevant CV (master if present, otherwise most recent)
      const cv = cvs.find((c) => c.is_master && c.processing_status === "Ready") || cvs.find((c) => c.processing_status === "Ready") || null;
      const skills = (cv?.key_skills || []).map((name) => ({ name, category: "Data Governance", proficiency: 3, years: 1, essential: false }));
      const preferred_job_titles = cv?.primary_target_role ? cv.primary_target_role.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const preferred_industries = cv?.primary_target_industry ? cv.primary_target_industry.split(",").map((s) => s.trim()).filter(Boolean) : [];
      if (cancelled) return;
      setForm({
        full_name,
        email,
        executive_profile: cv?.professional_summary || "",
        career_achievements: (cv?.key_achievements || []).join("\n"),
        skills,
        certifications: [],
        education: [],
        employment_history: [],
        preferred_job_titles,
        alternative_job_titles: [],
        excluded_job_titles: [],
        preferred_locations: [],
        preferred_industries,
        excluded_industries: [],
      });
    }
    if (candidates.length) setForm(candidates[0]);
    else initBlank();
    return () => { cancelled = true; };
  }, [candidates, cvs]);

  function set(field, value) { setForm({ ...form, [field]: value }); }
  function setArr(field, value) { setForm({ ...form, [field]: value.split("\n").filter(Boolean) }); }

  function arrayItem(field, item) { setForm({ ...form, [field]: [...(form[field] || []), item] }); }
  function removeArrayItem(field, idx) { setForm({ ...form, [field]: form[field].filter((_, i) => i !== idx) }); }

  async function save() {
    setSaving(true);
    try {
      if (form.id) await base44.entities.Candidate.update(form.id, form);
      else await createOwnedRecord("Candidate", form);
      toast.success("Profile saved");
      refetch();
    } catch { toast.error("Failed to save profile"); }
    finally { setSaving(false); }
  }

  if (loading || !form) return <Loading />;

  return (
    <div>
      <PageHeader title="Candidate Profile" subtitle="Your professional profile powers match analysis and content generation"
        actions={<button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Profile"}</button>} />

      <div className="space-y-6">
        <SectionCard title="Personal Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Full name" value={form.full_name} onChange={(v) => set("full_name", v)} />
            <Input label="Email" value={form.email || ""} onChange={(v) => set("email", v)} />
            <Input label="Telephone" value={form.telephone || ""} onChange={(v) => set("telephone", v)} />
            <Input label="Current location" value={form.current_location || ""} onChange={(v) => set("current_location", v)} />
            <Input label="LinkedIn URL" value={form.linkedin_url || ""} onChange={(v) => set("linkedin_url", v)} />
            <Select label="Right-to-work status" value={form.right_to_work || ""} options={RIGHT_TO_WORK} onChange={(v) => set("right_to_work", v)} />
            <Select label="Preferred contact method" value={form.preferred_contact_method || ""} options={["", "Email", "Phone", "LinkedIn"]} onChange={(v) => set("preferred_contact_method", v)} />
          </div>
        </SectionCard>

        <SectionCard title="Current Professional Position">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Current job title" value={form.current_job_title || ""} onChange={(v) => set("current_job_title", v)} />
            <Input label="Current employer" value={form.current_employer || ""} onChange={(v) => set("current_employer", v)} />
            <Input label="Years total experience" type="number" value={form.years_total_experience ?? ""} onChange={(v) => set("years_total_experience", Number(v))} />
            <Input label="Years leadership experience" type="number" value={form.years_leadership ?? ""} onChange={(v) => set("years_leadership", Number(v))} />
            <Input label="Years Data Governance experience" type="number" value={form.years_data_governance ?? ""} onChange={(v) => set("years_data_governance", Number(v))} />
            <Input label="Current industry" value={form.current_industry || ""} onChange={(v) => set("current_industry", v)} />
            <Input label="Current salary" type="number" value={form.current_salary ?? ""} onChange={(v) => set("current_salary", Number(v))} />
            <Input label="Notice period" value={form.notice_period || ""} onChange={(v) => set("notice_period", v)} />
            <Select label="Employment status" value={form.current_employment_status || ""} options={["", "Employed", "Noticed", "Contract Ending", "Available Immediately", "Unemployed"]} onChange={(v) => set("current_employment_status", v)} />
          </div>
        </SectionCard>

        <SectionCard title="Target Role Preferences">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextArea label="Preferred job titles (one per line)" value={(form.preferred_job_titles || []).join("\n")} onChange={(v) => setArr("preferred_job_titles", v)} />
            <TextArea label="Acceptable alternative titles (one per line)" value={(form.alternative_job_titles || []).join("\n")} onChange={(v) => setArr("alternative_job_titles", v)} />
            <TextArea label="Excluded job titles (one per line)" value={(form.excluded_job_titles || []).join("\n")} onChange={(v) => setArr("excluded_job_titles", v)} />
            <Input label="Minimum salary" type="number" value={form.min_salary ?? ""} onChange={(v) => set("min_salary", Number(v))} />
            <Input label="Preferred salary" type="number" value={form.preferred_salary ?? ""} onChange={(v) => set("preferred_salary", Number(v))} />
            <Select label="Employment type" value={form.employment_type_preference || ""} options={["", "Permanent", "Contract", "Interim", "Open to All"]} onChange={(v) => set("employment_type_preference", v)} />
            <Select label="Working pattern" value={form.working_pattern_preference || ""} options={["", "Full-time", "Part-time", "Flexible"]} onChange={(v) => set("working_pattern_preference", v)} />
            <TextArea label="Preferred locations (one per line)" value={(form.preferred_locations || []).join("\n")} onChange={(v) => setArr("preferred_locations", v)} />
            <Input label="Max commuting distance (miles)" type="number" value={form.max_commute_distance ?? ""} onChange={(v) => set("max_commute_distance", Number(v))} />
            <Select label="Work arrangement" value={form.work_arrangement_preference || ""} options={["", "Remote", "Hybrid", "Office", "Open"]} onChange={(v) => set("work_arrangement_preference", v)} />
            <Select label="Region preference" value={form.region_preference || ""} options={["", "UK Only", "Europe", "Global Remote"]} onChange={(v) => set("region_preference", v)} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.willing_to_travel || false} onChange={(e) => set("willing_to_travel", e.target.checked)} /> Willing to travel</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.willing_to_relocate || false} onChange={(e) => set("willing_to_relocate", e.target.checked)} /> Willing to relocate</label>
            <TextArea label="Preferred industries (one per line)" value={(form.preferred_industries || []).join("\n")} onChange={(v) => setArr("preferred_industries", v)} />
            <TextArea label="Excluded industries (one per line)" value={(form.excluded_industries || []).join("\n")} onChange={(v) => setArr("excluded_industries", v)} />
            <TextArea label="Deal breakers" value={form.deal_breakers || ""} onChange={(v) => set("deal_breakers", v)} />
          </div>
        </SectionCard>

        <SectionCard title="Professional Summary">
          <div className="grid grid-cols-1 gap-4">
            <TextArea label="Executive profile" value={form.executive_profile || ""} onChange={(v) => set("executive_profile", v)} />
            <TextArea label="Career achievements" value={form.career_achievements || ""} onChange={(v) => set("career_achievements", v)} />
            <TextArea label="Leadership experience" value={form.leadership_experience || ""} onChange={(v) => set("leadership_experience", v)} />
            <TextArea label="Regulatory experience" value={form.regulatory_experience || ""} onChange={(v) => set("regulatory_experience", v)} />
            <TextArea label="Transformation experience" value={form.transformation_experience || ""} onChange={(v) => set("transformation_experience", v)} />
            <TextArea label="Stakeholder-management experience" value={form.stakeholder_management_experience || ""} onChange={(v) => set("stakeholder_management_experience", v)} />
            <TextArea label="Team-management experience" value={form.team_management_experience || ""} onChange={(v) => set("team_management_experience", v)} />
            <TextArea label="Budget-management experience" value={form.budget_management_experience || ""} onChange={(v) => set("budget_management_experience", v)} />
          </div>
        </SectionCard>

        <SectionCard title="Skills & Expertise" actions={<button onClick={() => arrayItem("skills", { name: "", category: "Data Governance", proficiency: 3, years: 1, essential: false })} className="inline-flex items-center gap-1 text-sm font-medium text-primary"><Plus className="h-4 w-4" /> Add skill</button>}>
          {(form.skills || []).length === 0 ? <p className="text-sm text-muted-foreground">No skills added.</p> : (
            <div className="space-y-3">
              {form.skills.map((s, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-7 gap-2 items-end border-b border-border pb-3">
                  <input placeholder="Skill name" value={s.name} onChange={(e) => { const arr = [...form.skills]; arr[i] = { ...s, name: e.target.value }; set("skills", arr); }} className="md:col-span-2 rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                  <select value={s.category} onChange={(e) => { const arr = [...form.skills]; arr[i] = { ...s, category: e.target.value }; set("skills", arr); }} className="rounded-lg border border-input bg-card px-2 py-2 text-sm">{SKILL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                  <select value={s.proficiency} onChange={(e) => { const arr = [...form.skills]; arr[i] = { ...s, proficiency: Number(e.target.value) }; set("skills", arr); }} className="rounded-lg border border-input bg-card px-2 py-2 text-sm">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}</select>
                  <input type="number" placeholder="Years" value={s.years ?? ""} onChange={(e) => { const arr = [...form.skills]; arr[i] = { ...s, years: Number(e.target.value) }; set("skills", arr); }} className="rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={s.essential || false} onChange={(e) => { const arr = [...form.skills]; arr[i] = { ...s, essential: e.target.checked }; set("skills", arr); }} /> Essential</label>
                  <button onClick={() => removeArrayItem("skills", i)} className="text-rose-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Certifications & Education" actions={<div className="flex gap-2"><button onClick={() => arrayItem("certifications", { qualification: "", institution: "", date_completed: "" })} className="inline-flex items-center gap-1 text-sm font-medium text-primary"><Plus className="h-4 w-4" /> Certification</button><button onClick={() => arrayItem("education", { qualification: "", institution: "", date_completed: "" })} className="inline-flex items-center gap-1 text-sm font-medium text-primary"><Plus className="h-4 w-4" /> Education</button></div>}>
          <div className="space-y-2 mb-4">
            {(form.certifications || []).map((c, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 border-b border-border pb-2">
                <input placeholder="Qualification" value={c.qualification} onChange={(e) => { const arr = [...form.certifications]; arr[i] = { ...c, qualification: e.target.value }; set("certifications", arr); }} className="md:col-span-2 rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                <input placeholder="Institution" value={c.institution} onChange={(e) => { const arr = [...form.certifications]; arr[i] = { ...c, institution: e.target.value }; set("certifications", arr); }} className="md:col-span-2 rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                <input type="date" value={c.date_completed || ""} onChange={(e) => { const arr = [...form.certifications]; arr[i] = { ...c, date_completed: e.target.value }; set("certifications", arr); }} className="rounded-lg border border-input bg-card px-2 py-2 text-sm" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {(form.education || []).map((c, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 border-b border-border pb-2">
                <input placeholder="Qualification" value={c.qualification} onChange={(e) => { const arr = [...form.education]; arr[i] = { ...c, qualification: e.target.value }; set("education", arr); }} className="md:col-span-2 rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                <input placeholder="Institution" value={c.institution} onChange={(e) => { const arr = [...form.education]; arr[i] = { ...c, institution: e.target.value }; set("education", arr); }} className="md:col-span-2 rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                <input type="date" value={c.date_completed || ""} onChange={(e) => { const arr = [...form.education]; arr[i] = { ...c, date_completed: e.target.value }; set("education", arr); }} className="rounded-lg border border-input bg-card px-2 py-2 text-sm" />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }) {
  return <div><label className="block text-sm font-medium text-foreground mb-1">{label}</label><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>;
}
function TextArea({ label, value, onChange }) {
  return <div><label className="block text-sm font-medium text-foreground mb-1">{label}</label><textarea value={value} onChange={(e) => onChange(e.target.value)} className="w-full min-h-[80px] rounded-lg border border-input bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>;
}
function Select({ label, value, options, onChange }) {
  return <div><label className="block text-sm font-medium text-foreground mb-1">{label}</label><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">{options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}</select></div>;
}
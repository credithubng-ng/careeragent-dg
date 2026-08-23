import React, { useState, useEffect } from "react";
import { useCollection } from "@/lib/entityHooks";
import { listOwnedRecords, createOwnedRecord, updateOwnedRecord } from "@/lib/ownedEntities";
import { PageHeader, SectionCard, Loading, Notice } from "@/components/ui-kit";
import OINav from "@/components/opportunity-intelligence/OINav";
import { SUGGESTED_JOB_TITLES, SUGGESTED_KEYWORDS, SUGGESTED_CONSULTING_KEYWORDS, SUGGESTED_EXCLUDED_TITLES } from "@/lib/oiUtils";
import { Plus, X, Save } from "lucide-react";
import { toast } from "react-hot-toast";

const PRIORITIES = ["Critical", "High", "Medium", "Low"];

export default function SearchProfile() {
  const { data: profiles, loading, refetch } = useCollection("SearchProfile", () => listOwnedRecords("SearchProfile", {}, "-created_date", 5));
  const { data: candidates } = useCollection("Candidate", () => listOwnedRecords("Candidate", {}, "-created_date", 1));
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form && profiles.length) setForm({
      ...profiles[0],
      opportunity_types: profiles[0].opportunity_types || ["Permanent Employment", "Contract or Interim", "Consulting Engagement"],
      consulting_keywords: profiles[0].consulting_keywords || SUGGESTED_CONSULTING_KEYWORDS.slice(0, 8),
    });
    else if (!form && !profiles.length && candidates.length) {
      const c = candidates[0];
      setForm({
        profile_name: "Primary Search Profile",
        candidate_id: c.id,
        opportunity_types: ["Permanent Employment", "Contract or Interim", "Consulting Engagement"],
        target_job_titles: (c.preferred_job_titles || []).map(t => ({ title: t, priority: "High" })),
        search_keywords: SUGGESTED_KEYWORDS.slice(0, 5),
        consulting_keywords: SUGGESTED_CONSULTING_KEYWORDS.slice(0, 8),
        excluded_titles: SUGGESTED_EXCLUDED_TITLES.slice(),
        excluded_keywords: [],
        search_filters: {
          min_salary: c.min_salary, preferred_salary: c.preferred_salary, currency: c.salary_currency || "GBP",
          employment_types: c.employment_type_preference ? [c.employment_type_preference] : [],
          work_arrangements: c.work_arrangement_preference ? [c.work_arrangement_preference] : [],
          countries: c.region_preference === "Global Remote" ? [] : ["United Kingdom"],
          cities: [], regions: c.preferred_locations || [], postcodes: [],
          max_commute: c.max_commute_distance, willing_to_travel: c.willing_to_travel, willing_to_relocate: c.willing_to_relocate,
          preferred_industries: c.preferred_industries || [], excluded_industries: c.excluded_industries || [],
          right_to_work_rules: c.right_to_work, seniority_level: "", notice_period: c.notice_period,
        },
        min_match_score_auto_import: 50, min_match_score_notification: 70, active: true,
      });
    }
  }, [profiles, candidates]);

  async function save() {
    if (!form) return;
    setSaving(true);
    try { if (form.id) await updateOwnedRecord("SearchProfile", form.id, form); else await createOwnedRecord("SearchProfile", form); refetch(); toast.success("Search profile saved"); }
    catch (e) { toast.error(e?.message || "Failed to save"); } finally { setSaving(false); }
  }

  if (loading || !form) return <Loading />;

  const f = form.search_filters || {};
  const setFilter = (key, val) => setForm({ ...form, search_filters: { ...f, [key]: val } });

  return (
    <div>
      <PageHeader title="Search Profile" subtitle="Central search configuration linked to your Candidate Profile"
        actions={<button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Profile"}</button>} />
      <OINav />
      <Notice tone="blue">Search filters default from your Candidate Profile. Changes here override the Candidate Profile only where you explicitly set them.</Notice>
      <div className="space-y-6 mt-4">
        <SectionCard title="Opportunity Lanes" description="Search employment and Inspirars consulting opportunities in parallel, while keeping each lane distinct">
          <CheckboxGroup
            options={["Permanent Employment", "Contract or Interim", "Consulting Engagement"]}
            selected={form.opportunity_types || ["Permanent Employment", "Contract or Interim"]}
            onChange={opportunity_types => setForm({ ...form, opportunity_types })}
          />
          <p className="mt-3 text-xs text-muted-foreground">Consulting Engagement covers direct client work, maturity assessments, advisory projects, tenders and fractional Data Governance leadership. It is not treated as a salaried vacancy.</p>
        </SectionCard>
        <SectionCard title="Target Job Titles" description="Roles to search for, with priority weighting">
          <ListEditor items={form.target_job_titles || []} onChange={items => setForm({ ...form, target_job_titles: items })} renderItem={(item, set) => (
            <div className="flex items-center gap-2 flex-1">
              <input value={item.title || ""} onChange={e => set({ ...item, title: e.target.value })} className="input flex-1" placeholder="Job title" />
              <select value={item.priority || "Medium"} onChange={e => set({ ...item, priority: e.target.value })} className="input w-32">{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select>
            </div>
          )} newItem={() => ({ title: "", priority: "Medium" })} suggestions={SUGGESTED_JOB_TITLES} onSuggest={t => setForm({ ...form, target_job_titles: [...(form.target_job_titles || []), { title: t, priority: "High" }] })} />
        </SectionCard>

        <SectionCard title="Search Keywords" description="Keywords to match in job descriptions">
          <TagEditor tags={form.search_keywords || []} onChange={tags => setForm({ ...form, search_keywords: tags })} suggestions={SUGGESTED_KEYWORDS} />
        </SectionCard>

        <SectionCard title="Consulting Opportunity Keywords" description="Commercial signals for direct Inspirars engagements and advisory projects">
          <TagEditor tags={form.consulting_keywords || []} onChange={consulting_keywords => setForm({ ...form, consulting_keywords })} suggestions={SUGGESTED_CONSULTING_KEYWORDS} />
        </SectionCard>

        <SectionCard title="Excluded Titles and Keywords" description="Roles to exclude — but governance roles with substantial governance responsibilities are not auto-rejected">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Excluded Titles</p>
              <TagEditor tags={form.excluded_titles || []} onChange={tags => setForm({ ...form, excluded_titles: tags })} suggestions={SUGGESTED_EXCLUDED_TITLES} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Excluded Keywords</p>
              <TagEditor tags={form.excluded_keywords || []} onChange={tags => setForm({ ...form, excluded_keywords: tags })} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Search Filters" description="Salary, location, work arrangement and eligibility preferences">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <F label="Minimum Salary (£)"><input type="number" value={f.min_salary || ""} onChange={e => setFilter("min_salary", Number(e.target.value))} className="input" /></F>
            <F label="Preferred Salary (£)"><input type="number" value={f.preferred_salary || ""} onChange={e => setFilter("preferred_salary", Number(e.target.value))} className="input" /></F>
            <F label="Currency"><select value={f.currency || "GBP"} onChange={e => setFilter("currency", e.target.value)} className="input"><option>GBP</option><option>EUR</option><option>USD</option></select></F>
            <F label="Max Commute (miles)"><input type="number" value={f.max_commute || ""} onChange={e => setFilter("max_commute", Number(e.target.value))} className="input" /></F>
            <F label="Seniority Level"><input value={f.seniority_level || ""} onChange={e => setFilter("seniority_level", e.target.value)} className="input" placeholder="e.g. Manager, Head, Director" /></F>
            <F label="Notice Period"><input value={f.notice_period || ""} onChange={e => setFilter("notice_period", e.target.value)} className="input" /></F>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Employment Types</p>
              <CheckboxGroup options={["Permanent", "Contract", "Interim", "Fixed Term", "Full-Time", "Part-Time"]} selected={f.employment_types || []} onChange={v => setFilter("employment_types", v)} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Work Arrangements</p>
              <CheckboxGroup options={["Remote", "Hybrid", "Office"]} selected={f.work_arrangements || []} onChange={v => setFilter("work_arrangements", v)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Preferred Industries</p>
              <TagEditor tags={f.preferred_industries || []} onChange={v => setFilter("preferred_industries", v)} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Excluded Industries</p>
              <TagEditor tags={f.excluded_industries || []} onChange={v => setFilter("excluded_industries", v)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Countries</p>
              <TagEditor tags={f.countries || []} onChange={v => setFilter("countries", v)} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Regions / Locations</p>
              <TagEditor tags={f.regions || []} onChange={v => setFilter("regions", v)} />
            </div>
          </div>
          <div className="flex gap-6 mt-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.willing_to_travel} onChange={e => setFilter("willing_to_travel", e.target.checked)} /> Willing to travel</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.willing_to_relocate} onChange={e => setFilter("willing_to_relocate", e.target.checked)} /> Willing to relocate</label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <F label="Right-to-Work Rules"><input value={f.right_to_work_rules || ""} onChange={e => setFilter("right_to_work_rules", e.target.value)} className="input" /></F>
            <F label="Security Clearance Rules"><input value={f.security_clearance_rules || ""} onChange={e => setFilter("security_clearance_rules", e.target.value)} className="input" /></F>
            <F label="Sponsorship Rules"><input value={f.sponsorship_rules || ""} onChange={e => setFilter("sponsorship_rules", e.target.value)} className="input" /></F>
          </div>
        </SectionCard>

        <SectionCard title="Automation Thresholds" description="Minimum match scores for automated actions">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Min Match Score for Auto Import"><input type="number" value={form.min_match_score_auto_import || 50} onChange={e => setForm({ ...form, min_match_score_auto_import: Number(e.target.value) })} className="input" /></F>
            <F label="Min Match Score for Notification"><input type="number" value={form.min_match_score_notification || 70} onChange={e => setForm({ ...form, min_match_score_notification: Number(e.target.value) })} className="input" /></F>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function ListEditor({ items, onChange, renderItem, newItem, suggestions, onSuggest }) {
  function setItem(i, val) { const next = [...items]; next[i] = val; onChange(next); }
  function remove(i) { onChange(items.filter((_, idx) => idx !== i)); }
  function add() { onChange([...items, newItem()]); }
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          {renderItem(item, (val) => setItem(i, val))}
          <button onClick={() => remove(i)} className="rounded-lg p-2 hover:bg-muted text-rose-600"><X className="h-4 w-4" /></button>
        </div>
      ))}
      <button onClick={add} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Plus className="h-4 w-4" /> Add</button>
      {suggestions && suggestions.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground mb-1">Suggested:</p>
          <div className="flex flex-wrap gap-1">
            {suggestions.filter(s => !items.some(i => i.title === s || i === s)).slice(0, 10).map(s => (
              <button key={s} onClick={() => onSuggest(s)} className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted">{s}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TagEditor({ tags, onChange, suggestions }) {
  const [input, setInput] = useState("");
  function add() { const v = input.trim(); if (v && !tags.includes(v)) { onChange([...tags, v]); setInput(""); } }
  function addSuggested(s) { if (!tags.includes(s)) onChange([...tags, s]); }
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map(t => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">{t}<button onClick={() => onChange(tags.filter(x => x !== t))}><X className="h-3 w-3" /></button></span>)}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())} className="input flex-1" placeholder="Type and press Enter" />
        <button onClick={add} className="rounded-lg border border-border px-3 py-2 text-sm"><Plus className="h-4 w-4" /></button>
      </div>
      {suggestions && <div className="flex flex-wrap gap-1 mt-2">{suggestions.filter(s => !tags.includes(s)).slice(0, 10).map(s => <button key={s} onClick={() => addSuggested(s)} className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted">{s}</button>)}</div>}
    </div>
  );
}

function CheckboxGroup({ options, selected, onChange }) {
  function toggle(o) { onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o]); }
  return <div className="flex flex-wrap gap-3">{options.map(o => <label key={o} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} /> {o}</label>)}</div>;
}

function F({ label, children }) {
  return <label className="block"><span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>{children}</label>;
}

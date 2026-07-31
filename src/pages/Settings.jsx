import React, { useState } from "react";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState } from "@/components/ui-kit";
import { DEFAULT_WEIGHTS, DEFAULT_HARD_STOPS } from "@/lib/careerAI";
import { todayISO } from "@/lib/format";
import { Save, Plus, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { listOwnedRecords, createOwnedRecord, updateOwnedRecord } from "@/lib/ownedEntities";
import DataCleanupPanel from "@/components/DataCleanupPanel";

export default function Settings() {
  const { data: candidates, loading } = useCollection("Candidate", () => listOwnedRecords("Candidate", {}, "-created_date", 5));
  const { data: goals, refetch: refetchGoals } = useCollection("CampaignGoal", () => listOwnedRecords("CampaignGoal", {}, "-created_date", 5));
  const { data: settings, refetch: refetchSettings } = useCollection("ScoringSetting", () => listOwnedRecords("ScoringSetting", {}, "-created_date", 5));

  const [goal, setGoal] = useState(null);
  const [scoring, setScoring] = useState(null);

  React.useEffect(() => {
    if (!goal && goals.length) setGoal(goals[0]);
    else if (!goal && !goals.length && candidates.length) setGoal({ campaign_name: "60-Day Data Governance Campaign", start_date: todayISO(), target_end_date: todayISO(), target_applications: 15, target_recruiter_conversations: 20, target_interviews: 6, target_offers: 2, candidate_id: candidates[0]?.id });
  }, [goals, candidates]);

  React.useEffect(() => {
    if (!scoring && settings.length) setScoring(settings[0]);
    else if (!scoring && !settings.length && candidates.length) setScoring({ ...DEFAULT_WEIGHTS, hard_stops: DEFAULT_HARD_STOPS, active: true, candidate_id: candidates[0]?.id });
  }, [settings, candidates]);

  async function saveGoal() {
    try {
      if (goal.id) await updateOwnedRecord("CampaignGoal", goal.id, goal);
      else await createOwnedRecord("CampaignGoal", goal);
      refetchGoals(); toast.success("Campaign saved");
    } catch { toast.error("Failed to save campaign"); }
  }

  async function saveScoring() {
    try {
      if (scoring.id) await updateOwnedRecord("ScoringSetting", scoring.id, scoring);
      else await createOwnedRecord("ScoringSetting", scoring);
      refetchSettings(); toast.success("Scoring settings saved");
    } catch { toast.error("Failed to save scoring"); }
  }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Campaign goals, scoring weights and system configuration" />

      <div className="space-y-6">
        <SectionCard title="60-Day Campaign Goals" description="Set your campaign window and targets">
          {goal ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2"><label className="block text-sm font-medium text-foreground mb-1">Campaign name</label><input value={goal.campaign_name} onChange={(e) => setGoal({ ...goal, campaign_name: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-foreground mb-1">Start date</label><input type="date" value={goal.start_date || ""} onChange={(e) => setGoal({ ...goal, start_date: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-foreground mb-1">Target end date</label><input type="date" value={goal.target_end_date || ""} onChange={(e) => setGoal({ ...goal, target_end_date: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></div>
              <NumField label="Target applications" value={goal.target_applications} onChange={(v) => setGoal({ ...goal, target_applications: v })} />
              <NumField label="Target recruiter conversations" value={goal.target_recruiter_conversations} onChange={(v) => setGoal({ ...goal, target_recruiter_conversations: v })} />
              <NumField label="Target interviews" value={goal.target_interviews} onChange={(v) => setGoal({ ...goal, target_interviews: v })} />
              <NumField label="Target offers" value={goal.target_offers} onChange={(v) => setGoal({ ...goal, target_offers: v })} />
              <div className="md:col-span-2 flex justify-end"><button onClick={saveGoal} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><Save className="h-4 w-4" /> Save Campaign</button></div>
            </div>
          ) : <Loading />}
        </SectionCard>

        <SectionCard title="AI Match Scoring Weights" description="Weights should total 100. These guide the AI matching engine.">
          {scoring ? (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[["weight_experience", "Relevant experience"], ["weight_essential_skills", "Essential skills"], ["weight_seniority_leadership", "Role seniority & leadership fit"], ["weight_sector", "Sector experience"], ["weight_responsibilities", "Responsibilities & achievement alignment"], ["weight_location", "Location & working-pattern fit"], ["weight_salary", "Salary & employment-type fit"], ["weight_qualifications", "Qualifications & certifications"]].map(([k, label]) => (
                  <NumField key={k} label={`${label} (%)`} value={scoring[k]} onChange={(v) => setScoring({ ...scoring, [k]: v })} />
                ))}
              </div>
              <div className="mt-3 text-sm text-muted-foreground">Total: <span className={scoring.weight_experience + scoring.weight_essential_skills + scoring.weight_seniority_leadership + scoring.weight_sector + scoring.weight_responsibilities + scoring.weight_location + scoring.weight_salary + scoring.weight_qualifications === 100 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>{scoring.weight_experience + scoring.weight_essential_skills + scoring.weight_seniority_leadership + scoring.weight_sector + scoring.weight_responsibilities + scoring.weight_location + scoring.weight_salary + scoring.weight_qualifications}</span></div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-foreground mb-1">Hard-stop rules</label>
                <textarea value={(scoring.hard_stops || []).join("\n")} onChange={(e) => setScoring({ ...scoring, hard_stops: e.target.value.split("\n").filter(Boolean) })} className="w-full min-h-[140px] rounded-lg border border-input bg-card p-3 text-sm" />
              </div>
              <div className="flex justify-end mt-3"><button onClick={saveScoring} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><Save className="h-4 w-4" /> Save Scoring</button></div>
            </div>
          ) : <Loading />}
        </SectionCard>

        <DataCleanupPanel />

        <SectionCard title="Safety & Accuracy" description="Core principles enforced throughout the application">
          <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
            <li>The application never invents candidate experience or qualifications.</li>
            <li>Employment dates, job titles and achievements are never altered without approval.</li>
            <li>No automatic application submission — the candidate reviews and approves all content.</li>
            <li>No unsolicited messages are sent without candidate approval.</li>
            <li>No unauthorised website scraping is performed.</li>
            <li>Match scores are decision-support only and do not guarantee employer interest.</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }) {
  return <div><label className="block text-sm font-medium text-foreground mb-1">{label}</label><input type="number" value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" /></div>;
}
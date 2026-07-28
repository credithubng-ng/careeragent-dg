import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState } from "@/components/ui-kit";
import { ukDate } from "@/lib/format";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Plus, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { createOwnedRecord } from "@/lib/ownedEntities";

const STAGES = ["Identified", "Reviewing", "Preparing", "Ready to Apply", "Applied", "Recruiter Contact", "First Interview", "Further Interview", "Assessment", "Reference Check", "Offer", "Rejected", "Withdrawn"];

export default function Applications() {
  const { data: apps, loading, refetch } = useCollection("Application", () => base44.entities.Application.list("-created_date", 300));
  const { data: jobs } = useCollection("Job", () => base44.entities.Job.list("-created_date", 300));
  const { data: candidates } = useCollection("Candidate", () => base44.entities.Candidate.list());
  const { data: cvs } = useCollection("CV", () => base44.entities.CV.list("-created_date", 50));
  const [adding, setAdding] = useState(false);
  const [newApp, setNewApp] = useState({ job_id: "", stage: "Identified" });

  const byStage = useMemo(() => {
    const map = {};
    STAGES.forEach((s) => (map[s] = []));
    apps.forEach((a) => { if (map[a.stage]) map[a.stage].push(a); });
    return map;
  }, [apps]);

  async function onDragEnd(res) {
    if (!res.destination) return;
    const app = apps.find((a) => a.id === res.draggableId);
    if (!app || app.stage === res.destination.droppableId) return;
    try {
      await base44.entities.Application.update(app.id, { stage: res.destination.droppableId });
      if (res.destination.droppableId === "Applied" && !app.date_applied) {
        await base44.entities.Application.update(app.id, { date_applied: new Date().toISOString().slice(0, 10) });
      }
      refetch();
    } catch { toast.error("Failed to move application"); }
  }

  async function addApp() {
    const job = jobs.find((j) => j.id === newApp.job_id);
    if (!job) { toast.error("Select a job"); return; }
    const candidate = candidates[0];
    const masterCv = cvs.find((c) => c.is_master) || cvs[0];
    await createOwnedRecord("Application", {
      candidate_id: candidate?.id,
      job_id: job.id,
      job_title: job.job_title,
      employer: job.employer,
      contact_person: job.contact_person || "",
      cv_id: masterCv?.id || "",
      cv_name: masterCv?.cv_name || "",
      stage: newApp.stage,
    });
    setAdding(false); setNewApp({ job_id: "", stage: "Identified" });
    refetch();
    toast.success("Application added");
  }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Applications"
        subtitle="Drag cards between stages to update progress"
        actions={<button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"><Plus className="h-4 w-4" /> Add Application</button>}
      />

      {adding && (
        <SectionCard title="New Application" className="mb-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Job</label>
              <select value={newApp.job_id} onChange={(e) => setNewApp({ ...newApp, job_id: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                <option value="">Select job…</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.job_title} — {j.employer}</option>)}
              </select>
            </div>
            <select value={newApp.stage} onChange={(e) => setNewApp({ ...newApp, stage: e.target.value })} className="rounded-lg border border-input bg-card px-3 py-2 text-sm">
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={addApp} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">Add</button>
            <button onClick={() => setAdding(false)} className="rounded-lg border border-border px-3 py-2"><X className="h-4 w-4" /></button>
          </div>
        </SectionCard>
      )}

      {apps.length === 0 ? (
        <EmptyState title="No applications yet" description="Add an application or start one from a job detail page." />
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <Droppable key={stage} droppableId={stage}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="w-72 shrink-0">
                    <div className="rounded-t-lg bg-muted/50 px-3 py-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{stage}</span>
                      <span className="text-xs text-muted-foreground rounded-full bg-card px-2 py-0.5">{byStage[stage].length}</span>
                    </div>
                    <div className="rounded-b-lg border border-t-0 border-border bg-muted/20 p-2 min-h-[120px] space-y-2">
                      {byStage[stage].map((a, idx) => (
                        <Draggable key={a.id} draggableId={a.id} index={idx}>
                          {(p) => (
                            <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="rounded-lg border border-border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing">
                              <p className="text-sm font-medium text-foreground truncate">{a.job_title}</p>
                              <p className="text-xs text-muted-foreground truncate">{a.employer}</p>
                              {a.date_applied && <p className="text-[11px] text-muted-foreground mt-1">Applied {ukDate(a.date_applied)}</p>}
                              {a.follow_up_date && <p className="text-[11px] text-amber-600">Follow-up {ukDate(a.follow_up_date)}</p>}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
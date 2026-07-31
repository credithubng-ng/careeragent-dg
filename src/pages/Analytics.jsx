import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "@/lib/entityHooks";
import { PageHeader, SectionCard, Loading, EmptyState, StatCard } from "@/components/ui-kit";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Clock, Target, AlertCircle } from "lucide-react";
import { listOwnedRecords } from "@/lib/ownedEntities";

const PIE = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#0ea5e9", "#8b5cf6"];

export default function Analytics() {
  const { data: jobs, loading } = useCollection("Job", () => listOwnedRecords("Job", {}, "-created_date", 300));
  const { data: applications } = useCollection("Application", () => listOwnedRecords("Application", {}, "-created_date", 300));
  const { data: interviews } = useCollection("Interview", () => listOwnedRecords("Interview", {}, "-created_date", 100));
  const { data: cvs } = useCollection("CV", () => listOwnedRecords("CV", {}, "-created_date", 100));

  const data = useMemo(() => {
    // avg score by job title
    const titleMap = {};
    jobs.forEach((j) => { if (j.match_score != null) { (titleMap[j.job_title] = titleMap[j.job_title] || []).push(j.match_score); } });
    const byTitle = Object.entries(titleMap).map(([name, arr]) => ({ name, score: Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) })).sort((a, b) => b.score - a.score).slice(0, 8);

    // sources generating interviews
    const sourceInt = {};
    interviews.forEach((iv) => { const job = jobs.find((j) => j.id === iv.job_id); const s = job?.job_source_name || "Unknown"; sourceInt[s] = (sourceInt[s] || 0) + 1; });
    const bySourceInterviews = Object.entries(sourceInt).map(([name, count]) => ({ name, count }));

    // sectors generating responses (interviews by sector)
    const sectorResp = {};
    interviews.forEach((iv) => { const job = jobs.find((j) => j.id === iv.job_id); const s = job?.sector || "Unspecified"; sectorResp[s] = (sectorResp[s] || 0) + 1; });
    const bySector = Object.entries(sectorResp).map(([name, count]) => ({ name, count }));

    // avg time application to response (interview date - date_applied)
    const times = [];
    interviews.forEach((iv) => { const app = applications.find((a) => a.job_id === iv.job_id); if (app?.date_applied && iv.interview_date) { const diff = (new Date(iv.interview_date) - new Date(app.date_applied)) / 86400000; if (diff >= 0) times.push(diff); } });
    const avgResponseDays = times.length ? Math.round(times.reduce((s, x) => s + x, 0) / times.length) : null;

    const submitted = applications.filter((a) => ["Applied", "Recruiter Contact", "First Interview", "Further Interview", "Assessment", "Reference Check", "Offer"].includes(a.stage)).length;
    const offers = applications.filter((a) => a.stage === "Offer").length;
    // Only show conversion rates when there's enough data
    const appsPerInterview = submitted >= 1 && interviews.length >= 1 ? Math.round((submitted / interviews.length) * 10) / 10 : null;
    const interviewsPerOffer = interviews.length >= 1 && offers >= 1 ? Math.round((interviews.length / offers) * 10) / 10 : null;

    // common rejection reasons
    const rejMap = {};
    applications.filter((a) => a.rejection_reason).forEach((a) => { rejMap[a.rejection_reason] = (rejMap[a.rejection_reason] || 0) + 1; });
    const rejections = Object.entries(rejMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    // missing skills across jobs (from match analyses is complex; use job required technologies aggregation)
    const techMap = {};
    jobs.forEach((j) => { if (j.required_technologies) j.required_technologies.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean).forEach((t) => { techMap[t] = (techMap[t] || 0) + 1; }); });
    const commonTech = Object.entries(techMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

    return { byTitle, bySourceInterviews, bySector, avgResponseDays, appsPerInterview, interviewsPerOffer, rejections, commonTech, submitted, offers };
  }, [jobs, applications, interviews]);

  if (loading) return <Loading />;

  const hasData = jobs.length > 0 || applications.length > 0;

  if (!hasData) {
    return (
      <div>
        <PageHeader title="Analytics" subtitle="Understand what's working in your search" />
        <EmptyState
          title="Analytics will appear once you start reviewing and applying for jobs"
          description="Import jobs, run match analysis and submit applications to generate campaign insights."
          action={<Link to="/jobs/import" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">Import a Job</Link>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Understand what's working in your search" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Avg App→Response" value={data.avgResponseDays != null ? `${data.avgResponseDays}d` : "—"} hint={data.avgResponseDays == null ? "Insufficient data" : ""} icon={Clock} accent="blue" />
        <StatCard label="Apps/Interview" value={data.appsPerInterview ?? "—"} hint={data.appsPerInterview == null ? "Insufficient data" : ""} icon={Target} accent="amber" />
        <StatCard label="Interviews/Offer" value={data.interviewsPerOffer ?? "—"} hint={data.interviewsPerOffer == null ? "Insufficient data" : ""} icon={TrendingUp} accent="violet" />
        <StatCard label="Rejection Reasons" value={data.rejections.length} icon={AlertCircle} accent="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Highest Match Scores by Job Title">
          {data.byTitle.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No scored jobs yet. Run match analysis to see insights.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.byTitle} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="score" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Sources Generating Interviews">
          {data.bySourceInterviews.length < 3 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Insufficient data — at least 3 interviews needed for source analysis.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data.bySourceInterviews} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name }) => name}>
                  {data.bySourceInterviews.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Sectors Generating Responses">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.bySector}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Most Common Required Technologies">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.commonTech} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Rejection Reasons" className="lg:col-span-2">
          {data.rejections.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No rejections recorded yet.</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.rejections}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={70} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
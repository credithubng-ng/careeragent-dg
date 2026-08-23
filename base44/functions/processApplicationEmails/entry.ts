import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { extractEmailBody, extractHeader, extractSender } from "../../shared/emailParsers.ts";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CONNECTOR_ID = "6a6dbe19898b53557d5ea634";
const POSITIVE_TYPES = ["Interview Invitation", "Interview Feedback", "Progression", "Offer", "Reference Check", "Onboarding"];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await base44.auth.me();
    const ownerEmail = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (!ownerEmail) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const applications = await base44.asServiceRole.entities.Application.filter({ owner_email: ownerEmail }, "-created_date", 200);
    if (!applications.length) return Response.json({ summary: { scanned: 0, captured: 0, positive: 0, action_required: 0, message: "No applications exist to match against." } });
    const candidates = await base44.asServiceRole.entities.Candidate.filter({ owner_email: ownerEmail });
    const existing = await base44.asServiceRole.entities.ApplicationCommunication.filter({ owner_email: ownerEmail }, "-created_date", 1000);
    const existingIds = new Set(existing.map((item: any) => item.gmail_message_id));

    let accessToken = "";
    try { accessToken = (await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID)).accessToken; }
    catch { return Response.json({ error: "Gmail is not connected.", not_connected: true }, { status: 403 }); }
    const headers = { Authorization: `Bearer ${accessToken}` };
    const ids: string[] = Array.isArray(body.message_ids) && body.message_ids.length
      ? body.message_ids
      : await searchMessages(headers, buildQuery(Number(body.days) || 21), 150);

    let captured = 0, positive = 0, actionRequired = 0, unmatched = 0;
    const errors: string[] = [];
    for (const id of ids) {
      if (existingIds.has(id)) continue;
      try {
        const message = await getMessage(headers, id);
        const messageHeaders = message.payload?.headers || [];
        const sender = extractSender(messageHeaders);
        const subject = extractHeader(messageHeaders, "subject");
        const receivedDate = extractHeader(messageHeaders, "date");
        const emailBody = extractEmailBody(message.payload).slice(0, 12000);
        if (!looksApplicationRelated(subject, emailBody, applications)) continue;

        const result = await classifyEmail(subject, sender, emailBody, applications, (params: any) => base44.asServiceRole.integrations.Core.InvokeLLM(params));
        if (!result.is_application_related) continue;
        const matched = applications.find((app: any) => app.id === result.application_id);
        const type = validType(result.communication_type);
        const isPositive = POSITIVE_TYPES.includes(type);
        const requiresAction = Boolean(result.requires_action) || ["Information Request", "Interview Invitation", "Offer", "Reference Check", "Onboarding"].includes(type);
        const confidence = Math.max(0, Math.min(100, Number(result.confidence) || 0));
        const reviewStatus = matched && confidence >= 75 ? "Needs Review" : "Needs Review";
        await base44.asServiceRole.entities.ApplicationCommunication.create({
          owner_email: ownerEmail,
          candidate_id: candidates[0]?.id || "",
          application_id: matched?.id || "",
          job_id: matched?.job_id || "",
          gmail_message_id: id,
          gmail_thread_id: message.threadId || "",
          sender, subject, received_date: receivedDate,
          communication_type: type,
          outcome_tone: isPositive ? "Positive" : requiresAction ? "Action Required" : type === "Rejection" ? "Negative" : result.outcome_tone || "Unclear",
          priority: type === "Offer" || type === "Interview Invitation" ? "Critical" : isPositive || requiresAction ? "High" : type === "Rejection" ? "Low" : "Normal",
          summary: String(result.summary || subject || "Application email").slice(0, 1000),
          body_excerpt: emailBody.slice(0, 2000),
          suggested_stage: validStage(result.suggested_stage),
          confidence,
          match_reason: String(result.match_reason || "").slice(0, 500),
          review_status: reviewStatus,
          requires_action: requiresAction,
          action_description: String(result.action_description || "").slice(0, 500),
          action_due_date: result.action_due_date || "",
          processed_date: new Date().toISOString(),
        });
        captured++; if (isPositive) positive++; if (requiresAction) actionRequired++; if (!matched) unmatched++;
      } catch (error: any) { errors.push(`${id}: ${error.message}`); }
    }
    return Response.json({ summary: { scanned: ids.length, captured, positive, action_required: actionRequired, unmatched, errors: errors.slice(0, 5), checked_at: new Date().toISOString() } });
  } catch (error: any) { return Response.json({ error: error.message }, { status: 500 }); }
}

function buildQuery(days: number): string { const date = new Date(); date.setDate(date.getDate() - days); const after = date.toISOString().slice(0, 10).replace(/-/g, "/"); const terms = ["application", "interview", "offer", "assessment", "shortlist", "shortlisted", "recruitment", "candidate", "feedback", "onboarding", "reference check", "start date", "unfortunately"].map((term) => `subject:"${term}"`).join(" OR "); return `(${terms}) after:${after}`; }
async function searchMessages(headers: any, query: string, max: number): Promise<string[]> { const ids: string[] = []; let page = ""; while (ids.length < max) { const url = `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=${Math.min(100, max - ids.length)}${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`; const response = await fetch(url, { headers }); if (!response.ok) throw new Error("Gmail application-email search failed"); const data = await response.json(); ids.push(...(data.messages || []).map((item: any) => item.id)); page = data.nextPageToken || ""; if (!page) break; } return ids; }
async function getMessage(headers: any, id: string): Promise<any> { const response = await fetch(`${GMAIL_API}/messages/${id}?format=full`, { headers }); if (!response.ok) throw new Error("Unable to read Gmail message"); return response.json(); }
function looksApplicationRelated(subject: string, body: string, applications: any[]): boolean { const text = `${subject} ${body}`.toLowerCase(); const event = /\b(application|interview|shortlist|offer|assessment|candidate|recruit|feedback|reference check|onboarding|start date|unfortunately)\b/.test(text); const application = applications.some((app: any) => [app.job_title, app.employer].some((value) => value && text.includes(String(value).toLowerCase()))); return event || application; }
async function classifyEmail(subject: string, sender: string, body: string, applications: any[], invoke: any): Promise<any> { const options = applications.slice(0, 100).map((app: any) => ({ id: app.id, job_id: app.job_id, job_title: app.job_title, employer: app.employer, stage: app.stage, date_applied: app.date_applied })); const response = await invoke({ prompt: `Classify this incoming email for a job-application tracker. Positive progression must never be hidden among rejections. Link only when evidence matches an application by employer, job title, reference or context. Do not invent facts. If uncertain, leave application_id empty and explain why.\n\nAPPLICATIONS:\n${JSON.stringify(options)}\n\nEMAIL FROM: ${sender}\nSUBJECT: ${subject}\nBODY:\n${body}`, response_json_schema: { type: "object", properties: { is_application_related: { type: "boolean" }, application_id: { type: "string" }, communication_type: { type: "string", enum: ["Acknowledgement", "Recruiter Response", "Information Request", "Interview Invitation", "Interview Feedback", "Progression", "Rejection", "Offer", "Reference Check", "Onboarding", "Unclassified"] }, outcome_tone: { type: "string", enum: ["Positive", "Action Required", "Neutral", "Negative", "Unclear"] }, summary: { type: "string" }, suggested_stage: { type: "string" }, confidence: { type: "number" }, match_reason: { type: "string" }, requires_action: { type: "boolean" }, action_description: { type: "string" }, action_due_date: { type: "string" } }, required: ["is_application_related", "application_id", "communication_type", "outcome_tone", "summary", "suggested_stage", "confidence", "match_reason", "requires_action", "action_description", "action_due_date"] } }); return unwrap(response); }
function unwrap(value: any): any { let current = value; for (let i = 0; i < 5; i++) { if (typeof current === "string") { try { return JSON.parse(current.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { return {}; } } if (current?.data != null) { current = current.data; continue; } if (current?.result != null) { current = current.result; continue; } if (current?.output != null) { current = current.output; continue; } return current || {}; } return current || {}; }
function validType(value: string): string { const allowed = ["Acknowledgement", "Recruiter Response", "Information Request", "Interview Invitation", "Interview Feedback", "Progression", "Rejection", "Offer", "Reference Check", "Onboarding", "Unclassified"]; return allowed.includes(value) ? value : "Unclassified"; }
function validStage(value: string): string { const allowed = ["Applied", "Recruiter Contact", "First Interview", "Further Interview", "Assessment", "Reference Check", "Offer", "Rejected"]; return allowed.includes(value) ? value : ""; }

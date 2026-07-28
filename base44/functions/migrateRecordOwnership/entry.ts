import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

const CONFIRMATION = "MIGRATE_LEGACY_OWNERSHIP";
const PAGE_SIZE = 500;

const dependentEntityNames = [
  "Application",
  "ApplicationDocument",
  "CV",
  "CampaignGoal",
  "Contact",
  "Interview",
  "Job",
  "JobMatch",
  "JobSource",
  "Notification",
  "ScoringSetting",
  "Task",
] as const;

type LegacyRecord = {
  id: string;
  owner_email?: string | null;
  candidate_id?: string | null;
  user_id?: string | null;
  email?: string | null;
};

type MigrationIssue = {
  entity: string;
  id: string;
  reason: string;
};

function normaliseEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function listAll(entity: {
  list: (sort?: string, limit?: number, skip?: number) => Promise<LegacyRecord[]>;
}) {
  const records: LegacyRecord[] = [];

  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await entity.list("created_date", PAGE_SIZE, skip);
    records.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return records;
}

function uniqueOwner(candidates: Array<string | undefined>) {
  const owners = [...new Set(candidates.filter(Boolean))] as string[];
  return owners.length === 1 ? owners[0] : null;
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    if (user.role !== "admin") {
      return Response.json(
        { error: "Administrator access is required." },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const apply = body?.confirm === CONFIRMATION;
    const requestedOwner = normaliseEmail(body?.owner_email);

    if (body?.confirm && !apply) {
      return Response.json(
        {
          error: "Invalid confirmation value.",
          expected_confirmation: CONFIRMATION,
        },
        { status: 400 },
      );
    }

    if (body?.owner_email && !requestedOwner) {
      return Response.json(
        { error: "owner_email must be a valid non-empty string." },
        { status: 400 },
      );
    }

    const entities = base44.asServiceRole.entities;
    const users = await listAll(entities.User);
    const usersById = new Map(users.map((record) => [record.id, record]));
    const usersByEmail = new Map<string, LegacyRecord[]>();

    for (const record of users) {
      const email = normaliseEmail(record.email);
      if (!email) continue;
      usersByEmail.set(email, [...(usersByEmail.get(email) ?? []), record]);
    }

    if (
      requestedOwner &&
      (usersByEmail.get(requestedOwner)?.length ?? 0) !== 1
    ) {
      return Response.json(
        { error: "owner_email must match exactly one Base44 user." },
        { status: 400 },
      );
    }

    const candidates = await listAll(entities.Candidate);
    const unownedCandidateCount = candidates.filter(
      (candidate) => !normaliseEmail(candidate.owner_email),
    ).length;

    if (requestedOwner && unownedCandidateCount !== 1) {
      return Response.json(
        {
          error:
            "A fallback owner can only be used when exactly one candidate lacks ownership.",
          unowned_candidate_count: unownedCandidateCount,
        },
        { status: 409 },
      );
    }

    const candidateOwners = new Map<string, string>();
    const issues: MigrationIssue[] = [];
    const proposed: Array<{ entity: string; id: string; owner: string }> = [];

    for (const candidate of candidates) {
      const existingOwner = normaliseEmail(candidate.owner_email);
      if (existingOwner) {
        candidateOwners.set(candidate.id, existingOwner);
        continue;
      }

      const userById = candidate.user_id
        ? usersById.get(candidate.user_id)
        : undefined;
      const emailMatches = usersByEmail.get(normaliseEmail(candidate.email)) ?? [];
      const owner = uniqueOwner([
        normaliseEmail(userById?.email) || undefined,
        emailMatches.length === 1
          ? normaliseEmail(emailMatches[0].email)
          : undefined,
      ]) ?? requestedOwner;

      if (!owner) {
        issues.push({
          entity: "Candidate",
          id: candidate.id,
          reason: "No unique user ID or email match.",
        });
        continue;
      }

      candidateOwners.set(candidate.id, owner);
      proposed.push({ entity: "Candidate", id: candidate.id, owner });
    }

    for (const entityName of dependentEntityNames) {
      const records = await listAll(entities[entityName]);

      for (const record of records) {
        const existingOwner = normaliseEmail(record.owner_email);
        const candidateOwner = record.candidate_id
          ? candidateOwners.get(record.candidate_id)
          : undefined;

        if (existingOwner) {
          if (candidateOwner && existingOwner !== candidateOwner) {
            issues.push({
              entity: entityName,
              id: record.id,
              reason: "Existing owner conflicts with the linked candidate owner.",
            });
          }
          continue;
        }

        if (!record.candidate_id || !candidateOwner) {
          issues.push({
            entity: entityName,
            id: record.id,
            reason: "Missing or unresolved candidate link.",
          });
          continue;
        }

        proposed.push({
          entity: entityName,
          id: record.id,
          owner: candidateOwner,
        });
      }
    }

    const updated: Array<{ entity: string; id: string }> = [];
    const failures: MigrationIssue[] = [];

    if (apply) {
      for (const change of proposed) {
        try {
          await entities[change.entity].update(change.id, {
            owner_email: change.owner,
          });
          updated.push({ entity: change.entity, id: change.id });
        } catch (error) {
          failures.push({
            entity: change.entity,
            id: change.id,
            reason:
              error instanceof Error ? error.message : "Unknown update error.",
          });
        }
      }
    }

    return Response.json({
      mode: apply ? "apply" : "dry-run",
      requested_owner: requestedOwner || null,
      scanned: {
        users: users.length,
        candidates: candidates.length,
      },
      proposed_count: proposed.length,
      updated_count: updated.length,
      issue_count: issues.length,
      failure_count: failures.length,
      proposed,
      issues,
      failures,
      confirmation_required: apply ? null : CONFIRMATION,
    });
  } catch (error) {
    console.error("Ownership migration failed", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Ownership migration failed.",
      },
      { status: 500 },
    );
  }
}

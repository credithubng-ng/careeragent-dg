import { base44 } from "@/api/base44Client";

async function getOwnerEmail() {
  const user = await base44.auth.me();
  const email =
    typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) {
    throw new Error("A signed-in user with an email address is required.");
  }
  return email;
}

function ensureEntity(entityName) {
  const entity = base44.entities[entityName];
  if (!entity?.list) {
    throw new Error(`Unknown entity: ${entityName}`);
  }
  return entity;
}

/**
 * List records owned by the authenticated user.
 * Always filters by owner_email in addition to any supplied query.
 */
export async function listOwnedRecords(entityName, query = {}, sort, limit) {
  const ownerEmail = await getOwnerEmail();
  return ensureEntity(entityName).filter(
    { ...query, owner_email: ownerEmail },
    sort,
    limit
  );
}

/**
 * Get a single record by id, scoped to the authenticated user.
 */
export async function getOwnedRecord(entityName, id) {
  if (!id) return null;
  const ownerEmail = await getOwnerEmail();
  const records = await ensureEntity(entityName).filter({
    id,
    owner_email: ownerEmail,
  });
  return records[0] || null;
}

/**
 * Create a record stamped with the authenticated user's owner_email.
 */
export async function createOwnedRecord(entityName, data) {
  const ownerEmail = await getOwnerEmail();
  return ensureEntity(entityName).create({
    ...data,
    owner_email: ownerEmail,
  });
}

/**
 * Update a record. RLS ensures only owned records can be modified.
 */
export async function updateOwnedRecord(entityName, id, data) {
  return ensureEntity(entityName).update(id, data);
}

/**
 * Delete a record. RLS ensures only owned records can be deleted.
 */
export async function deleteOwnedRecord(entityName, id) {
  return ensureEntity(entityName).delete(id);
}

/**
 * Return the authenticated user's single Candidate record, or null.
 * This MVP supports one candidate per user.
 */
export async function getOwnedCandidate() {
  const records = await listOwnedRecords("Candidate", {}, "-created_date", 1);
  return records[0] || null;
}
import { base44 } from "@/api/base44Client";

export async function createOwnedRecord(entityName, data) {
  const user = await base44.auth.me();
  const ownerEmail =
    typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";

  if (!ownerEmail) {
    throw new Error("A signed-in user with an email address is required.");
  }

  if (!base44.entities[entityName]?.create) {
    throw new Error(`Unknown entity: ${entityName}`);
  }

  return base44.entities[entityName].create({
    ...data,
    owner_email: ownerEmail,
  });
}

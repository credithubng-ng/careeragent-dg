import { base44 } from "@/api/base44Client";

/**
 * Data Cleanup Module
 *
 * Identifies and removes placeholder, demo, sample and test records.
 * Only affects records owned by the authenticated user.
 * Idempotent — safe to run multiple times.
 */

// Keywords that indicate a record is placeholder/demo data
const PLACEHOLDER_KEYWORDS = [
  "sample", "demo", "dummy", "mock", "placeholder", "lorem ipsum",
  "john doe", "jane doe", "acme", "abc company", "example company",
  "test dg role", "test candidate", "test cv", "test job",
  "test employer", "test application", "test interview",
];

// Email domains associated with fake/test data
const PLACEHOLDER_EMAIL_DOMAINS = [
  "example.com", "test.com", "fake.com", "dummy.com", "sample.com",
];

// Employers created as seed data during development
const SEED_EMPLOYERS = [
  "continental bank eu", "metro retail group", "polaris energy",
  "vega consulting", "atlas capital", "small charity trust",
  "defence data services", "nova bank", "brighton council",
  "quantix tech", "helix insurance", "orbit health",
  "twentysix recruitment",
];

const CLEANUP_ENTITIES = [
  "Candidate", "CV", "Job", "Application", "ApplicationDocument",
  "JobMatch", "Interview", "Contact", "Task", "JobSource", "Notification",
];

function isPlaceholderText(value) {
  if (!value || typeof value !== "string") return false;
  const lower = value.toLowerCase();
  return PLACEHOLDER_KEYWORDS.some((kw) => lower.includes(kw));
}

function isPlaceholderEmail(email) {
  if (!email) return false;
  const lower = email.toLowerCase();
  return PLACEHOLDER_EMAIL_DOMAINS.some((d) => lower.endsWith("@" + d));
}

function isSeedEmployer(employer) {
  if (!employer) return false;
  return SEED_EMPLOYERS.includes(employer.toLowerCase());
}

function getRecordLabel(record) {
  return (
    record.job_title || record.cv_name || record.full_name ||
    record.name || record.source_name || record.campaign_name ||
    record.title || record.employer || "—"
  );
}

function isPlaceholderRecord(record) {
  const textFields = [
    record.job_title, record.employer, record.cv_name, record.full_name,
    record.name, record.source_name, record.campaign_name, record.title,
    record.email, record.question_text, record.content,
    record.notes,
  ];
  for (const field of textFields) {
    if (isPlaceholderText(field)) return true;
  }
  if (isPlaceholderEmail(record.email)) return true;
  if (isSeedEmployer(record.employer)) return true;
  return false;
}

async function listUserRecords(entityName, ownerEmail) {
  try {
    return await base44.entities[entityName].filter(
      { owner_email: ownerEmail },
      "-created_date",
      500
    );
  } catch {
    return [];
  }
}

/**
 * Scan the user's records and return a preview of what would be removed.
 */
export async function previewDataCleanup(userEmail) {
  const ownerEmail = (userEmail || "").toLowerCase().trim();
  if (!ownerEmail) throw new Error("A signed-in user is required.");

  const preview = {};
  let totalPlaceholder = 0;
  let totalGenuine = 0;

  for (const entity of CLEANUP_ENTITIES) {
    const records = await listUserRecords(entity, ownerEmail);
    const placeholders = records.filter((r) => isPlaceholderRecord(r));
    const genuine = records.filter((r) => !isPlaceholderRecord(r));

    preview[entity] = {
      total: records.length,
      placeholder: placeholders.length,
      genuine: genuine.length,
      placeholderItems: placeholders.slice(0, 10).map((r) => ({
        id: r.id,
        label: getRecordLabel(r),
      })),
    };
    totalPlaceholder += placeholders.length;
    totalGenuine += genuine.length;
  }

  // Check for orphaned documents (job no longer exists)
  const jobs = await listUserRecords("Job", ownerEmail);
  const jobIds = new Set(jobs.map((j) => j.id));
  const docs = await listUserRecords("ApplicationDocument", ownerEmail);
  const orphanedDocs = docs.filter((d) => d.job_id && !jobIds.has(d.job_id));
  preview._orphanedDocuments = {
    count: orphanedDocs.length,
    items: orphanedDocs.slice(0, 10).map((d) => ({
      id: d.id,
      label: d.title || d.document_type || "Untitled",
    })),
  };

  // Check for duplicate candidates (same email)
  const candidates = await listUserRecords("Candidate", ownerEmail);
  const emailMap = {};
  candidates.forEach((c) => {
    if (c.email) {
      const key = c.email.toLowerCase();
      if (!emailMap[key]) emailMap[key] = [];
      emailMap[key].push(c);
    }
  });
  const duplicateCandidates = Object.entries(emailMap)
    .filter(([, list]) => list.length > 1)
    .map(([email, list]) => ({ email, count: list.length, ids: list.map((c) => c.id) }));
  preview._duplicateCandidates = { count: duplicateCandidates.length, items: duplicateCandidates };

  return {
    totalPlaceholder,
    totalGenuine,
    orphanedDocuments: orphanedDocs.length,
    duplicateCandidates: duplicateCandidates.length,
    entities: preview,
  };
}

/**
 * Execute the data cleanup — deletes placeholder records and orphaned documents.
 * Returns a summary of what was removed.
 */
export async function executeDataCleanup(userEmail) {
  const ownerEmail = (userEmail || "").toLowerCase().trim();
  if (!ownerEmail) throw new Error("A signed-in user is required.");

  const preview = await previewDataCleanup(ownerEmail);
  const summary = {
    placeholderRemoved: 0,
    duplicatesResolved: 0,
    genuinePreserved: preview.totalGenuine,
    orphanedRemoved: 0,
    manualReview: [],
  };

  // Delete placeholder records
  for (const entity of CLEANUP_ENTITIES) {
    const entityPreview = preview.entities[entity];
    if (!entityPreview || entityPreview.placeholder === 0) continue;
    for (const item of entityPreview.placeholderItems) {
      try {
        await base44.entities[entity].delete(item.id);
        summary.placeholderRemoved++;
      } catch {
        summary.manualReview.push(`${entity}: "${item.label}" could not be deleted`);
      }
    }
  }

  // Delete orphaned documents
  if (preview._orphanedDocuments?.items) {
    for (const item of preview._orphanedDocuments.items) {
      try {
        await base44.entities.ApplicationDocument.delete(item.id);
        summary.orphanedRemoved++;
      } catch {
        summary.manualReview.push(`Orphaned document "${item.label}" could not be deleted`);
      }
    }
  }

  // Resolve duplicate candidates — keep the most complete, delete others
  if (preview._duplicateCandidates?.items) {
    for (const dup of preview._duplicateCandidates.items) {
      // Keep the first (most recently created), delete the rest
      const toDelete = dup.ids.slice(1);
      for (const id of toDelete) {
        try {
          await base44.entities.Candidate.delete(id);
          summary.duplicatesResolved++;
        } catch {
          summary.manualReview.push(`Duplicate candidate ${id} could not be deleted`);
        }
      }
    }
  }

  return summary;
}

/**
 * Preview what the testing reset would remove.
 * Targets records with test indicators that were likely created during controlled testing.
 */
export async function previewTestingReset(userEmail) {
  const ownerEmail = (userEmail || "").toLowerCase().trim();
  if (!ownerEmail) throw new Error("A signed-in user is required.");

  const TEST_ENTITIES = ["Job", "Application", "ApplicationDocument", "JobMatch", "Interview", "Contact", "Task"];
  const preview = {};
  let totalTest = 0;

  for (const entity of TEST_ENTITIES) {
    const records = await listUserRecords(entity, ownerEmail);
    const testRecords = records.filter((r) => isPlaceholderRecord(r));
    preview[entity] = {
      total: records.length,
      testCount: testRecords.length,
      items: testRecords.slice(0, 20).map((r) => ({
        id: r.id,
        label: getRecordLabel(r),
        created: r.created_date?.slice(0, 10),
      })),
    };
    totalTest += testRecords.length;
  }

  return { totalTest, entities: preview };
}

/**
 * Execute the testing reset — removes test records only.
 * Does NOT touch Candidate Profile, Master CV, or Settings.
 */
export async function executeTestingReset(userEmail) {
  const ownerEmail = (userEmail || "").toLowerCase().trim();
  if (!ownerEmail) throw new Error("A signed-in user is required.");

  const preview = await previewTestingReset(ownerEmail);
  let removed = 0;
  const errors = [];

  for (const [entity, data] of Object.entries(preview.entities)) {
    for (const item of data.items) {
      try {
        await base44.entities[entity].delete(item.id);
        removed++;
      } catch {
        errors.push(`${entity}: "${item.label}" could not be deleted`);
      }
    }
  }

  return { removed, errors, preserved: ["Candidate Profile", "Master CV", "Settings"] };
}
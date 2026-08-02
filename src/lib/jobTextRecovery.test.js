import test from "node:test";
import assert from "node:assert/strict";
import { recoverJobFields } from "./jobTextRecovery.js";

test("recovers common LinkedIn heading fields when AI omits them", () => {
  const text = `Head of Data Governance
Example Bank · London, England, United Kingdom · Hybrid
About the job
Responsibilities
Lead the enterprise data governance framework and chair the data council.
What we're looking for
Extensive data governance leadership and stakeholder management experience.
Nice to have
Financial services experience.`;
  const result = recoverJobFields(text, {});
  assert.equal(result.job_title, "Head of Data Governance");
  assert.equal(result.employer, "Example Bank");
  assert.match(result.location, /London/);
  assert.equal(result.work_arrangement, "Hybrid");
  assert.match(result.responsibilities, /enterprise data governance/);
  assert.match(result.essential_requirements, /leadership/);
  assert.match(result.desirable_requirements, /Financial services/);
});

test("does not overwrite stronger AI-extracted values", () => {
  const result = recoverJobFields("Wrong title\nWrong employer", {
    job_title: "Data Governance Director",
    employer: "Correct Employer",
  });
  assert.equal(result.job_title, "Data Governance Director");
  assert.equal(result.employer, "Correct Employer");
});

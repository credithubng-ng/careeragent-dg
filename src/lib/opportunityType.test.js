import test from "node:test";
import assert from "node:assert/strict";
import { classifyOpportunityType } from "./opportunityType.js";

test("preserves an explicit opportunity type", () => {
  assert.equal(classifyOpportunityType({ opportunity_type: "Consulting Engagement", employment_type: "Permanent" }), "Consulting Engagement");
});

test("classifies direct advisory and maturity-assessment work as consulting", () => {
  assert.equal(classifyOpportunityType({ job_title: "Data Governance Advisory Lead" }), "Consulting Engagement");
  assert.equal(classifyOpportunityType({ job_description: "Invitation to tender for a Data Governance maturity assessment" }), "Consulting Engagement");
});

test("keeps interim work separate from consulting engagements", () => {
  assert.equal(classifyOpportunityType({ job_title: "Head of Data Governance", employment_type: "Interim" }), "Contract or Interim");
});

test("defaults ordinary vacancies to permanent employment", () => {
  assert.equal(classifyOpportunityType({ job_title: "Data Governance Manager", employment_type: "Permanent" }), "Permanent Employment");
});

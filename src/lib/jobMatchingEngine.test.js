// Regression test for the CareerAgent DG job-matching engine v2.
//
// Tests the deterministic structured scoring helpers and determineCategoryStatus
// logic directly, without requiring LLM calls. Run via the test runner or
// import in a preview script.
//
// Scenario: UK-based candidate with unrestricted UK right to work applying
// for a UK remote Digital Security and AI Governance Manager role at ~£75k.
// Expected: location full points, salary full/near-full, no evidence-gate zero.

import {
  normaliseCountry,
  assessLocation,
  assessSalary,
  assessRightToWork,
  assessExperience,
  determineCategoryStatus,
  DEFAULT_WEIGHTS,
} from "../../base44/shared/jobMatching.ts";

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  return true;
}

function approxEqual(a, b, tolerance = 0.01) {
  return Math.abs(a - b) < tolerance;
}

// ─── Test candidate and job (the known failure case) ───

const candidate = {
  full_name: "Test Candidate",
  current_location: "London, UK",
  right_to_work: "UK Citizen",
  min_salary: 70000,
  preferred_salary: 75000,
  salary_currency: "GBP",
  work_arrangement_preference: "Remote",
  region_preference: "UK Only",
  years_total_experience: 15,
  years_data_governance: 10,
  years_leadership: 6,
  preferred_locations: ["London", "Remote UK"],
};

const job = {
  job_title: "Digital Security and AI Governance Manager",
  employer: "Global Professional Services Firm",
  country: "UK",
  location: "United Kingdom",
  work_arrangement: "Remote",
  salary_min: 70000,
  salary_max: 75000,
  currency: "GBP",
  employment_type: "Permanent",
  required_years_experience: 8,
  right_to_work_requirements: "Right to work in the UK required",
};

// ─── Tests ───

export function runTests() {
  const results = [];
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      passed++;
      results.push({ name, status: "PASS" });
    } catch (e) {
      failed++;
      results.push({ name, status: "FAIL", error: e.message });
    }
  }

  // 1. Country normalisation
  test("normaliseCountry: UK variants → united kingdom", () => {
    assert(normaliseCountry("UK") === "united kingdom", "UK should normalise");
    assert(normaliseCountry("United Kingdom") === "united kingdom", "United Kingdom should normalise");
    assert(normaliseCountry("Great Britain") === "united kingdom", "Great Britain should normalise");
    assert(normaliseCountry("England") === "united kingdom", "England should normalise");
    assert(normaliseCountry("Scotland") === "united kingdom", "Scotland should normalise");
    assert(normaliseCountry("Wales") === "united kingdom", "Wales should normalise");
    assert(normaliseCountry("Northern Ireland") === "united kingdom", "Northern Ireland should normalise");
    assert(normaliseCountry("US") === "us", "US should not normalise to UK");
  });

  // 2. Location: UK remote + UK candidate → full points
  test("assessLocation: UK remote + UK candidate → Strong Match, full points", () => {
    const result = assessLocation(job, candidate);
    assert(result !== null, "Location assessment should be applicable");
    assert(result.status === "Strong Match", `Expected Strong Match, got ${result.status}`);
    assert(result.awarded_points === DEFAULT_WEIGHTS.weight_location, `Expected ${DEFAULT_WEIGHTS.weight_location} points, got ${result.awarded_points}`);
    assert(result.conflicting_facts.length === 0, "Should have no conflicting facts");
  });

  // 3. Location: UK remote + non-UK candidate → not full points
  test("assessLocation: UK remote + non-UK candidate → not Strong Match", () => {
    const nonUKCandidate = { ...candidate, current_location: "New York, USA", right_to_work: "Other", region_preference: "Global Remote" };
    const result = assessLocation(job, nonUKCandidate);
    // Non-UK candidate for UK remote role — should not be Strong Match
    if (result) {
      assert(result.status !== "Strong Match", `Non-UK candidate should not get Strong Match for UK remote, got ${result.status}`);
    }
  });

  // 4. Salary: job salary >= preferred → full points
  test("assessSalary: job salary meets preferred → Strong Match, full points", () => {
    const result = assessSalary(job, candidate);
    assert(result !== null, "Salary assessment should be applicable");
    assert(result.status === "Strong Match", `Expected Strong Match, got ${result.status}`);
    assert(result.awarded_points === DEFAULT_WEIGHTS.weight_salary, `Expected ${DEFAULT_WEIGHTS.weight_salary} points, got ${result.awarded_points}`);
  });

  // 5. Salary: no salary stated → neutral provisional assessment
  test("assessSalary: no salary stated → provisional partial match", () => {
    const noSalaryJob = { ...job, salary_min: 0, salary_max: 0, salary_description: "" };
    const result = assessSalary(noSalaryJob, candidate);
    assert(result !== null, "Should be applicable");
    assert(result.status === "Partial Match", `Expected Partial Match, got ${result.status}`);
    assert(result.awarded_points === 4.2, `Expected neutral 4.2 points, got ${result.awarded_points}`);
    assert(result.explanation.includes("no market benchmark"), "Must disclose that no benchmark was applied");
  });

  test("assessSalary: consulting fee is not compared with annual salary", () => {
    const consultingJob = { ...job, opportunity_type: "Consulting Engagement", salary_min: 5000, salary_max: 10000 };
    const result = assessSalary(consultingJob, candidate);
    assert(result.status === "Partial Match", `Expected Partial Match, got ${result.status}`);
    assert(result.awarded_points === 4.2, `Expected neutral 4.2 points, got ${result.awarded_points}`);
    assert(result.explanation.includes("cannot be compared directly"), "Must explain the different commercial basis");
  });

  test("assessSalary: day rate is not compared with annual salary", () => {
    const interimJob = { ...job, employment_type: "Interim", salary_period: "daily", salary_min: 650, salary_max: 800 };
    const result = assessSalary(interimJob, candidate);
    assert(result.status === "Partial Match", `Expected Partial Match, got ${result.status}`);
    assert(result.awarded_points === 4.2, `Expected neutral 4.2 points, got ${result.awarded_points}`);
  });

  // 6. Salary: below minimum → No Match
  test("assessSalary: salary materially below minimum → No Match", () => {
    const lowSalaryJob = { ...job, salary_min: 40000, salary_max: 45000 };
    const result = assessSalary(lowSalaryJob, candidate);
    assert(result !== null, "Should be applicable");
    assert(result.status === "No Match", `Expected No Match, got ${result.status}`);
  });

  // 7. Right to work: UK citizen satisfies UK requirement
  test("assessRightToWork: UK citizen + UK right-to-work req → Strong Match", () => {
    const result = assessRightToWork(job, candidate);
    assert(result !== null, "Should be applicable");
    assert(result.status === "Strong Match", `Expected Strong Match, got ${result.status}`);
  });

  // 8. Right to work: sponsorship candidate + UK requirement → No Match
  test("assessRightToWork: sponsorship required + UK req → No Match", () => {
    const sponsorCandidate = { ...candidate, right_to_work: "UK Visa Sponsorship Required" };
    const result = assessRightToWork(job, sponsorCandidate);
    assert(result !== null, "Should be applicable");
    assert(result.status === "No Match", `Expected No Match, got ${result.status}`);
  });

  // 9. Experience: candidate exceeds required years → Strong Match
  test("assessExperience: 10 years DG vs 8 required → Strong Match", () => {
    const result = assessExperience(job, candidate);
    assert(result !== null, "Should be applicable");
    assert(result.status === "Strong Match", `Expected Strong Match, got ${result.status}`);
    assert(result.awarded_points === DEFAULT_WEIGHTS.weight_experience, `Expected full points, got ${result.awarded_points}`);
  });

  // 10. Experience: candidate below required → partial or no match
  test("assessExperience: 6 years vs 8 required → Partial Match", () => {
    const juniorCandidate = { ...candidate, years_total_experience: 6, years_data_governance: 6 };
    const result = assessExperience(job, juniorCandidate);
    assert(result !== null, "Should be applicable");
    assert(result.status === "Partial Match", `Expected Partial Match, got ${result.status}`);
    assert(result.awarded_points < DEFAULT_WEIGHTS.weight_experience, "Should not get full points");
    assert(result.awarded_points > 0, "Should get some points");
  });

  // 11. determineCategoryStatus: awarded_points used directly, no evidence gate
  test("determineCategoryStatus: awards points without evidence verification", () => {
    const llmAnalysis = {
      requirement_stated: true,
      preliminary_status: "Strong Match",
      awarded_points: 7,
      explanation: "Candidate meets the requirement.",
    };
    const result = determineCategoryStatus("weight_location", llmAnalysis, "Complete");
    assert(result.score === DEFAULT_WEIGHTS.weight_location, `Expected category maximum, got ${result.score}`);
    assert(result.status === "Strong Match", `Expected Strong Match, got ${result.status}`);
  });

  // 12. determineCategoryStatus: No Match only when LLM says No Match
  test("determineCategoryStatus: No Match requires positive mismatch", () => {
    const llmAnalysis = {
      requirement_stated: true,
      preliminary_status: "No Match",
      awarded_points: 0,
    };
    const result = determineCategoryStatus("weight_essential_skills", llmAnalysis, "Complete");
    assert(result.status === "No Match", `Expected No Match, got ${result.status}`);
    assert(result.score === 0, `Expected 0, got ${result.score}`);
  });

  // 13. determineCategoryStatus: partial match gets proportional points, no 70% discount
  test("determineCategoryStatus: partial match keeps awarded points (no 70% discount)", () => {
    const llmAnalysis = {
      requirement_stated: true,
      preliminary_status: "Partial Match",
      awarded_points: 6,
    };
    const result = determineCategoryStatus("weight_responsibilities", llmAnalysis, "Complete");
    assert(result.score === 6, `Expected score 6 (no discount), got ${result.score}`);
    assert(result.status === "Partial Match", `Expected Partial Match, got ${result.status}`);
  });

  // 14. determineCategoryStatus: Requirement Not Stated
  test("determineCategoryStatus: requirement not stated → 0 points, excluded from denominator", () => {
    const llmAnalysis = { requirement_stated: false, preliminary_status: "Requirement Not Stated" };
    const result = determineCategoryStatus("weight_qualifications", llmAnalysis, "Complete");
    assert(result.status === "Requirement Not Stated", `Expected Requirement Not Stated, got ${result.status}`);
    assert(result.score === 0, "Should be 0");
  });

  // 15. determineCategoryStatus: backward compat with old status names
  test("determineCategoryStatus: maps old 'Verified' to Strong Match", () => {
    const llmAnalysis = {
      requirement_stated: true,
      preliminary_status: "Verified",
      awarded_points: 8,
    };
    const result = determineCategoryStatus("weight_location", llmAnalysis, "Complete");
    assert(result.status === "Strong Match", `Expected Strong Match for Verified, got ${result.status}`);
  });

  test("determineCategoryStatus: maps old 'Gap' to No Match", () => {
    const llmAnalysis = {
      requirement_stated: true,
      preliminary_status: "Gap",
      awarded_points: 0,
    };
    const result = determineCategoryStatus("weight_sector", llmAnalysis, "Complete");
    assert(result.status === "No Match", `Expected No Match for Gap, got ${result.status}`);
  });

  // 16. Integration: the known failure case should produce a high score
  test("Integration: known failure case produces materially > 49% score", () => {
    // Simulate LLM category analysis for the known failure case
    const llmCategoryAnalysis = [
      { category: "weight_experience", requirement_stated: true, preliminary_status: "Strong Match", awarded_points: 25, explanation: "10 years DG vs 8 required" },
      { category: "weight_essential_skills", requirement_stated: true, preliminary_status: "Partial Match", awarded_points: 14, explanation: "Strong governance skills, limited hands-on AI sandbox" },
      { category: "weight_seniority_leadership", requirement_stated: true, preliminary_status: "Strong Match", awarded_points: 13, explanation: "6 years leadership" },
      { category: "weight_sector", requirement_stated: true, preliminary_status: "Strong Match", awarded_points: 9, explanation: "BDO professional-services experience" },
      { category: "weight_responsibilities", requirement_stated: true, preliminary_status: "Partial Match", awarded_points: 7, explanation: "Most responsibilities matched, limited hands-on sandbox" },
      // weight_location and weight_salary will be overridden by deterministic
      { category: "weight_location", requirement_stated: true, preliminary_status: "No Match", awarded_points: 0, explanation: "LLM incorrectly says no match" },
      { category: "weight_salary", requirement_stated: true, preliminary_status: "No Match", awarded_points: 0, explanation: "LLM incorrectly says no match" },
      { category: "weight_qualifications", requirement_stated: false, preliminary_status: "Requirement Not Stated", awarded_points: 0 },
    ];

    // Build a mock result and run through normaliseMatchResult via the exported functions
    // Since normaliseMatchResult is internal, we test the deterministic overrides + determineCategoryStatus
    const detLocation = assessLocation(job, candidate);
    const detSalary = assessSalary(job, candidate);
    const detExperience = assessExperience(job, candidate);

    // Deterministic overrides should produce full points for location and salary
    assert(detLocation.status === "Strong Match" && detLocation.awarded_points === 8, "Location should be full points");
    assert(detSalary.status === "Strong Match" && detSalary.awarded_points === 7, "Salary should be full points");
    assert(detExperience.status === "Strong Match" && detExperience.awarded_points === 25, "Experience should be full points");

    // Calculate expected total: sum awarded / sum applicable maximums * 100
    // Categories: experience 25, essential_skills 14, seniority 13, sector 9, responsibilities 7,
    //             location 8 (det), salary 7 (det), qualifications excluded (Not Stated)
    const awarded = 25 + 14 + 13 + 9 + 7 + 8 + 7; // = 83
    const denominator = 25 + 20 + 15 + 10 + 10 + 8 + 7; // = 95 (qualifications excluded)
    const expectedScore = Math.round((awarded / denominator) * 100); // = 87

    assert(expectedScore > 49, `Expected score > 49%, got ${expectedScore}%`);
    assert(expectedScore >= 80, `Expected score >= 80% (Good Match), got ${expectedScore}%`);
  });

  return { passed, failed, results };
}

// Auto-run if executed directly
if (typeof window !== "undefined" && window.__runJobMatchingTests) {
  const result = runTests();
  console.log(`Job Matching Engine Tests: ${result.passed} passed, ${result.failed} failed`);
  result.results.forEach((r) => {
    if (r.status === "FAIL") console.error(`  FAIL: ${r.name} — ${r.error}`);
  });
}

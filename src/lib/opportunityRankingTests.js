import { rankOpportunity, assessRightToWork } from "./opportunityRanking";

/**
 * Internal validation for the opportunity-ranking and right-to-work logic.
 *
 * Run via:  import { runRankingTests } from "@/lib/opportunityRankingTests";
 *           runRankingTests();
 *
 * Returns { total, passed, failed, results }.
 */
function makeJob(overrides = {}) {
  return {
    job_title: "Data Governance Manager",
    employer: "Test Co",
    job_description: "Data governance role.",
    closing_date: null,
    salary_min: 60000,
    salary_max: 80000,
    ...overrides,
  };
}

function makeMatch(overrides = {}) {
  return {
    total_score: 80,
    confidence: "High",
    strong_reasons: ["Strong DG experience"],
    hard_stops: [],
    ...overrides,
  };
}

function makeCandidate(overrides = {}) {
  return {
    full_name: "Test Candidate",
    right_to_work: "UK Citizen",
    min_salary: 50000,
    ...overrides,
  };
}

function expect_(testName, condition, detail = "") {
  return { testName, passed: Boolean(condition), detail };
}

export function runRankingTests() {
  const results = [];

  // 1. British citizen + advert says no sponsorship: no hard stop.
  {
    const job = makeJob({
      right_to_work_requirements: "No sponsorship available for this role.",
    });
    const candidate = makeCandidate({ right_to_work: "UK Citizen" });
    const rtw = assessRightToWork(job, candidate);
    results.push(
      expect_(
        "British citizen + no sponsorship: no hard stop",
        rtw.hardStops.length === 0,
        `hardStops: ${JSON.stringify(rtw.hardStops)}`
      )
    );
  }

  // 2. Sponsorship required + advert says no sponsorship: hard stop.
  {
    const job = makeJob({
      right_to_work_requirements: "No sponsorship available.",
    });
    const candidate = makeCandidate({
      right_to_work: "UK Visa Sponsorship Required",
    });
    const rtw = assessRightToWork(job, candidate);
    results.push(
      expect_(
        "Sponsorship required + no sponsorship: hard stop",
        rtw.hardStops.length > 0,
        `hardStops: ${JSON.stringify(rtw.hardStops)}`
      )
    );
  }

  // 3. Sponsorship required + advert offers sponsorship: no hard stop.
  {
    const job = makeJob({
      job_description: "Skilled Worker sponsorship available for this role.",
    });
    const candidate = makeCandidate({
      right_to_work: "UK Visa Sponsorship Required",
    });
    const rtw = assessRightToWork(job, candidate);
    results.push(
      expect_(
        "Sponsorship required + offers sponsorship: no hard stop",
        rtw.hardStops.length === 0,
        `hardStops: ${JSON.stringify(rtw.hardStops)}`
      )
    );
  }

  // 4. Sponsorship required + advert silent: confirmation warning, not rejection.
  {
    const job = makeJob({
      job_description: "Data governance manager role in London.",
    });
    const candidate = makeCandidate({
      right_to_work: "UK Visa Sponsorship Required",
    });
    const rtw = assessRightToWork(job, candidate);
    results.push(
      expect_(
        "Sponsorship required + silent: warning not hard stop",
        rtw.hardStops.length === 0 && rtw.warnings.length > 0,
        `hardStops: ${JSON.stringify(rtw.hardStops)}, warnings: ${JSON.stringify(rtw.warnings)}`
      )
    );
  }

  // 5. No closing date + manually confirmed active: Ready to Apply permitted.
  {
    const job = makeJob({
      closing_date: null,
      vacancy_confirmed_active: true,
    });
    const rank = rankOpportunity(job, makeMatch(), makeCandidate());
    const blockedByClosing = rank.blockingReasons.some((r) =>
      r.includes("Closing date")
    );
    const hasVacancyWarning = rank.confirmationWarnings.some((w) =>
      w.includes("confirm the vacancy")
    );
    results.push(
      expect_(
        "No closing date + confirmed active: not blocked",
        !blockedByClosing && !hasVacancyWarning,
        `blockingReasons: ${JSON.stringify(rank.blockingReasons)}, warnings: ${JSON.stringify(rank.confirmationWarnings)}`
      )
    );
  }

  // 6. No closing date + not confirmed active: warning shown (readiness blocks).
  {
    const job = makeJob({
      closing_date: null,
      vacancy_confirmed_active: false,
    });
    const rank = rankOpportunity(job, makeMatch(), makeCandidate());
    const hasVacancyWarning = rank.confirmationWarnings.some((w) =>
      w.includes("confirm the vacancy")
    );
    results.push(
      expect_(
        "No closing date + not confirmed: warning shown",
        hasVacancyWarning,
        `warnings: ${JSON.stringify(rank.confirmationWarnings)}`
      )
    );
  }

  // 7. Closing date yesterday: expired and blocked.
  {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const job = makeJob({
      closing_date: yesterday.toISOString().slice(0, 10),
    });
    const rank = rankOpportunity(job, makeMatch(), makeCandidate());
    results.push(
      expect_(
        "Closing date yesterday: blocked",
        rank.blockingReasons.some((r) => r.includes("Closing date has passed")),
        `blockingReasons: ${JSON.stringify(rank.blockingReasons)}`
      )
    );
  }

  // 8. Closing date today: permitted.
  {
    const today = new Date().toISOString().slice(0, 10);
    const job = makeJob({ closing_date: today });
    const rank = rankOpportunity(job, makeMatch(), makeCandidate());
    results.push(
      expect_(
        "Closing date today: not blocked by deadline",
        !rank.blockingReasons.some((r) => r.includes("Closing date has passed")),
        `blockingReasons: ${JSON.stringify(rank.blockingReasons)}`
      )
    );
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  return { total: results.length, passed, failed, results };
}
import { runTests as runMatchingTests } from "../src/lib/jobMatchingEngine.test.js";
import { runRankingTests } from "../src/lib/opportunityRankingTests.js";

const suites = [
  ["Job matching engine", runMatchingTests()],
  ["Opportunity ranking", runRankingTests()],
];

let failed = 0;
for (const [name, result] of suites) {
  const total = result.total ?? result.passed + result.failed;
  console.log(`${name}: ${result.passed}/${total} passed`);
  for (const item of result.results.filter((entry) => entry.status === "FAIL" || entry.passed === false)) {
    failed += 1;
    console.error(`  FAIL: ${item.name || item.testName} — ${item.error || item.detail || "No detail"}`);
  }
}

if (failed > 0) process.exitCode = 1;

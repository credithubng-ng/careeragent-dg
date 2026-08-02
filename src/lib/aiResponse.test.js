import test from "node:test";
import assert from "node:assert/strict";
import {
  extractTextResponse,
  requireAIObject,
  requireJobExtraction,
  requireMatchResult,
  unwrapAIObject,
} from "./aiResponse.js";

test("unwrapAIObject accepts direct structured output", () => {
  const response = { job_title: "Head of Data Governance" };
  assert.deepEqual(unwrapAIObject(response), response);
});

test("unwrapAIObject handles nested SDK envelopes and JSON fences", () => {
  const response = { data: { output: "```json\n{\"job_title\":\"Data Governance Lead\"}\n```" } };
  assert.equal(unwrapAIObject(response).job_title, "Data Governance Lead");
});

test("requireAIObject rejects unreadable output with a recoverable message", () => {
  assert.throws(
    () => requireAIObject("not json", "job extraction"),
    /Please try again/
  );
});

test("requireJobExtraction rejects an empty or unrelated response", () => {
  assert.throws(() => requireJobExtraction({ confidence: "Low" }), /could not identify a job/);
});

test("extractTextResponse reads direct and enveloped document text", () => {
  assert.equal(extractTextResponse({ output: { text: "  vacancy text  " } }), "vacancy text");
  assert.equal(extractTextResponse({ data: { content: "job advert" } }), "job advert");
});

test("requireMatchResult preserves valid matches and normalises numeric scores", () => {
  const result = requireMatchResult({ total_score: "82", recommendation: "Strong Match" });
  assert.equal(result.total_score, 82);
});

test("requireMatchResult blocks malformed matches before persistence", () => {
  assert.throws(
    () => requireMatchResult({ total_score: 140, recommendation: "Strong Match" }),
    /valid score and recommendation/
  );
  assert.throws(
    () => requireMatchResult({ total_score: 72 }),
    /valid score and recommendation/
  );
});

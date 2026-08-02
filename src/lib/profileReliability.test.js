import test from "node:test";
import assert from "node:assert/strict";
import { assertJobOwner, getMatchingProfile } from "./profileReliability.js";

const candidate = { id: "candidate-1", owner_email: "vortexngn@gmail.com" };
const master = {
  id: "cv-master",
  owner_email: "VORTEXNGN@gmail.com",
  is_master: true,
  processing_status: "Ready",
  extracted_cv_text: "Career evidence",
};

test("getMatchingProfile selects Angel's processed Master CV", () => {
  const profile = getMatchingProfile(candidate, [master]);
  assert.equal(profile.masterCV.id, "cv-master");
  assert.equal(profile.ownerEmail, "vortexngn@gmail.com");
});

test("getMatchingProfile excludes ready CVs owned by another account", () => {
  const otherCV = { ...master, owner_email: "someone@example.com" };
  assert.throws(() => getMatchingProfile(candidate, [otherCV]), /Master CV could not be found/);
});

test("assertJobOwner blocks cross-account matching", () => {
  assert.throws(
    () => assertJobOwner({ owner_email: "someone@example.com" }, candidate.owner_email),
    /does not belong/
  );
  assert.doesNotThrow(() => assertJobOwner({ owner_email: "vortexngn@gmail.com" }, candidate.owner_email));
});

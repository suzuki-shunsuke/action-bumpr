import assert from "node:assert/strict";
import { test } from "node:test";
import { latestTag, nextTag } from "./version.ts";

test("latestTag", () => {
  assert.equal(latestTag([]), undefined);
  assert.equal(latestTag(["foo", ""]), undefined);
  assert.equal(
    latestTag(["v1.2.3", "v1.10.0", "v1.9.9", "v1", "latest", ""]),
    "v1.10.0",
  );
  assert.equal(latestTag(["v2.0.0-rc.1", "v1.9.9"]), "v2.0.0-rc.1");
  assert.equal(latestTag(["v2.0.0-rc.1", "v2.0.0"]), "v2.0.0");
  assert.equal(latestTag(["1.0.0", "v0.9.0"]), "1.0.0");
});

test("nextTag", () => {
  assert.equal(nextTag("v1.2.3", "patch"), "v1.2.4");
  assert.equal(nextTag("v1.2.3", "minor"), "v1.3.0");
  assert.equal(nextTag("v1.2.3", "major"), "v2.0.0");
  assert.equal(nextTag("1.2.3", "patch"), "1.2.4");
  assert.equal(nextTag("v1.2.3-rc.1", "patch"), "v1.2.3");
  assert.equal(nextTag("v1.2.3-rc.1", "minor"), "v1.3.0");
  assert.equal(nextTag("v1.2.3+build", "patch"), "v1.2.4");
  assert.throws(() => nextTag("foo", "patch"));
});

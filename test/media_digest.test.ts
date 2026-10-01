import assert from "node:assert/strict";
import test from "node:test";
import { prepareCreatorDigest } from "../src/media_digest.js";

test("a digest includes ready lessons and excludes media still processing", () => {
  const digest = prepareCreatorDigest({
    digest_id: "week-2026-09-11",
    course_title: "Practical Sound Design",
    subscribers: ["learner@example.edu"],
    assets: [
      { asset_id: "lesson-7", title: "Equalization", kind: "lesson", status: "ready", watch_url: "https://learn.example.edu/7" },
      { asset_id: "workshop-8", title: "Mix review", kind: "workshop", status: "processing", watch_url: "https://learn.example.edu/8" },
    ],
  });

  assert.ok(digest);
  assert.deepEqual(digest.included_asset_ids, ["lesson-7"]);
  assert.match(digest.html, /Equalization/);
  assert.doesNotMatch(digest.html, /Mix review/);
});

test("a digest is skipped until at least one media asset is ready", () => {
  const digest = prepareCreatorDigest({
    digest_id: "week-2026-09-11",
    course_title: "Practical Sound Design",
    subscribers: ["learner@example.edu"],
    assets: [
      { asset_id: "lesson-9", title: "Compression", kind: "lesson", status: "ingested", watch_url: "https://learn.example.edu/9" },
    ],
  });

  assert.equal(digest, null);
});

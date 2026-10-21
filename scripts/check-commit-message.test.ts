import { describe, expect, it } from "bun:test";
import { commitHeaderProblem } from "./check-commit-message";

describe("commit message and PR title convention", () => {
  it.each([
    "✨ feat(extension): run Check Dead Links as a background job",
    "🐛 fix: keep the raw request path out of the HTML",
    "♻️ refactor(extension)!: rename the job store",
    "👷 ci(extension): measure unit test coverage (#744)",
    "Merge remote-tracking branch 'origin/main' into feat/x",
    "fixup! ✨ feat: something",
  ])("accepts %s", (header) => {
    expect(commitHeaderProblem(header)).toBeUndefined();
  });

  it.each([
    ["feat: no emoji", /expected/],
    ["✨ feature(extension): unknown type", /unknown type "feature"/],
    ["✨ feat(extension) missing colon", /expected/],
    ["✨ feat(extension):  ", /expected/],
    [`✨ feat: ${"x".repeat(200)}`, /characters/],
  ])("rejects %s", (header, problem) => {
    expect(commitHeaderProblem(header)).toMatch(problem);
  });
});

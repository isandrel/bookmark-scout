import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import dashboardLimits from "../store/dashboard-limits.toml";

/**
 * The blocks in store/ that are pasted into the Chrome Web Store dashboard must fit its fields
 * (limits in store/dashboard-limits.toml). Optional host access has no dashboard field, so its
 * blocks only serve Edge and AMO reviewers and are not limited here.
 */
const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const limits = dashboardLimits as {
  chrome_web_store: {
    single_purpose: number;
    permission_justification: number;
    test_instructions: number;
  };
};
const chrome = limits.chrome_web_store;

/** Each heading's first ```text block, in document order (headings of the given level, e.g. "###"). */
function textBlocks(markdown: string, headingLevel: string): { heading: string; text: string }[] {
  const blocks: { heading: string; text: string }[] = [];
  let heading: string | undefined;
  let lines: string[] | undefined;
  for (const line of markdown.split("\n")) {
    if (lines) {
      if (line.startsWith("```")) {
        blocks.push({ heading: heading as string, text: lines.join("\n") });
        lines = undefined;
        heading = undefined;
      } else lines.push(line);
    } else if (line.startsWith(`${headingLevel} `)) heading = line.slice(headingLevel.length + 1);
    else if (heading !== undefined && line === "```text") lines = [];
  }
  return blocks;
}

const length = (text: string) => [...text].length;
const permissions = read("store/permissions.md");
const justifications = textBlocks(
  permissions.slice(permissions.indexOf("## Per-permission justification")),
  "###",
).filter(({ heading }) => !heading.startsWith("Optional host access"));

describe("Chrome Web Store dashboard fields fit", () => {
  it("has permission justifications to check", () => {
    expect(justifications.length).toBeGreaterThan(5);
  });

  it.each(justifications.map(({ heading, text }) => [heading, length(text)] as const))(
    "%s justification fits its field",
    (_heading, chars) => {
      expect(chars).toBeLessThanOrEqual(chrome.permission_justification);
    },
  );

  it("single purpose fits its field", () => {
    const [block] = textBlocks(permissions, "##").filter(({ heading }) =>
      heading.startsWith("Chrome Web Store single purpose"),
    );
    expect(block).toBeDefined();
    expect(length(block.text)).toBeLessThanOrEqual(chrome.single_purpose);
  });

  it("test instructions fit their field", () => {
    const checklist = read("store/checklists/chrome-web-store.md");
    const [block] = textBlocks(checklist, "##").filter(({ heading }) =>
      heading.includes("Test instructions"),
    );
    expect(block).toBeDefined();
    expect(length(block.text)).toBeLessThanOrEqual(chrome.test_instructions);
  });
});

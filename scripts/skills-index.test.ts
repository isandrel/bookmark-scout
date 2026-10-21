import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The root AGENTS.md lists every agent skill, so agents find them without browsing: the list must
 * match `.agents/skills/`, and each skill's front matter must name its own folder.
 */
const root = join(import.meta.dir, "..");
const skillsDir = join(root, ".agents/skills");
const folders = readdirSync(skillsDir)
  .filter((entry) => statSync(join(skillsDir, entry)).isDirectory())
  .sort();
const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
const listLine = agents.split("\n").find((line) => line.startsWith("Current skills:")) ?? "";
const listed = [...listLine.matchAll(/`([\w-]+)`/g)].map((match) => match[1]).sort();

describe("agent skills", () => {
  it("AGENTS.md lists exactly the skills in .agents/skills", () => {
    expect(listed).toEqual(folders);
  });

  it.each(folders)("%s/SKILL.md names its folder and says when to use it", (folder) => {
    const text = readFileSync(join(skillsDir, folder, "SKILL.md"), "utf8");
    const frontMatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
    expect(/^name:\s*(.+)$/m.exec(frontMatter)?.[1]?.trim()).toBe(folder);
    expect(/^description:\s*\S/m.test(frontMatter)).toBe(true);
  });
});

import { YAML } from "bun";
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
    const parsed = YAML.parse(frontMatter) as { name?: unknown; description?: unknown };
    expect(parsed.name).toBe(folder);
    // Agents read the parsed value, so YAML must not cut it short: in a plain scalar, " #" starts
    // a comment and ": " a mapping, which once left a description ending mid-sentence.
    const written = /^description:\s*(.+)$/m.exec(frontMatter)?.[1]?.trim();
    expect(typeof parsed.description).toBe("string");
    expect(parsed.description).toBe(written);
  });
});

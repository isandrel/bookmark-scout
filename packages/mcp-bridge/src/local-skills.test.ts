import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "./config";
import { expandHome, readLocalSkills } from "./local-skills";
import { skillsReplySchema } from "./protocol";

let home: string;

const write = (path: string, content: string) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
};
const skillMd = (name: string) => `---\nname: ${name}\ndescription: ${name} skill\n---\nBody`;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bsmcp-skills-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("local skills", () => {
  test("expands ~ to the home folder", () => {
    expect(expandHome("~", "/h")).toBe("/h");
    expect(expandHome("~/skills", "/h")).toBe(join("/h", "skills"));
    expect(expandHome("/abs", "/h")).toBe("/abs");
  });

  test("reads each skill's SKILL.md and text files, never scripts, dot files, or other files", () => {
    const root = join(home, ".agents", "skills");
    write(join(root, "tidy", "SKILL.md"), skillMd("tidy"));
    write(join(root, "tidy", "references", "rules.md"), "rules");
    write(join(root, "tidy", "scripts", "run.sh"), "rm -rf /");
    write(join(root, "tidy", "logo.png"), "png");
    write(join(root, "tidy", ".hidden.md"), "hidden");
    write(join(root, "not-a-skill", "README.md"), "no SKILL.md");
    write(join(home, "outside.md"), "outside");
    symlinkSync(join(home, "outside.md"), join(root, "tidy", "linked.md"));

    const reply = readLocalSkills(["~/.agents/skills"], home);
    expect(skillsReplySchema.parse(reply)).toEqual(reply);
    expect(reply.skills).toEqual([
      {
        name: "tidy",
        folder: "~/.agents/skills",
        files: [
          { path: "SKILL.md", content: skillMd("tidy") },
          { path: "references/rules.md", content: "rules" },
        ],
      },
    ]);
    expect(reply.leftOut).toEqual([]);
  });

  test("takes a folder that is itself a skill, and a linked skill folder", () => {
    write(join(home, "one", "SKILL.md"), skillMd("one"));
    write(join(home, "store", "linked", "SKILL.md"), skillMd("linked"));
    mkdirSync(join(home, "many"));
    symlinkSync(join(home, "store", "linked"), join(home, "many", "linked"));

    const reply = readLocalSkills([join(home, "one"), join(home, "many")], home);
    expect(reply.skills.map((skill) => skill.name)).toEqual(["one", "linked"]);
  });

  test("says which folders and skills it left out, and why", () => {
    const limits = { ...config.skills, max_skills: 2, max_folders: 2, max_file_bytes: 100 };
    write(join(home, "a", "big", "SKILL.md"), "x".repeat(200));
    for (const name of ["s1", "s2", "s3"]) write(join(home, "a", name, "SKILL.md"), skillMd(name));

    const reply = readLocalSkills([join(home, "a"), "~/missing", "~/third"], home, limits);
    expect(reply.skills.map((skill) => skill.name)).toEqual(["s1", "s2"]);
    expect(reply.leftOut).toEqual([
      { folder: join(home, "a"), name: "big", reason: "tooLarge" },
      { folder: join(home, "a"), name: "s3", reason: "tooMany" },
    ]);
    // The limit on left-out entries is max_skills; the folders past it are not listed.
    const folders = readLocalSkills(["~/missing", "~/other", "~/third"], home, limits);
    expect(folders.leftOut).toEqual([
      { folder: "~/missing", reason: "missing" },
      { folder: "~/other", reason: "missing" },
    ]);
  });

  test("leaves out the last skills until the reply fits the browser's message limit", () => {
    for (const name of ["s1", "s2", "s3"]) {
      write(join(home, "a", name, "SKILL.md"), `${skillMd(name)}\n${"x".repeat(400)}`);
    }
    const limits = { ...config.skills, max_reply_bytes: 1600 };
    const reply = readLocalSkills([join(home, "a")], home, limits);
    expect(reply.skills.map((skill) => skill.name)).toEqual(["s1", "s2"]);
    expect(reply.leftOut).toEqual([{ folder: join(home, "a"), name: "s3", reason: "tooLarge" }]);
    expect(Buffer.byteLength(JSON.stringify(reply))).toBeLessThanOrEqual(1600);
  });
});

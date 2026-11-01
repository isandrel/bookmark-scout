/**
 * Ask AI skills from this computer: reads the Agent Skills (agentskills.io) in the folders the
 * extension names, for a one-shot `skills` request. A folder is one skill when it holds a
 * `SKILL.md`, otherwise each folder in it that holds one is a skill. Only text files the model can
 * read are sent, within `[skills]` in config/bridge.toml; scripts are never read or run.
 *
 * Folders the user named and the skill folders in them may be links (skill installers link them);
 * inside a skill, links are not followed, so nothing outside the skill is read.
 */
import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { config } from "./config";
import { type LocalSkill, PROTOCOL_VERSION, type SkillsReply } from "./protocol";

export const SKILL_FILE = "SKILL.md";

type Limits = (typeof config)["skills"];
type LeftOut = SkillsReply["leftOut"][number];

/** `~` and `~/...` are the home folder. */
export function expandHome(folder: string, home: string): string {
  if (folder === "~") return home;
  if (/^~[/\\]/.test(folder)) return join(home, folder.slice(2));
  return folder;
}

const isDirectory = (path: string) => statSync(path, { throwIfNoEntry: false })?.isDirectory();
const isSkill = (path: string) =>
  statSync(join(path, SKILL_FILE), { throwIfNoEntry: false })?.isFile();

/** A skill's files: SKILL.md, then the readable files below it in name order. */
function readSkillFiles(dir: string, limits: Limits): LocalSkill["files"] | "tooLarge" {
  if (statSync(join(dir, SKILL_FILE)).size > limits.max_file_bytes) return "tooLarge";
  const files = [{ path: SKILL_FILE, content: readFileSync(join(dir, SKILL_FILE), "utf8") }];
  const walk = (folder: string, prefix: string, depth: number) => {
    const entries = readdirSync(folder).sort();
    for (const name of entries) {
      if (files.length >= limits.max_files) return;
      if (name.startsWith(".")) continue;
      const path = join(folder, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const entry = lstatSync(path);
      if (entry.isDirectory()) {
        if (depth < limits.max_depth && !limits.skip_folders.includes(name)) {
          walk(path, relative, depth + 1);
        }
      } else if (
        entry.isFile() &&
        relative !== SKILL_FILE &&
        limits.file_extensions.includes(extname(name).toLowerCase()) &&
        entry.size <= limits.max_file_bytes
      ) {
        files.push({ path: relative, content: readFileSync(path, "utf8") });
      }
    }
  };
  walk(dir, "", 0);
  return files;
}

/** The skill folders in a requested folder: itself, or its subfolders that hold a SKILL.md. */
function skillFolders(path: string): string[] {
  if (isSkill(path)) return [path];
  return readdirSync(path)
    .filter((name) => !name.startsWith("."))
    .sort()
    .map((name) => join(path, name))
    .filter((dir) => isDirectory(dir) && isSkill(dir));
}

const replyBytes = (reply: SkillsReply) => Buffer.byteLength(JSON.stringify(reply));

export function readLocalSkills(
  folders: readonly string[],
  home: string,
  limits: Limits = config.skills,
): SkillsReply {
  const skills: LocalSkill[] = [];
  const leftOut: LeftOut[] = [];
  const leave = (entry: LeftOut) => {
    if (leftOut.length < limits.max_skills) leftOut.push(entry);
  };
  for (const [index, folder] of folders.entries()) {
    if (index >= limits.max_folders) {
      leave({ folder, reason: "tooMany" });
      continue;
    }
    const path = resolve(expandHome(folder, home));
    let dirs: string[];
    try {
      if (!isDirectory(path)) {
        leave({ folder, reason: "missing" });
        continue;
      }
      dirs = skillFolders(path);
    } catch {
      leave({ folder, reason: "unreadable" });
      continue;
    }
    for (const dir of dirs) {
      const name = basename(dir);
      if (skills.length >= limits.max_skills) {
        leave({ folder, name, reason: "tooMany" });
        continue;
      }
      try {
        const files = readSkillFiles(dir, limits);
        if (files === "tooLarge") leave({ folder, name, reason: "tooLarge" });
        else skills.push({ name, folder, files });
      } catch {
        leave({ folder, name, reason: "unreadable" });
      }
    }
  }
  const reply: SkillsReply = { type: "skills", protocol: PROTOCOL_VERSION, skills, leftOut };
  // The browser refuses a larger message, so the last skills go until the reply fits.
  while (replyBytes(reply) > limits.max_reply_bytes) {
    const last = skills.pop();
    if (!last) break;
    leftOut.unshift({ folder: last.folder, name: last.name, reason: "tooLarge" });
    if (leftOut.length > limits.max_skills) leftOut.pop();
  }
  return reply;
}

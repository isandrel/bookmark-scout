/**
 * Ask AI's skills: Agent Skills (agentskills.io, a `SKILL.md` per folder) the model reads on
 * demand. The system prompt lists each skill's name and description; the `readSkill` tool returns
 * a skill's instructions, or one of its linked files, when the model picks it (the tool is in
 * `ask-ai-durable.lazy.ts`). Parsing, checking,
 * the catalog, and reads come from agent-skills-ts-sdk. The built-in skills are the folders under
 * src/assets/ask-ai-skills/. A skill's scripts never run: a skill is text for the model.
 */
import {
  createSkillRegistry,
  type SkillContentEntry,
  type SkillRegistry,
  type SkillSource,
  skillSourceFromEntries,
} from 'agent-skills-ts-sdk';

const BUILT_IN_DIR = '../assets/ask-ai-skills/';

const builtInFiles = import.meta.glob<string>('../assets/ask-ai-skills/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The built-in skills' files, grouped by skill folder, with paths relative to that folder. */
function builtInSkillEntries(): Map<string, SkillContentEntry[]> {
  const skills = new Map<string, SkillContentEntry[]>();
  for (const [path, content] of Object.entries(builtInFiles)) {
    const [folder, ...rest] = path.slice(BUILT_IN_DIR.length).split('/');
    const entries = skills.get(folder) ?? [];
    entries.push({ name: rest.join('/'), content });
    skills.set(folder, entries);
  }
  return skills;
}

/** `source` without the skills named in `off`, by the names their SKILL.md gives. */
function withoutTurnedOff(source: SkillSource, off: ReadonlySet<string>): SkillSource {
  const { readResource } = source;
  return {
    id: source.id,
    fingerprint: source.fingerprint,
    list: async () => (await source.list()).filter((skill) => !off.has(skill.name)),
    load: async (name) => (off.has(name) ? null : source.load(name)),
    ...(readResource
      ? { readResource: async (name, path) => (off.has(name) ? null : readResource(name, path)) }
      : {}),
  };
}

/** Where a skill comes from, as the catalog and Options name it. */
export const SKILL_LOCATIONS = { builtIn: 'built-in', user: 'yours', local: 'computer' } as const;

/**
 * Every skill Ask AI can read: the built-in ones, then the user's own (`user`), then those read
 * from folders on this computer (`local`), leaving out those named in `disabled`. A skill whose
 * files do not parse is left out on its own, and of two skills with one name the first is kept.
 */
export function createAskAISkills({
  user = [],
  local = [],
  disabled = [],
}: {
  user?: readonly Pick<UserSkill, 'name' | 'files'>[];
  local?: readonly Pick<UserSkill, 'name' | 'files'>[];
  disabled?: readonly string[];
} = {}): Promise<SkillRegistry> {
  const off = new Set(disabled);
  const builtIn = [...builtInSkillEntries()].flatMap(([folder, entries]) =>
    off.has(folder)
      ? []
      : [
          skillSourceFromEntries(entries, {
            id: `built-in:${folder}`,
            location: SKILL_LOCATIONS.builtIn,
          }),
        ],
  );
  const sources = (
    skills: readonly Pick<UserSkill, 'name' | 'files'>[],
    prefix: string,
    location: (typeof SKILL_LOCATIONS)[keyof typeof SKILL_LOCATIONS],
  ) =>
    skills.flatMap((skill) => {
      if (off.has(skill.name)) return [];
      try {
        const source = skillSourceFromEntries(
          skill.files.map((file) => ({ name: file.path, content: file.content })),
          { id: `${prefix}:${skill.name}`, location },
        );
        // A skill from this computer is named by its folder until its SKILL.md is read, and the
        // user turns it off by the name in its SKILL.md.
        return [withoutTurnedOff(source, off)];
      } catch {
        return [];
      }
    });
  return createSkillRegistry([
    ...builtIn,
    ...sources(user, 'user', SKILL_LOCATIONS.user),
    ...sources(local, 'local', SKILL_LOCATIONS.local),
  ]);
}

/** The built-in skills as files, for Options to show and export. */
export function builtInSkillFiles(): { name: string; files: SkillFile[] }[] {
  return [...builtInSkillEntries()].map(([name, entries]) => ({
    name,
    files: entries.map((entry) => ({ path: entry.name, content: entry.content })),
  }));
}

/** The system prompt part that lists the skills and says how to read them; empty without any. */
export function askAISkillCatalog(skills: SkillRegistry): string {
  return skills.systemPrompt({ toolName: ASK_AI_SKILL_TOOL }) ?? '';
}

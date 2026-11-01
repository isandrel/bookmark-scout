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

/** Where a skill comes from, as the catalog and Options name it. */
export const SKILL_LOCATIONS = { builtIn: 'built-in', user: 'yours' } as const;

/**
 * Every skill Ask AI can read: the built-in ones, then the user's own (`user`), leaving out
 * those named in `disabled`. A skill whose files do not parse is left out on its own.
 */
export function createAskAISkills({
  user = [],
  disabled = [],
}: {
  user?: readonly UserSkill[];
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
  const own = user.flatMap((skill) => {
    if (off.has(skill.name)) return [];
    try {
      return [
        skillSourceFromEntries(
          skill.files.map((file) => ({ name: file.path, content: file.content })),
          { id: `user:${skill.name}`, location: SKILL_LOCATIONS.user },
        ),
      ];
    } catch {
      return [];
    }
  });
  return createSkillRegistry([...builtIn, ...own]);
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

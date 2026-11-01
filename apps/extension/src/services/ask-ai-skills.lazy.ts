/**
 * Ask AI's skills: Agent Skills (agentskills.io, a `SKILL.md` per folder) the model reads on
 * demand. The system prompt lists each skill's name and description; the `readSkill` tool returns
 * a skill's instructions, or one of its linked files, when the model picks it. Parsing, checking,
 * the catalog, and reads come from agent-skills-ts-sdk. The built-in skills are the folders under
 * src/assets/ask-ai-skills/. A skill's scripts never run: a skill is text for the model.
 */
import {
  createSkillRegistry,
  type SkillContentEntry,
  type SkillRegistry,
  skillSourceFromEntries,
} from 'agent-skills-ts-sdk';
import { jsonSchema, type ToolSet, tool } from 'ai';

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

/** Every skill Ask AI can read, built-in first. */
export function createAskAISkills(): Promise<SkillRegistry> {
  const sources = [...builtInSkillEntries()].map(([folder, entries]) =>
    skillSourceFromEntries(entries, { id: `built-in:${folder}`, location: 'built-in' }),
  );
  return createSkillRegistry(sources);
}

/** The system prompt part that lists the skills and says how to read them; empty without any. */
export function askAISkillCatalog(skills: SkillRegistry): string {
  return skills.systemPrompt({ toolName: ASK_AI_SKILL_TOOL }) ?? '';
}

/** The tool that reads a skill's instructions or one of its files; none without skills. */
export function createSkillToolSet(skills: SkillRegistry): ToolSet {
  if (skills.list().length === 0) return {};
  const declaration = skills.readTool({ toolName: ASK_AI_SKILL_TOOL });
  return {
    [ASK_AI_SKILL_TOOL]: tool({
      description: declaration.description,
      inputSchema: jsonSchema<{ name: string; resource?: string }>(
        declaration.parametersJsonSchema,
      ),
      execute: (args) => skills.read(args),
    }),
  };
}

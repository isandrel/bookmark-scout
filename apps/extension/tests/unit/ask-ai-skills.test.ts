import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSkillContent, validateSkillEntries } from 'agent-skills-ts-sdk';
import { describe, expect, it } from 'vitest';
import { agentActionChoices } from '@/services/actions';
import { ASK_AI_SKILL_TOOL } from '@/services/ai-agent';
import { askAISkillCatalog, createAskAISkills } from '@/services/ask-ai-skills.lazy';

const SKILLS_DIR = join(__dirname, '../../src/assets/ask-ai-skills');
const folders = readdirSync(SKILLS_DIR);

describe('built-in Ask AI skills', () => {
  it.each(folders)('%s is a valid Agent Skill named after its folder', (folder) => {
    const content = readFileSync(join(SKILLS_DIR, folder, 'SKILL.md'), 'utf8');
    expect(validateSkillEntries([{ name: 'SKILL.md', content }], { expectedName: folder })).toEqual(
      [],
    );
  });

  it.each(folders)('%s allows only tools Ask AI has', (folder) => {
    const content = readFileSync(join(SKILLS_DIR, folder, 'SKILL.md'), 'utf8');
    const allowed = String(parseSkillContent(content).properties.allowedTools ?? '')
      .split(/\s+/)
      .filter(Boolean);
    expect(allowed.length).toBeGreaterThan(0);
    const tools: readonly string[] = agentActionChoices('askAI');
    for (const name of allowed) expect(tools).toContain(name);
    // Every tool the instructions name in backticks is one it allows.
    for (const [, name] of content.matchAll(/`([a-z][A-Za-z]+)`/g)) {
      if (tools.includes(name)) expect(allowed).toContain(name);
    }
  });
});

describe('Ask AI skill catalog and tool', () => {
  it('lists every built-in skill in the prompt and reads one on demand', async () => {
    const skills = await createAskAISkills();
    expect(skills.list().map((skill) => skill.name)).toEqual(expect.arrayContaining(folders));
    const catalog = askAISkillCatalog(skills);
    for (const folder of folders) expect(catalog).toContain(folder);
    expect(catalog).toContain(ASK_AI_SKILL_TOOL);

    expect(await skills.read({ name: folders[0] })).toMatchObject({ ok: true });
    expect(await skills.read({ name: 'no-such-skill' })).toMatchObject({ ok: false });
  });
});

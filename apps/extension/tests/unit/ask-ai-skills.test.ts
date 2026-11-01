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

const userSkill = (name: string, body = 'Do the thing.') => ({
  name,
  files: [
    {
      path: 'SKILL.md',
      content: `---\nname: ${name}\ndescription: A skill of the user's own.\n---\n\n${body}\n`,
    },
  ],
  updatedAt: 1,
});

describe("the user's own skills", () => {
  it("leaves out the skills turned off, built-in or the user's own", async () => {
    const skills = await createAskAISkills({
      user: [userSkill('my-steps'), userSkill('other-steps')],
      disabled: [folders[0], 'other-steps'],
    });
    const names = skills.list().map((skill) => skill.name);
    expect(names).toContain('my-steps');
    expect(names).not.toContain(folders[0]);
    expect(names).not.toContain('other-steps');
    expect(await skills.read({ name: 'my-steps' })).toMatchObject({ ok: true });
  });

  it('reads skills from this computer after the user’s own, turned off by their SKILL.md names', async () => {
    const fromFolder = (folder: string, name: string) => ({
      name: folder,
      files: [
        {
          path: 'SKILL.md',
          content: `---\nname: ${name}\ndescription: From ${folder}\n---\nSteps`,
        },
      ],
    });
    const skills = await createAskAISkills({
      user: [userSkill('my-steps')],
      local: [
        fromFolder('folder-a', 'local-steps'),
        fromFolder('folder-b', 'my-steps'),
        fromFolder('folder-c', 'off-steps'),
      ],
      disabled: ['off-steps'],
    });
    const listed = skills.list();
    expect(listed.map((entry) => entry.name).sort()).toEqual(
      expect.arrayContaining(['local-steps', 'my-steps']),
    );
    expect(listed.map((entry) => entry.name)).not.toContain('off-steps');
    // The user's own skill keeps its name; the one from this computer is ignored.
    expect(listed.find((entry) => entry.name === 'my-steps')?.sourceId).toBe('user:my-steps');
    expect(listed.find((entry) => entry.name === 'local-steps')?.sourceId).toBe('local:folder-a');
    expect(await skills.read({ name: 'local-steps' })).toMatchObject({ ok: true });
    expect(await skills.read({ name: 'off-steps' })).toMatchObject({ ok: false });
  });

  it('checks a SKILL.md and reads a picked folder relative to it', async () => {
    const { checkSkillFiles, skillFilesFromUpload } = await import(
      '@/services/ask-ai-skill-files.lazy'
    );
    expect(checkSkillFiles(userSkill('fine').files)).toMatchObject({ ok: true, name: 'fine' });
    expect(checkSkillFiles([{ path: 'SKILL.md', content: 'no front matter' }])).toMatchObject({
      ok: false,
    });
    expect(checkSkillFiles([{ path: 'notes.md', content: 'x' }])).toMatchObject({ ok: false });
    const picked = [
      Object.defineProperty(
        new File([userSkill('folder-skill').files[0].content], 'SKILL.md'),
        'webkitRelativePath',
        {
          value: 'folder-skill/SKILL.md',
        },
      ),
      Object.defineProperty(new File(['Details'], 'more.md'), 'webkitRelativePath', {
        value: 'folder-skill/references/more.md',
      }),
    ];
    expect(await skillFilesFromUpload(picked)).toEqual([
      { path: 'SKILL.md', content: userSkill('folder-skill').files[0].content },
      { path: 'references/more.md', content: 'Details' },
    ]);
  });
});

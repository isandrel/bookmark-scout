import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  askAiSkillsValue,
  deleteUserSkill,
  saveUserSkill,
  skillLibraryConfig,
} from '@/lib/ask-ai-skill-library';

const skill = (name: string, content = 'Steps') => ({
  name,
  files: [{ path: 'SKILL.md', content }],
});

beforeEach(() => {
  fakeBrowser.reset();
});

describe("the user's skill library", () => {
  it('saves newest first, replaces a skill by name, and deletes one', async () => {
    expect(await saveUserSkill(skill('one'))).toBeUndefined();
    expect(await saveUserSkill(skill('two'))).toBeUndefined();
    expect(await saveUserSkill(skill('one', 'New steps'))).toBeUndefined();
    const saved = await askAiSkillsValue.get();
    expect(saved.map((entry) => entry.name)).toEqual(['one', 'two']);
    expect(saved[0].files[0].content).toBe('New steps');
    // Renaming in the editor replaces the old one.
    await saveUserSkill(skill('renamed'), 'two');
    expect((await askAiSkillsValue.get()).map((entry) => entry.name)).toEqual(['renamed', 'one']);
    await deleteUserSkill('one');
    expect((await askAiSkillsValue.get()).map((entry) => entry.name)).toEqual(['renamed']);
  });

  it('refuses a skill past the limits', async () => {
    expect(await saveUserSkill(skill('big', 'x'.repeat(skillLibraryConfig.max_skill_chars)))).toBe(
      'tooLarge',
    );
    const files = Array.from({ length: skillLibraryConfig.max_files + 2 }, (_, index) => ({
      path: index === 0 ? 'SKILL.md' : `f${index}.md`,
      content: '',
    }));
    expect(await saveUserSkill({ name: 'many', files })).toBe('tooManyFiles');
    for (let index = 0; index < skillLibraryConfig.max_skills; index += 1) {
      await saveUserSkill(skill(`s${index}`));
    }
    expect(await saveUserSkill(skill('one-more'))).toBe('tooManySkills');
    expect(await askAiSkillsValue.get()).toHaveLength(skillLibraryConfig.max_skills);
  });
});

/**
 * The user's own Ask AI skills (Options > AI > Skills): Agent Skills (agentskills.io), each a
 * `SKILL.md` plus the files it links to, kept on this device and read by the background for each
 * answer (`services/ask-ai-background.ts`). Checking a skill's format needs the skills SDK, so it
 * happens where a skill is saved (`services/ask-ai-skill-files.lazy.ts`); this module only keeps
 * them within `config/ai/skills.toml`, and the background never loads the SDK.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

export const skillLibraryConfig = readConfig(
  'ai/skills',
  z.strictObject({
    max_skills: boundedNumber({ integer: true }),
    max_files: boundedNumber({ integer: true }),
    max_skill_chars: boundedNumber({ integer: true }),
    local_timeout_ms: boundedNumber({ integer: true }),
    local_cache_seconds: boundedNumber({ integer: true }),
  }),
);

/** The file every skill has. */
export const SKILL_FILE = 'SKILL.md';

export type SkillFile = { path: string; content: string };

export type UserSkill = {
  /** The skill's name from its front matter; unique among the user's skills. */
  name: string;
  /** `SKILL.md` first, then its files, with paths relative to the skill. */
  files: SkillFile[];
  updatedAt: number;
};

const skillSchema = z.object({
  name: z.string().regex(SKILL_NAME_PATTERN),
  files: z
    .array(z.object({ path: z.string().min(1), content: z.string() }))
    .min(1)
    .refine((files) => files[0]?.path === SKILL_FILE),
  updatedAt: z.number(),
});

/** Newest first; a malformed skill is dropped on its own. */
export const askAiSkillsValue = defineStoredValue<UserSkill[]>(STORAGE_ITEMS.askAiSkills, {
  parse: (raw) => parseValidList(raw, skillSchema),
  empty: [],
  isEmpty: (skills) => skills.length === 0,
});

export type SkillLimitError = 'tooManySkills' | 'tooManyFiles' | 'tooLarge';

/** Which limit a skill breaks, if any. */
export function skillLimitError(files: readonly SkillFile[]): SkillLimitError | undefined {
  if (files.length - 1 > skillLibraryConfig.max_files) return 'tooManyFiles';
  const chars = files.reduce((sum, file) => sum + file.path.length + file.content.length, 0);
  return chars > skillLibraryConfig.max_skill_chars ? 'tooLarge' : undefined;
}

/**
 * Saves a skill, replacing the one named `replacing` (or of the same name) in place; refuses one
 * past the limits. The caller checked its format.
 */
export async function saveUserSkill(
  skill: Omit<UserSkill, 'updatedAt'>,
  replacing?: string,
): Promise<SkillLimitError | undefined> {
  const limit = skillLimitError(skill.files);
  if (limit) return limit;
  let refused: SkillLimitError | undefined;
  await askAiSkillsValue.update((skills) => {
    const others = skills.filter((other) => other.name !== skill.name && other.name !== replacing);
    if (others.length >= skillLibraryConfig.max_skills) {
      refused = 'tooManySkills';
      return skills;
    }
    return [{ ...skill, updatedAt: Date.now() }, ...others];
  });
  return refused;
}

export function deleteUserSkill(name: string): Promise<UserSkill[]> {
  return askAiSkillsValue.update((skills) => skills.filter((skill) => skill.name !== name));
}

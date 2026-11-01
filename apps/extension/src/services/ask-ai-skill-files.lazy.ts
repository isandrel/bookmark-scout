/**
 * Reading and checking the user's own Ask AI skills where they are saved (Options), with the
 * skills SDK, which the background never loads: a `SKILL.md` typed in the editor, or files and
 * folders the user picks. Like every `*.lazy.ts` file it is left out of auto-imports; import it
 * only with `import()`.
 */
import { readSkillProperties, validateSkillEntries } from 'agent-skills-ts-sdk';

export type CheckedSkill =
  | { ok: true; name: string; description: string; files: SkillFile[] }
  | { ok: false; errors: string[] };

/** A skill's files checked against the Agent Skills format, `SKILL.md` first. */
export function checkSkillFiles(files: readonly SkillFile[]): CheckedSkill {
  const main = files.find((file) => file.path === SKILL_FILE);
  if (!main) return { ok: false, errors: [`${SKILL_FILE} is missing`] };
  const entries = files.map((file) => ({ name: file.path, content: file.content }));
  try {
    const properties = readSkillProperties(entries);
    const errors = validateSkillEntries(entries, { expectedName: properties.name });
    if (errors.length > 0) return { ok: false, errors };
    return {
      ok: true,
      name: properties.name,
      description: properties.description,
      files: [main, ...files.filter((file) => file !== main)],
    };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

/**
 * The files the user picked, as one skill: a folder (paths relative to the folder that holds its
 * `SKILL.md`), or loose files, of which one is `SKILL.md`.
 */
export async function skillFilesFromUpload(picked: readonly File[]): Promise<SkillFile[]> {
  const pathOf = (file: File) => file.webkitRelativePath || file.name;
  const main = picked.find((file) => pathOf(file).split('/').at(-1) === SKILL_FILE);
  const root = main ? pathOf(main).slice(0, -SKILL_FILE.length) : '';
  const inSkill = picked.filter((file) => pathOf(file).startsWith(root));
  return Promise.all(
    inSkill.map(async (file) => ({
      path: pathOf(file).slice(root.length),
      content: await file.text(),
    })),
  );
}

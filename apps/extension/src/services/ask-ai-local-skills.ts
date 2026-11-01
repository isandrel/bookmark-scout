/**
 * Skills From This Computer (Options > AI > Skills): the Agent Skills in folders the user named,
 * read by the bookmark-scout-mcp program (`packages/mcp-bridge`, `local-skills.ts`) in answer to a
 * one-shot native message. It needs the program installed, not access for local agents. The
 * background reads them for each Ask AI answer, reusing them for `local_cache_seconds`; Options
 * reads them to list them. Light enough for the background: no skills SDK here.
 */
import {
  type LocalSkill,
  NATIVE_HOST_NAME,
  PROTOCOL_VERSION,
  type SkillsReply,
  skillsReplySchema,
} from '@bookmark-scout/mcp-bridge/protocol';

export type LocalSkillsResult =
  | { state: 'ready'; skills: LocalSkill[]; leftOut: SkillsReply['leftOut'] }
  /** Off, or the native messaging permission is missing. */
  | { state: 'off' }
  | { state: 'notInstalled' | 'noAnswer' | 'outdated' | 'failed'; detail?: string };

/** The browser's error when no native host of that name is registered. */
const NOT_INSTALLED = /not found|no such native application/i;

let cached: { key: string; at: number; result: LocalSkillsResult } | undefined;

/** Asks the bridge program for the skills in `folders`; never throws. */
export async function readLocalSkills(folders: readonly string[]): Promise<LocalSkillsResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), skillLibraryConfig.local_timeout_ms);
  });
  try {
    const reply = await Promise.race([
      browser.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
        type: 'skills',
        protocol: PROTOCOL_VERSION,
        folders: [...folders],
      }),
      timeout,
    ]);
    if (reply === 'timeout') return { state: 'noAnswer' };
    const parsed = skillsReplySchema.safeParse(reply);
    if (!parsed.success) return { state: 'outdated' };
    if (parsed.data.protocol !== PROTOCOL_VERSION) return { state: 'outdated' };
    return { state: 'ready', skills: parsed.data.skills, leftOut: parsed.data.leftOut };
  } catch (error) {
    const detail = getErrorMessage(error);
    return {
      state: NOT_INSTALLED.test(detail) ? 'notInstalled' : 'failed',
      detail: detail.slice(0, INPUT_LIMITS.chars.agent_bridge_status_detail),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The skills from this computer as the settings ask: none while the setting or the permission is
 * off. Reused for `local_cache_seconds` unless `fresh`.
 */
export async function localSkillsFor(
  settings: Pick<Settings, 'askAiLocalSkills' | 'askAiLocalSkillFolders'>,
  fresh = false,
): Promise<LocalSkillsResult> {
  if (!settings.askAiLocalSkills || !(await hasPermission('localSkills'))) return { state: 'off' };
  const key = settings.askAiLocalSkillFolders.join('\n');
  const now = Date.now();
  if (
    !fresh &&
    cached?.key === key &&
    now - cached.at < skillLibraryConfig.local_cache_seconds * MS_PER_SECOND
  ) {
    return cached.result;
  }
  const result = await readLocalSkills(settings.askAiLocalSkillFolders);
  cached = { key, at: now, result };
  return result;
}

/** The skills of a result, in the shape the skill registry takes. */
export function localSkillFiles(result: LocalSkillsResult): { name: string; files: SkillFile[] }[] {
  return result.state === 'ready'
    ? result.skills.map((skill) => ({ name: skill.name, files: skill.files }))
    : [];
}

/**
 * Skills From This Computer (`services/ask-ai-local-skills.ts`): the one-shot native message to the
 * bridge program, what each answer (or none) means, and when it is asked at all.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PROTOCOL_VERSION } from '@bookmark-scout/mcp-bridge/protocol';
import { parse } from 'smol-toml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getSettingsFieldMeta } from '@/lib/settings-schema';
import { localSkillFiles, localSkillsFor, readLocalSkills } from '@/services/ask-ai-local-skills';
import { appRoot } from '../config-files';
import { installFakePermissions } from '../fake-permissions';

const skill = {
  name: 'tidy',
  folder: '~/.agents/skills',
  files: [{ path: 'SKILL.md', content: '---\nname: tidy-up\ndescription: d\n---\n' }],
};
const reply = { type: 'skills', protocol: PROTOCOL_VERSION, skills: [skill], leftOut: [] };

function stubNative(answer: (message: unknown) => Promise<unknown>) {
  const send = vi.fn((_host: string, message: unknown) => answer(message));
  (fakeBrowser.runtime as { sendNativeMessage?: unknown }).sendNativeMessage = send;
  return send;
}

beforeEach(() => {
  fakeBrowser.reset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('skills from this computer', () => {
  it('reads the skills from this computer through the bridge program', async () => {
    const send = stubNative(async () => reply);
    const result = await readLocalSkills(['~/.agents/skills']);
    expect(send).toHaveBeenCalledWith('com.bookmark_scout.bridge', {
      type: 'skills',
      protocol: PROTOCOL_VERSION,
      folders: ['~/.agents/skills'],
    });
    expect(result).toEqual({ state: 'ready', skills: [skill], leftOut: [] });
    expect(localSkillFiles(result)).toEqual([{ name: 'tidy', files: skill.files }]);
  });

  it('says when the program is missing, silent, or too old', async () => {
    stubNative(async () => {
      throw new Error('Specified native messaging host not found.');
    });
    expect(await readLocalSkills([])).toMatchObject({ state: 'notInstalled' });
    stubNative(async () => {
      throw new Error('Native host has exited.');
    });
    expect(await readLocalSkills([])).toMatchObject({ state: 'failed' });
    stubNative(async () => ({ ...reply, protocol: PROTOCOL_VERSION + 1 }));
    expect(await readLocalSkills([])).toEqual({ state: 'outdated' });
    stubNative(async () => ({ type: 'result' }));
    expect(await readLocalSkills([])).toEqual({ state: 'outdated' });
    // A program from before this request waits for a hello and never answers.
    vi.useFakeTimers();
    stubNative(() => new Promise(() => {}));
    const silent = readLocalSkills([]);
    await vi.runAllTimersAsync();
    expect(await silent).toEqual({ state: 'noAnswer' });
    expect(localSkillFiles({ state: 'noAnswer' })).toEqual([]);
  });

  it('reads nothing while the setting or the permission is off, and reuses a reading for a while', async () => {
    const send = stubNative(async () => reply);
    const settings = { askAiLocalSkills: true, askAiLocalSkillFolders: ['~/a'] };
    installFakePermissions({});
    expect(await localSkillsFor(settings)).toEqual({ state: 'off' });
    installFakePermissions({ permissions: ['nativeMessaging'] });
    expect(await localSkillsFor({ ...settings, askAiLocalSkills: false })).toEqual({
      state: 'off',
    });
    expect(send).not.toHaveBeenCalled();

    expect(await localSkillsFor(settings)).toMatchObject({ state: 'ready' });
    await localSkillsFor(settings);
    expect(send).toHaveBeenCalledTimes(1);
    // Other folders, or Refresh, read them again.
    await localSkillsFor({ ...settings, askAiLocalSkillFolders: ['~/b'] });
    await localSkillsFor({ ...settings, askAiLocalSkillFolders: ['~/b'] }, true);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('asks for no more folders than the bridge program reads', () => {
    const bridge = parse(
      readFileSync(path.join(appRoot, '../../packages/mcp-bridge/config/bridge.toml'), 'utf8'),
    ) as { skills: { max_folders: number } };
    expect(getSettingsFieldMeta().askAiLocalSkillFolders.maxItems).toBe(bridge.skills.max_folders);
  });
});

/**
 * Settings as actions (`services/settings-actions.ts`): reading them, changing several at once
 * with Options' validation, the settings only the user may change, and the approval every agent
 * change waits for.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { SETTING_PERMISSIONS, settingsSchema } from '@/lib/settings-schema';
import { getSettings, saveSettings } from '@/lib/settings-storage';
import { type ActionContext, actionLimits } from '@/services/action-kit';
import { actionApproval, actionApprovalPreview, runAction } from '@/services/actions';
import { agentMayChangeSetting } from '@/services/settings-actions';
import { installFakePermissions } from '../fake-permissions';

const context = async (
  client: ActionContext['client'] = { kind: 'askAI' },
): Promise<ActionContext> => ({
  client,
  settings: await getSettings(),
  activeTab: async () => undefined,
});

const run = async (name: string, input: unknown, client?: ActionContext['client']) =>
  runAction(name, input, await context(client)) as Promise<Record<string, unknown>>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  installFakePermissions({});
  await saveSettings({ language: 'en' });
  setLanguage('en');
});

describe('listSettings', () => {
  it('reads settings with their labels, values, scope, and whether an agent may change them', async () => {
    const result = await run('listSettings', {
      keys: ['theme', 'agentBridgeWrites', 'askAiWebSearch'],
    });
    expect(result.total).toBe(3);
    expect(result.settings).toEqual(
      [
        expect.objectContaining({
          key: 'theme',
          scope: 'sync',
          changeable: true,
          choices: expect.any(Array),
        }),
        expect.objectContaining({ key: 'askAiWebSearch', scope: 'device', changeable: false }),
        expect.objectContaining({ key: 'agentBridgeWrites', scope: 'device', changeable: false }),
      ].sort(
        (a, b) =>
          Object.keys(settingsSchema.shape).indexOf(a.key) -
          Object.keys(settingsSchema.shape).indexOf(b.key),
      ),
    );
    // The user may change any of them.
    const own = await run('listSettings', { keys: ['agentBridgeWrites'] }, { kind: 'ui' });
    expect(own.settings).toEqual([expect.objectContaining({ changeable: true })]);
  });

  it('finds settings by a word in the key or label, a page at a time', async () => {
    const found = await run('listSettings', { query: 'theme' });
    expect((found.settings as { key: string }[]).map((entry) => entry.key)).toContain('theme');
    const first = await run('listSettings', {});
    expect(first.settings).toHaveLength(actionLimits.max_settings);
    expect(first.nextCursor).toBeDefined();
  });
});

describe('changeSettings', () => {
  it('changes several settings at once and says what changed', async () => {
    const result = await run('changeSettings', { changes: { theme: 'dark', showFavicons: false } });
    expect(result.changed).toEqual(
      expect.arrayContaining([
        { key: 'theme', from: 'system', to: 'dark' },
        expect.objectContaining({ key: 'showFavicons', to: false }),
      ]),
    );
    expect(await getSettings()).toMatchObject({ theme: 'dark', showFavicons: false });
  });

  it('refuses unknown keys, invalid values, guarded settings, and permission switches', async () => {
    expect(await run('changeSettings', { changes: { nothing: 1 } })).toMatchObject({
      error: { code: 'not_found' },
    });
    expect(await run('changeSettings', { changes: { theme: 'neon' } })).toMatchObject({
      error: { code: 'invalid_input', message: expect.stringMatching(/^theme:/) },
    });
    expect(
      await run('changeSettings', { changes: { agentBridgeRedactUrls: false } }),
    ).toMatchObject({
      error: { code: 'not_allowed' },
    });
    expect(await run('changeSettings', { changes: { aiEnabled: true } })).toMatchObject({
      error: { code: 'not_allowed' },
    });
    // The user changes guarded settings, but turns a permission switch on only once it is granted.
    expect(
      await run('changeSettings', { changes: { askAiWebSearch: true } }, { kind: 'ui' }),
    ).toMatchObject({
      changed: [{ key: 'askAiWebSearch', from: false, to: true }],
    });
    expect(
      await run('changeSettings', { changes: { aiReadPageContent: true } }, { kind: 'ui' }),
    ).toMatchObject({
      error: { code: 'not_allowed' },
    });
  });

  it('always waits for approval from an agent, listing each change, also inside a batch', () => {
    const input = { changes: { theme: 'dark' } };
    expect(actionApproval('changeSettings', input, { untrustedContentSeen: false })).toBe('always');
    expect(
      actionApproval(
        'runBatch',
        { steps: [{ action: 'changeSettings', input }] },
        { untrustedContentSeen: false },
      ),
    ).toBe('always');
    expect(actionApprovalPreview('changeSettings')?.lines?.(input)).toEqual([
      expect.stringMatching(/Dark/),
    ]);
  });

  it('guards only settings that exist, and every permission switch', () => {
    for (const key of actionLimits.guarded_settings) expect(key in settingsSchema.shape).toBe(true);
    for (const key of Object.keys(SETTING_PERMISSIONS))
      expect(agentMayChangeSetting(key)).toBe(false);
    expect(agentMayChangeSetting('theme')).toBe(true);
  });
});

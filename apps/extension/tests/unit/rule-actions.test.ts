/**
 * Smart Rules as actions (`services/rule-actions.ts`): listing, saving a new or changed rule
 * through the rules' own checks, deleting one, and the approval every agent save or delete waits for.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { bookmarkRulesValue } from '@/lib/bookmark-rules-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import type { ActionContext } from '@/services/action-kit';
import { actionApproval, actionApprovalPreview, runAction } from '@/services/actions';
import { installFakeBookmarks } from '../fake-bookmarks';

const context = (client: ActionContext['client'] = { kind: 'askAI' }): ActionContext => ({
  client,
  settings: { ...defaultSettings, language: 'en' },
  activeTab: async () => undefined,
});

const run = (name: string, input: unknown, client?: ActionContext['client']) =>
  runAction(name, input, context(client)) as Promise<Record<string, unknown>>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'docs', parentId: 'bar', title: 'Docs' },
  ]);
});

describe('rule actions', () => {
  it('saves a new rule, changes it by id, lists it, and deletes it', async () => {
    const saved = await run('saveRule', {
      name: 'Docs',
      query: 'spec',
      addTags: ['docs'],
      moveTo: 'Bookmarks Bar/Docs',
    });
    expect(saved).toMatchObject({
      name: 'Docs',
      enabled: true,
      addTags: ['docs'],
      moveTo: 'Bookmarks Bar/Docs',
    });
    const changed = await run('saveRule', {
      id: saved.id,
      name: 'Docs pages',
      query: 'docs',
      addTags: ['reference'],
    });
    expect(changed).toMatchObject({ id: saved.id, name: 'Docs pages', addTags: ['reference'] });
    expect(changed).not.toHaveProperty('moveTo');
    expect(await run('listRules', {})).toEqual({ rules: [changed] });
    expect(await run('deleteRule', { id: saved.id })).toMatchObject({ name: 'Docs pages' });
    expect(await bookmarkRulesValue.get()).toEqual([]);
  });

  it('refuses a rule with no action, an unknown folder, and an unknown id', async () => {
    expect(await run('saveRule', { name: 'Nothing', query: 'docs' })).toMatchObject({
      error: { code: 'invalid_input' },
    });
    expect(await run('saveRule', { name: 'Away', query: 'docs', moveTo: 'Nowhere' })).toMatchObject(
      { error: {} },
    );
    expect(
      await run('saveRule', { id: 'gone', name: 'X', query: 'docs', addTags: ['x'] }),
    ).toMatchObject({
      error: { code: 'not_found' },
    });
    expect(await run('deleteRule', { id: 'gone' })).toMatchObject({ error: { code: 'not_found' } });
  });

  it('keeps moving new bookmarks without a review only as the user set it, for the same folder', async () => {
    const saved = await run('saveRule', {
      name: 'Docs',
      query: 'docs',
      moveTo: 'Bookmarks Bar/Docs',
    });
    await bookmarkRulesValue.update((rules) => rules.map((rule) => ({ ...rule, autoMove: true })));
    expect(
      await run('saveRule', { id: saved.id, name: 'Docs', query: 'docs', moveTo: 'f:docs' }),
    ).toMatchObject({
      autoMove: true,
    });
    expect(
      await run('saveRule', { id: saved.id, name: 'Docs', query: 'docs', addTags: ['x'] }),
    ).not.toHaveProperty('autoMove');
  });

  it('lets only the user in Options turn on moving new bookmarks without a review', async () => {
    const input = { name: 'Docs', query: 'docs', moveTo: 'f:docs', autoMove: true };
    expect(await run('saveRule', input)).toMatchObject({ error: { code: 'not_allowed' } });
    const saved = await run('saveRule', input, { kind: 'ui', page: 'options' });
    expect(saved).toMatchObject({ autoMove: true, moveTo: 'Bookmarks Bar/Docs' });
    const off = await run(
      'saveRule',
      { id: saved.id, name: 'Docs', query: 'docs', moveTo: 'f:docs' },
      { kind: 'ui', page: 'options' },
    );
    expect(off).not.toHaveProperty('autoMove');
    expect(
      await run(
        'saveRule',
        { name: 'Tags', query: 'x', addTags: ['x'], autoMove: true },
        { kind: 'ui', page: 'options' },
      ),
    ).not.toHaveProperty('autoMove');
  });

  it('always asks before an agent saves or deletes a rule, and lists what the rule does', () => {
    const input = { name: 'Docs', query: 'docs', addTags: ['docs'], moveTo: 'Bookmarks Bar/Docs' };
    expect(actionApproval('saveRule', input, { untrustedContentSeen: false })).toBe('always');
    expect(actionApproval('deleteRule', { id: 'x' }, { untrustedContentSeen: false })).toBe(
      'always',
    );
    expect(actionApprovalPreview('saveRule')?.lines?.(input)).toEqual([
      'Save the Smart Rule “Docs”, matching docs',
      'Add the tags docs',
      'Move them to Bookmarks Bar/Docs',
    ]);
  });
});

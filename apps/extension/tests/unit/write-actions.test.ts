import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage, t } from '@/hooks/use-i18n';
import { aiActivityValue } from '@/lib/ai-activity-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import type { ActionContext } from '@/services/action-kit';
import { actionApproval, actionApprovalPreview, runAction } from '@/services/actions';
import { hasUntrustedContent } from '@/services/ai-agent.lazy';
import { bookmarkHistoryValue, describeBookmarkHistoryLabel } from '@/services/bookmark-history';
import { actionPlansValue } from '@/services/plan-actions';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

let bookmarks: FakeBookmarks;

const context = (overrides: Partial<ActionContext> = {}): ActionContext => ({
  client: { kind: 'askAI' },
  settings: { ...defaultSettings, language: 'en' },
  activeTab: async () => undefined,
  ...overrides,
});

const run = (name: string, input: unknown, overrides: Partial<ActionContext> = {}) =>
  runAction(name, input, context(overrides)) as Promise<Record<string, unknown>>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  bookmarks = installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'work', parentId: 'bar', title: 'Work' },
    { id: 'old', parentId: 'bar', title: 'Old' },
    { id: 'policy', parentId: 'bar', title: 'Company', unmodifiable: 'managed' },
    { id: 'b1', parentId: 'old', title: 'Spec', url: 'https://e2e.invalid/spec' },
    { id: 'b2', parentId: 'old', title: 'Notes', url: 'https://e2e.invalid/notes' },
  ]);
});

describe('saveBookmark', () => {
  it('saves once into a folder, returns the change id, and undoChange reverts it', async () => {
    const saved = await run('saveBookmark', {
      url: 'https://e2e.invalid/new',
      title: 'New page',
      folder: 'Bookmarks Bar/Work',
    });
    expect(saved).toMatchObject({ folder: 'Bookmarks Bar/Work', created: true });
    expect(bookmarks.childIds('work')).toHaveLength(1);

    // The same URL in the same folder is not saved twice.
    const again = await run('saveBookmark', {
      url: 'https://e2e.invalid/new',
      folder: 'f:work',
    });
    expect(again).toEqual({ ref: saved.ref, folder: 'Bookmarks Bar/Work', created: false });
    expect(bookmarks.childIds('work')).toHaveLength(1);

    expect(await run('undoChange', { change: saved.change })).toEqual({ undone: 1, skipped: 0 });
    expect(bookmarks.childIds('work')).toEqual([]);
    expect(await run('undoChange', { change: saved.change })).toMatchObject({
      error: { code: 'not_found' },
    });
  });

  it('saves into a new folder, and refuses managed folders and non-web URLs', async () => {
    await run('saveBookmark', {
      url: 'https://e2e.invalid/a',
      folder: 'Work',
      newFolder: 'Reading',
    });
    const [folderId] = bookmarks.childIds('work');
    expect(bookmarks.get(folderId)?.title).toBe('Reading');
    expect(bookmarks.childIds(folderId)).toHaveLength(1);

    expect(
      await run('saveBookmark', { url: 'https://e2e.invalid/b', folder: 'Company' }),
    ).toMatchObject({ error: { code: 'not_allowed' } });
    expect(await run('saveBookmark', { url: 'javascript:alert(1)', folder: 'Work' })).toMatchObject(
      { error: { code: 'invalid_input' } },
    );
  });
});

describe('proposeChanges and applyChanges', () => {
  const propose = (changes: unknown[], overrides: Partial<ActionContext> = {}) =>
    run('proposeChanges', { summary: 'Tidy up', changes }, overrides);

  it('stores a checked plan and changes nothing until it is applied', async () => {
    const plan = await propose([
      { action: 'moveBookmarks', input: { refs: ['b:b1'], to: 'Work', newFolder: 'Specs' } },
      { action: 'renameBookmark', input: { ref: 'b:b2', title: 'Meeting notes' } },
      { action: 'createFolder', input: { parent: 'Bookmarks Bar', title: 'Archive' } },
      { action: 'deleteBookmarks', input: { refs: ['f:old'] } },
    ]);
    expect(plan).toMatchObject({
      changes: [
        { kind: 'move', title: 'Spec', from: 'Bookmarks Bar/Old', to: 'Bookmarks Bar/Work/Specs' },
        { kind: 'rename', title: 'Notes', to: 'Meeting notes' },
        { kind: 'createFolder', title: 'Archive', to: 'Bookmarks Bar' },
        { kind: 'delete', title: 'Old', from: 'Bookmarks Bar', contains: 2 },
      ],
      deletes: 2,
    });
    expect(bookmarks.writes).toEqual([]);
    expect(await actionPlansValue.get()).toHaveLength(1);
  });

  it('applies a plan as one undo step, skipping items changed since', async () => {
    const plan = await propose([
      { action: 'moveBookmarks', input: { refs: ['b:b1'], to: 'Work' } },
      { action: 'renameBookmark', input: { ref: 'b:b2', title: 'Meeting notes' } },
    ]);
    await fakeBrowser.bookmarks.update('b2', { title: 'Renamed by the user' });

    const applied = await run('applyChanges', { planId: plan.planId });
    expect(applied).toMatchObject({ applied: 1, skipped: ['Renamed by the user'], failed: [] });
    expect(bookmarks.childIds('work')).toEqual(['b1']);
    expect(bookmarks.get('b2')?.title).toBe('Renamed by the user');
    expect((await bookmarkHistoryValue.get()).undo).toHaveLength(1);
    // Applied plans are gone.
    expect(await run('applyChanges', { planId: plan.planId })).toMatchObject({
      error: { code: 'not_found' },
    });

    await run('undoChange', { change: applied.change });
    expect(bookmarks.childIds('old')).toEqual(['b1', 'b2']);
  });

  it('refuses roots, permanent and managed folders, moves into itself, and other clients', async () => {
    expect(
      await propose([{ action: 'deleteBookmarks', input: { refs: ['f:bar'] } }]),
    ).toMatchObject({ error: { code: 'not_allowed' } });
    expect(
      await propose([{ action: 'renameBookmark', input: { ref: 'f:policy', title: 'X' } }]),
    ).toMatchObject({ error: { code: 'not_allowed' } });
    expect(
      await propose([{ action: 'moveBookmarks', input: { refs: ['f:old'], to: 'f:old' } }]),
    ).toMatchObject({ error: { code: 'not_allowed' } });
    expect(
      await propose([{ action: 'moveBookmarks', input: { refs: ['b:b1'], to: 'Nowhere' } }]),
    ).toMatchObject({ error: { code: 'not_found', message: expect.stringMatching(/^Change 1/) } });

    const plan = await propose([{ action: 'deleteBookmarks', input: { refs: ['b:b1'] } }]);
    expect(
      await run(
        'applyChanges',
        { planId: plan.planId },
        { client: { kind: 'external', name: 'x' } },
      ),
      // Local agents cannot change bookmarks at all.
    ).toMatchObject({ error: { code: 'not_allowed' } });
    expect(bookmarks.get('b1')).toBeDefined();
  });

  /** Proposes and applies `changes`, and returns the result with the undo label it recorded. */
  async function applyPlan(changes: unknown[]) {
    const plan = await propose(changes);
    const applied = await run('applyChanges', { planId: plan.planId });
    const [entry] = (await bookmarkHistoryValue.get()).undo.slice(-1);
    return { plan, applied, label: describeBookmarkHistoryLabel(entry.label) };
  }

  it('plans a repeated change to the same item once, so preview, applied, and undo agree', async () => {
    const { plan, applied, label } = await applyPlan([
      { action: 'moveBookmarks', input: { refs: ['b:b1', 'b:b2', 'b:b1'], to: 'Work' } },
      { action: 'moveBookmarks', input: { refs: ['b:b2'], to: 'f:work' } },
    ]);
    expect(plan.changes).toEqual([
      expect.objectContaining({ kind: 'move', title: 'Spec' }),
      expect.objectContaining({ kind: 'move', title: 'Notes' }),
    ]);
    expect(applied).toMatchObject({ applied: 2, skipped: [], failed: [] });
    expect(label).toBe('Move 2 items');
    expect(bookmarks.childIds('work')).toEqual(['b1', 'b2']);
    const undone = await run('undoChange', { change: applied.change });
    expect(undone).toEqual({ undone: 2, skipped: 0 });
    expect(bookmarks.childIds('old')).toEqual(['b1', 'b2']);
  });

  it('keeps the first of two renames of one item, and of two identical new folders', async () => {
    const plan = await propose([
      { action: 'renameBookmark', input: { ref: 'b:b2', title: 'First' } },
      { action: 'renameBookmark', input: { ref: 'b:b2', title: 'Second' } },
      { action: 'createFolder', input: { parent: 'Bookmarks Bar', title: 'Archive' } },
      { action: 'createFolder', input: { parent: 'f:bar', title: 'Archive' } },
      { action: 'deleteBookmarks', input: { refs: ['b:b1', 'b:b1'] } },
    ]);
    expect(plan).toMatchObject({
      changes: [
        { kind: 'rename', title: 'Notes', to: 'First' },
        { kind: 'createFolder', title: 'Archive' },
        { kind: 'delete', title: 'Spec' },
      ],
      deletes: 1,
    });
    expect((await actionPlansValue.get())[0].operations).toHaveLength(3);
  });

  it('labels the undo step by the item for one change, and by a count for several', async () => {
    expect(
      (await applyPlan([{ action: 'moveBookmarks', input: { refs: ['b:b1'], to: 'Work' } }])).label,
    ).toBe('Move "Spec"');
    // A move into a new folder is two writes, but still one item.
    expect(
      (
        await applyPlan([
          { action: 'moveBookmarks', input: { refs: ['b:b2'], to: 'Work', newFolder: 'Notes' } },
        ])
      ).label,
    ).toBe('Move "Notes"');
    expect(
      (await applyPlan([{ action: 'renameBookmark', input: { ref: 'b:b1', title: 'Specs' } }]))
        .label,
    ).toBe('Edit "Spec"');
    // Several of one kind are counted; renames have no count label, so they count as changes.
    expect(
      (
        await applyPlan([
          { action: 'renameBookmark', input: { ref: 'b:b1', title: 'A' } },
          { action: 'renameBookmark', input: { ref: 'b:b2', title: 'B' } },
        ])
      ).label,
    ).toBe('2 changes');
    expect(
      (await applyPlan([{ action: 'deleteBookmarks', input: { refs: ['b:b1', 'b:b2'] } }])).label,
    ).toBe('Delete 2 items');
  });

  it('labels a plan of mixed kinds by its count of changes', async () => {
    const { applied, label } = await applyPlan([
      { action: 'moveBookmarks', input: { refs: ['b:b1'], to: 'Work' } },
      { action: 'renameBookmark', input: { ref: 'b:b2', title: 'Meeting notes' } },
      { action: 'createFolder', input: { parent: 'Work', title: 'Later' } },
    ]);
    expect(applied).toMatchObject({ applied: 3 });
    expect(label).toBe('3 changes');
  });
});

describe('approval rules', () => {
  it('always asks before applying a plan, and before any write once untrusted text was read', () => {
    const clean = { untrustedContentSeen: false };
    const tainted = { untrustedContentSeen: true };
    expect(actionApproval('applyChanges', clean)).toBe('always');
    expect(actionApproval('saveBookmark', clean)).toBe('none');
    expect(actionApproval('saveBookmark', tainted)).toBe('untrusted');
    expect(actionApproval('undoChange', tainted)).toBe('untrusted');
    expect(actionApproval('proposeChanges', tainted)).toBe('none');
    expect(actionApproval('searchBookmarks', tainted)).toBe('none');
  });

  it('sees page text and web search results in the conversation as untrusted', () => {
    const toolResult = (toolName: string) => ({
      role: 'tool' as const,
      content: [
        {
          type: 'tool-result' as const,
          toolCallId: '1',
          toolName,
          output: { type: 'json' as const, value: {} },
        },
      ],
    });
    expect(hasUntrustedContent([toolResult('searchBookmarks')])).toBe(false);
    expect(hasUntrustedContent([toolResult('readPage')])).toBe(true);
    expect(hasUntrustedContent([toolResult('web_search')])).toBe(true);
  });
});

describe('activity log', () => {
  it('records each change an agent makes while recording is on, and no reads', async () => {
    await run('searchBookmarks', { query: 'spec' });
    await run('saveBookmark', { url: 'https://e2e.invalid/x', folder: 'Work' });
    expect(await aiActivityValue.get()).toEqual([]);

    await saveSettings({ aiActivityRecording: true });
    await run('searchBookmarks', { query: 'spec' });
    await run('saveBookmark', { url: 'https://e2e.invalid/y', folder: 'Company' });
    await vi.waitFor(async () => expect(await aiActivityValue.get()).toHaveLength(1));
    expect((await aiActivityValue.get())[0]).toMatchObject({
      source: 'askAI',
      method: 'ACTION',
      url: 'action:saveBookmark',
      error: 'Bookmarks Bar/Company is managed by the browser.',
    });
  });
});

describe('approval previews (actionApprovalPreview)', () => {
  it('shows a save as its title, folder, and full address', () => {
    const preview = actionApprovalPreview('saveBookmark');
    const input = { url: 'https://e2e.invalid/new', title: 'New page', folder: 'Work' };
    expect(preview?.lines?.(input)).toEqual([t('askAI_approvalSave', ['New page', 'Work'])]);
    expect(preview?.url?.(input)).toBe('https://e2e.invalid/new');
    expect(preview?.stored).toBeUndefined();
  });

  it('reads a plan an apply names from storage, and nothing once it is gone', async () => {
    const plan = await run('proposeChanges', {
      summary: 'Tidy up',
      changes: [{ action: 'renameBookmark', input: { ref: 'b:b2', title: 'Meeting notes' } }],
    });
    const stored = actionApprovalPreview('applyChanges')?.stored;
    const id = stored?.id({ planId: plan.planId });
    expect(id).toBe(plan.planId);
    expect(stored?.id({ planId: 3 })).toBeUndefined();
    expect(await stored?.load(id ?? '')).toEqual({
      lines: [t('askAI_planRename', ['Notes', 'Meeting notes'])],
      summary: 'Tidy up',
    });
    expect(await stored?.load('missing')).toBeNull();
    expect(stored?.missingKey).toBe('askAI_planMissing');
  });

  it('reads the change an undo names from the history', async () => {
    const saved = await run('saveBookmark', { url: 'https://e2e.invalid/x', folder: 'Work' });
    const stored = actionApprovalPreview('undoChange')?.stored;
    const loaded = await stored?.load(String(saved.change));
    expect(loaded?.summary).toBe(t('askAI_approvalUndo'));
    expect(loaded?.lines.length).toBeGreaterThan(0);
    expect(stored?.missingKey).toBe('askAI_undoMissing');
  });

  it('has none for other actions, which show their step text', () => {
    expect(actionApprovalPreview('moveBookmarks')).toBeUndefined();
    expect(actionApprovalPreview('notAnAction')).toBeUndefined();
  });
});

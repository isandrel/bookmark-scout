import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import {
  AGENT_APPROVAL_PATH,
  AGENT_BRIDGE_MESSAGE,
  agentApprovalsValue,
} from '@/lib/agent-bridge-storage';
import { saveSettings } from '@/lib/settings-storage';
import {
  cancelAgentApproval,
  registerAgentApprovals,
  requestAgentApproval,
} from '@/services/agent-approvals';
import { answerAgentCall } from '@/services/agent-bridge';
import { installFakeBookmarks } from '../fake-bookmarks';
import { installFakePermissions } from '../fake-permissions';

const pageSender = () => ({
  id: fakeBrowser.runtime.id,
  url: fakeBrowser.runtime.getURL(AGENT_APPROVAL_PATH),
});

function answerFrom(sender: { id?: string; url?: string }, id: string, approved: boolean) {
  return fakeBrowser.runtime.onMessage.trigger(
    { type: AGENT_BRIDGE_MESSAGE.answer, id, approved },
    sender,
  );
}

async function waitingIds(): Promise<string[]> {
  return (await agentApprovalsValue.get()).map((request) => request.id);
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.useRealTimers();
  await saveSettings({ language: 'en', agentBridgeEnabled: true, agentBridgeWrites: true });
  setLanguage('en');
  installFakePermissions({ permissions: ['nativeMessaging'] });
  installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'docs', parentId: 'bar', title: 'Docs' },
  ]);
  registerAgentApprovals();
});

describe('approving changes from local agents', () => {
  it('opens the approval window and waits for the answer from the approval page', async () => {
    const create = vi.spyOn(fakeBrowser.windows, 'create');
    const outcome = requestAgentApproval({
      id: '1.1',
      client: 'Agent',
      tool: 'saveBookmark',
      input: {},
    });
    await vi.waitFor(async () => expect(await waitingIds()).toEqual(['1.1']));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'popup', url: expect.stringContaining(AGENT_APPROVAL_PATH) }),
    );

    // Only the approval page can answer.
    await answerFrom({ id: fakeBrowser.runtime.id, url: 'https://example.com/' }, '1.1', true);
    expect(await waitingIds()).toEqual(['1.1']);
    await answerFrom(pageSender(), '1.1', true);
    expect(await outcome).toBe('approved');
    await vi.waitFor(async () => expect(await waitingIds()).toEqual([]));
  });

  it('declines when the window is closed, and stops waiting when the agent cancels', async () => {
    const create = vi.spyOn(fakeBrowser.windows, 'create');
    const first = requestAgentApproval({
      id: '1.2',
      client: 'Agent',
      tool: 'undoChange',
      input: {},
    });
    await vi.waitFor(async () => expect(await waitingIds()).toEqual(['1.2']));
    const window = await create.mock.results[0]?.value;
    await fakeBrowser.windows.onRemoved.trigger(window?.id ?? -1);
    expect(await first).toBe('declined');

    const second = requestAgentApproval({
      id: '1.3',
      client: 'Agent',
      tool: 'undoChange',
      input: {},
    });
    await vi.waitFor(async () => expect(await waitingIds()).toEqual(['1.3']));
    cancelAgentApproval('1.3');
    expect(await second).toBe('cancelled');
  });

  it('asks before a local agent saves a page, and saves nothing when declined', async () => {
    const save = {
      type: 'call' as const,
      id: '2.1',
      client: { name: 'Agent' },
      tool: 'saveBookmark',
      args: { url: 'https://example.com/a', title: 'A', folder: 'f:docs' },
    };
    const declined = answerAgentCall(save);
    await vi.waitFor(async () => expect(await waitingIds()).toEqual(['2.1']));
    await answerFrom(pageSender(), '2.1', false);
    expect(await declined).toMatchObject({
      isError: true,
      result: { error: { code: 'not_allowed', message: 'The user declined this change.' } },
    });
    expect(await fakeBrowser.bookmarks.getChildren('docs')).toEqual([]);

    const approved = answerAgentCall({ ...save, id: '2.2' });
    await vi.waitFor(async () => expect(await waitingIds()).toEqual(['2.2']));
    await answerFrom(pageSender(), '2.2', true);
    expect(await approved).toMatchObject({ isError: false, result: { created: true } });
    expect((await fakeBrowser.bookmarks.getChildren('docs')).map((node) => node.url)).toEqual([
      'https://example.com/a',
    ]);
  });

  it('refuses changes without asking while changes are not allowed', async () => {
    await saveSettings({ agentBridgeWrites: false });
    expect(
      await answerAgentCall({
        type: 'call',
        id: '3.1',
        client: { name: 'Agent' },
        tool: 'saveBookmark',
        args: { url: 'https://example.com/b', folder: 'f:docs' },
      }),
    ).toMatchObject({ isError: true, result: { error: { code: 'not_allowed' } } });
    expect(await waitingIds()).toEqual([]);
  });
});

describe('calls that cannot work are answered at once, without asking', () => {
  const agentCall = (id: string, tool: string, args: Record<string, unknown>) => ({
    type: 'call' as const,
    id,
    client: { name: 'Agent' },
    tool,
    args,
  });

  /** Answers the approval `id` once it is shown. */
  async function approve(id: string) {
    await vi.waitFor(async () => expect(await waitingIds()).toContain(id));
    await answerFrom(pageSender(), id, true);
  }

  /** The answer, or `hung` while it still waits (for an approval nobody gives) a second later. */
  function settled<T>(answer: Promise<T>): Promise<T | 'hung'> {
    return Promise.race([
      answer,
      new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 1_000)),
    ]);
  }

  beforeEach(() => {
    installFakeBookmarks([
      { id: 'bar', title: 'Bookmarks Bar' },
      { id: 'docs', parentId: 'bar', title: 'Docs' },
      { id: 'work', parentId: 'bar', title: 'Work' },
      { id: 'b1', parentId: 'docs', title: 'Rust book', url: 'https://doc.rust-lang.org/book/' },
    ]);
  });

  it('refuses a plan that does not exist or was already applied, with what to do instead', async () => {
    const create = vi.spyOn(fakeBrowser.windows, 'create');
    expect(
      await settled(answerAgentCall(agentCall('4.1', 'applyChanges', { planId: 'no-such-plan' }))),
    ).toEqual({
      isError: true,
      result: {
        error: {
          code: 'not_found',
          message:
            'Plan no-such-plan does not exist, expired, or was already applied; call proposeChanges again.',
          hint: 'Propose the changes again with proposeChanges, then apply the new planId.',
        },
      },
    });
    expect(create).not.toHaveBeenCalled();
    expect(await waitingIds()).toEqual([]);

    const proposed = await answerAgentCall(
      agentCall('4.2', 'proposeChanges', {
        summary: 'File the book',
        changes: [{ action: 'moveBookmarks', input: { refs: ['b:b1'], to: 'f:work' } }],
      }),
    );
    const { planId } = proposed.result as { planId: string };
    const applying = answerAgentCall(agentCall('4.3', 'applyChanges', { planId }));
    await approve('4.3');
    expect(await applying).toMatchObject({ isError: false, result: { applied: 1 } });
    expect((await fakeBrowser.bookmarks.get('b1'))[0]?.parentId).toBe('work');

    // The same plan again: refused at once, and no second window.
    create.mockClear();
    expect(await settled(answerAgentCall(agentCall('4.4', 'applyChanges', { planId })))).toEqual({
      isError: true,
      result: {
        error: expect.objectContaining({
          code: 'not_found',
          message: `Plan ${planId} does not exist, expired, or was already applied; call proposeChanges again.`,
        }),
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a plan whose items changed since it was proposed', async () => {
    const proposed = await answerAgentCall(
      agentCall('5.1', 'proposeChanges', {
        summary: 'File the book',
        changes: [{ action: 'moveBookmarks', input: { refs: ['b:b1'], to: 'f:work' } }],
      }),
    );
    const { planId } = proposed.result as { planId: string };
    await fakeBrowser.bookmarks.update('b1', { title: 'The Rust book' });
    expect(
      await settled(answerAgentCall(agentCall('5.2', 'applyChanges', { planId }))),
    ).toMatchObject({
      isError: true,
      result: {
        error: {
          code: 'unavailable',
          message: `Plan ${planId} is out of date: "Rust book" changed since it was proposed; call proposeChanges again.`,
        },
      },
    });
    expect(await waitingIds()).toEqual([]);
  });

  it('refuses to undo a change that does not exist or was already undone', async () => {
    const saving = answerAgentCall(
      agentCall('6.1', 'saveBookmark', { url: 'https://example.com/a', folder: 'f:docs' }),
    );
    await approve('6.1');
    const { change } = (await saving).result as { change: string };

    const undoing = answerAgentCall(agentCall('6.2', 'undoChange', { change }));
    await approve('6.2');
    expect(await undoing).toMatchObject({ isError: false, result: { undone: 1 } });

    const create = vi.spyOn(fakeBrowser.windows, 'create');
    for (const [id, gone] of [
      ['6.3', change],
      ['6.4', 'no-such-change'],
    ]) {
      expect(
        await settled(answerAgentCall(agentCall(id, 'undoChange', { change: gone }))),
      ).toMatchObject({
        isError: true,
        result: {
          error: {
            code: 'not_found',
            message: `Change ${gone} does not exist or was already undone; there is nothing to undo.`,
          },
        },
      });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a save into a folder named by a bookmark ref, before asking', async () => {
    expect(
      await settled(
        answerAgentCall(
          agentCall('7.1', 'saveBookmark', { url: 'https://example.com/a', folder: 'b:docs' }),
        ),
      ),
    ).toMatchObject({
      isError: true,
      result: { error: { message: 'b:docs is a folder; use f:docs for folders.' } },
    });
    expect(await waitingIds()).toEqual([]);
  });
});

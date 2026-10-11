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

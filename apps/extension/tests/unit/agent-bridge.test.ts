import { PROTOCOL_VERSION } from '@bookmark-scout/mcp-bridge/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { agentBridgeStatusValue } from '@/lib/agent-bridge-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { getSettings, saveSettings } from '@/lib/settings-storage';
import { agentActionIds } from '@/services/actions';
import {
  answerAgentCall,
  createAgentBridgeContext,
  syncAgentBridge,
  toBridgeTool,
} from '@/services/agent-bridge';
import { installFakeBookmarks } from '../fake-bookmarks';
import { installFakePermissions } from '../fake-permissions';

const agent = { name: 'Test agent' };

function seedLibrary() {
  installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'docs', parentId: 'bar', title: 'Docs' },
    {
      id: 'b1',
      parentId: 'docs',
      title: 'Reset link for ada@example.com',
      url: 'https://example.com/reset?token=abc123&page=2',
    },
  ]);
}

const call = (tool: string, args: Record<string, unknown> = {}, id = '1') => ({
  type: 'call' as const,
  id,
  client: agent,
  tool,
  args,
});

/** A native messaging port the test plays the bridge program on. */
function installFakeNativePort() {
  const messages: unknown[] = [];
  const listeners = {
    message: new Set<(message: unknown) => void>(),
    disconnect: new Set<() => void>(),
  };
  const port = {
    postMessage: vi.fn((message: unknown) => messages.push(message)),
    disconnect: vi.fn(),
    onMessage: {
      addListener: (listener: (message: unknown) => void) => listeners.message.add(listener),
    },
    onDisconnect: { addListener: (listener: () => void) => listeners.disconnect.add(listener) },
  };
  const connectNative = vi.fn(() => port);
  Object.assign(fakeBrowser.runtime, { connectNative });
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({
    manifest_version: 3,
    name: 'Bookmark Scout',
    version: '9.9.9',
  });
  return {
    connectNative,
    messages,
    send: (message: unknown) => {
      for (const listener of listeners.message) listener(message);
    },
    close: (reason: string) => {
      Object.assign(fakeBrowser.runtime, { lastError: { message: reason } });
      for (const listener of listeners.disconnect) listener();
      Object.assign(fakeBrowser.runtime, { lastError: undefined });
    },
  };
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await saveSettings({ language: 'en', agentBridgeEnabled: true });
  setLanguage('en');
  seedLibrary();
  installFakePermissions({ permissions: ['nativeMessaging'] });
});

describe('what local agents are offered', () => {
  it('offers local agents only lookups, as JSON Schema with annotations', async () => {
    const context = await createAgentBridgeContext(await getSettings(), agent);
    const ids = await agentActionIds(context);
    expect(ids).toContain('searchBookmarks');
    expect(ids).toContain('listFolders');
    for (const write of ['saveBookmark', 'proposeChanges', 'applyChanges', 'undoChange']) {
      expect(ids).not.toContain(write);
    }
    // Chat buttons only work in Ask AI.
    expect(ids).not.toContain('suggestActions');
    // Allow changes adds the writes (each still waits for approval), never the chat buttons.
    await saveSettings({ agentBridgeWrites: true });
    const withWrites = await agentActionIds(
      await createAgentBridgeContext(await getSettings(), agent),
    );
    for (const write of ['saveBookmark', 'proposeChanges', 'applyChanges', 'undoChange']) {
      expect(withWrites).toContain(write);
    }
    expect(withWrites).not.toContain('suggestActions');

    const search = toBridgeTool('searchBookmarks');
    expect(search.inputSchema).toMatchObject({ type: 'object', properties: { query: {} } });
    expect(search.inputSchema).not.toHaveProperty('$schema');
    expect(search.outputSchema).toMatchObject({ type: 'object' });
    expect(search.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(toBridgeTool('checkLinks').annotations?.openWorldHint).toBe(true);
    expect(toBridgeTool('applyChanges').annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it('leaves out and refuses the actions the user turned off for local agents', async () => {
    await saveSettings({ agentBridgeDisabledActions: ['listFolders'] });
    const settings = await getSettings();
    expect(await agentActionIds(await createAgentBridgeContext(settings, agent))).not.toContain(
      'listFolders',
    );
    expect(await answerAgentCall(call('listFolders'))).toMatchObject({
      isError: true,
      result: { error: { code: 'not_allowed' } },
    });
    // Ask AI keeps it.
    expect(
      await agentActionIds({
        client: { kind: 'askAI' },
        settings,
        activeTab: async () => undefined,
      }),
    ).toContain('listFolders');
  });
});

describe('answering calls', () => {
  it('answers a call through the action registry and refuses one while access is off', async () => {
    const answer = await answerAgentCall(call('listFolders'));
    expect(answer.isError).toBe(false);
    expect(answer.result).toHaveProperty('folders');
    expect(
      await answerAgentCall(call('saveBookmark', { url: 'https://a.example/' })),
    ).toMatchObject({ isError: true, result: { error: { code: 'not_allowed' } } });

    await saveSettings({ agentBridgeEnabled: false });
    expect(await answerAgentCall(call('listFolders'))).toMatchObject({
      isError: true,
      result: { error: { code: 'not_allowed' } },
    });
  });

  it('hides private values in the titles and URLs agents receive', async () => {
    const hidden = await answerAgentCall(call('searchBookmarks', { query: 'reset' }));
    const [found] = (hidden.result as { results: { title: string; url: string }[] }).results;
    expect(found?.url).toBe('https://example.com/reset?token=REDACTED&page=2');
    expect(found?.title).toBe('Reset link for REDACTED');

    await saveSettings({ agentBridgeRedactUrls: false });
    const shown = await answerAgentCall(call('searchBookmarks', { query: 'reset' }));
    expect((shown.result as { results: { url: string }[] }).results[0]?.url).toBe(
      'https://example.com/reset?token=abc123&page=2',
    );
  });

  it('limits how many calls run per minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // Later than any call the other tests made, so only this test's calls count.
      vi.setSystemTime(new Date('2030-01-01T10:00:00Z'));
      for (let index = 0; index < 120; index += 1) {
        expect((await answerAgentCall(call('getBookmarks', { refs: ['b:b1'] }))).isError).toBe(
          false,
        );
      }
      expect(await answerAgentCall(call('listFolders'))).toMatchObject({
        isError: true,
        result: { error: { message: 'Too many requests from local agents.' } },
      });
      vi.setSystemTime(new Date('2030-01-01T10:01:01Z'));
      expect((await answerAgentCall(call('listFolders'))).isError).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the connection', () => {
  it('connects through native messaging, announces the tools, and answers calls', async () => {
    const host = installFakeNativePort();
    await syncAgentBridge();
    expect(host.connectNative).toHaveBeenCalledWith('com.bookmark_scout.bridge');
    const [hello] = host.messages as Record<string, unknown>[];
    expect(hello).toMatchObject({
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      browser: expect.any(String),
      profileId: expect.stringMatching(/^[a-z0-9]{12}$/),
    });
    expect(((hello?.tools ?? []) as { name: string }[]).map((tool) => tool.name)).toContain(
      'searchBookmarks',
    );
    expect(await agentBridgeStatusValue.get()).toEqual({ state: 'connecting' });

    host.send({ type: 'ready' });
    await vi.waitFor(async () =>
      expect(await agentBridgeStatusValue.get()).toEqual({ state: 'ready' }),
    );

    host.send(call('listFolders', {}, '1.7'));
    await vi.waitFor(() =>
      expect(host.messages).toContainEqual(
        expect.objectContaining({ type: 'result', id: '1.7', isError: false }),
      ),
    );

    host.close('Specified native messaging host not found.');
    await vi.waitFor(async () =>
      expect(await agentBridgeStatusValue.get()).toMatchObject({ state: 'notInstalled' }),
    );

    await saveSettings({ agentBridgeEnabled: false });
    await syncAgentBridge();
    expect(await agentBridgeStatusValue.get()).toEqual({ state: 'off' });
  });

  it('stays off without the native messaging permission', async () => {
    installFakePermissions({});
    const host = installFakeNativePort();
    await syncAgentBridge();
    expect(host.connectNative).not.toHaveBeenCalled();
    expect(defaultSettings.agentBridgeEnabled).toBe(false);
  });
});

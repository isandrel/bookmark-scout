import { MemoryStorage } from '@earendil-works/pi-durable';
import { afterEach, describe, expect, it } from 'vitest';
import { PROVIDER_TOOL_DIAGNOSTIC } from '@/services/ai-sdk-pi-provider.lazy';
import {
  AskAIDurable,
  type AskAISetup,
  pendingApprovals,
  readDurableConversation,
} from '@/services/ask-ai-durable.lazy';
import {
  finishPart,
  type StreamCallOptions,
  scriptedStreamModel,
  textParts,
  toolCallPart,
} from './scripted-stream-model';

const open: AskAIDurable[] = [];

/** Storage that outlives the Harness it was opened with, as IndexedDB outlives a page. */
function reopenable(storage = new MemoryStorage()): MemoryStorage {
  return new Proxy(storage, {
    get(target, property) {
      if (property === 'close') return async () => undefined;
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((service) => service.close()));
});

type ActionCall = { name: string; args: unknown; untrusted: boolean };

async function setUp(
  answers: Parameters<typeof scriptedStreamModel>[0],
  {
    setup = {
      system: 'You are Ask AI.',
      tools: ['listFolders', 'readPage', 'applyChanges'],
      maxSteps: 4,
    },
    storage = new MemoryStorage(),
  }: { setup?: AskAISetup; storage?: MemoryStorage } = {},
) {
  const { model, calls } = scriptedStreamModel(answers);
  const actions: ActionCall[] = [];
  const service = await AskAIDurable.open({
    storage,
    setup: async () => setup,
    languageModel: async () => model,
    callAction: async (name, args, conversation) => {
      actions.push({ name, args, untrusted: conversation.untrustedContentSeen });
      return { ok: true, name };
    },
  });
  open.push(service);
  return { service, calls, actions, storage };
}

/** The text of every tool result and user message the model saw on a call. */
const seen = (call: StreamCallOptions) => JSON.stringify(call.prompt);

describe('Ask AI on Pi Durable', () => {
  it('runs a read action in the background and answers', async () => {
    const { service, calls, actions } = await setUp([
      [toolCallPart('listFolders', {}), finishPart('tool-calls')],
      [...textParts('You have two folders'), finishPart('stop')],
    ]);
    const chat = await service.createChat();
    const settled = await (await service.send(chat, 'Folders?', 'r1')).wait(service.context);
    expect(settled).toMatchObject({ status: 'done' });
    expect(actions).toEqual([{ name: 'listFolders', args: {}, untrusted: false }]);
    expect(seen(calls[0])).toContain('You are Ask AI.');
    expect(seen(calls[1])).toContain('\\"ok\\":true');
  });

  it('holds a change for approval, keeps it across a reopen, and runs it once when approved', async () => {
    const storage = reopenable();
    const first = await setUp(
      [[toolCallPart('applyChanges', { planId: 'p1' }), finishPart('tool-calls')]],
      {
        storage,
      },
    );
    const chat = await first.service.createChat();
    const context = first.service.context;
    await (await first.service.send(chat, 'Apply it', 'r1')).wait(context);
    expect(first.actions).toEqual([]);
    expect(pendingApprovals(await chat.context(context))).toEqual([
      {
        callId: 'call-applyChanges',
        approval: {
          approval: 'requested',
          reason: 'always',
          tool: 'applyChanges',
          args: { planId: 'p1' },
        },
      },
    ]);
    await first.service.close();
    open.splice(open.indexOf(first.service), 1);

    // A new page (after a restart) finds the call still waiting.
    const second = await setUp([[...textParts('Done, applied'), finishPart('stop')]], { storage });
    const again = await second.service.chat(chat.id);
    if (!again) throw new Error('chat lost');
    expect(pendingApprovals(await again.context(context))).toHaveLength(1);
    const decided = await second.service.decide(again, 'call-applyChanges', true);
    expect(decided.ok).toBe(true);
    if (decided.ok) await decided.submission.wait(context);
    expect(second.actions).toEqual([
      { name: 'applyChanges', args: { planId: 'p1' }, untrusted: false },
    ]);
    expect(seen(second.calls[0])).toContain('The user approved the applyChanges call');
    expect(pendingApprovals(await again.context(context))).toEqual([]);
    // A second answer to the same call is refused and runs nothing.
    expect(await second.service.decide(again, 'call-applyChanges', true)).toEqual({
      ok: false,
      error: 'not_pending',
    });
    expect(second.actions).toHaveLength(1);
  });

  it('never runs a declined call', async () => {
    const { service, calls, actions } = await setUp([
      [toolCallPart('applyChanges', { planId: 'p1' }), finishPart('tool-calls')],
      [...textParts('Left as it was'), finishPart('stop')],
    ]);
    const chat = await service.createChat();
    const context = service.context;
    await (await service.send(chat, 'Apply it', 'r1')).wait(context);
    const decided = await service.decide(chat, 'call-applyChanges', false);
    if (decided.ok) await decided.submission.wait(context);
    expect(actions).toEqual([]);
    expect(seen(calls[1])).toContain('declined the applyChanges call');
  });

  it('refuses a tool turned off since the chat began', async () => {
    const { service, calls, actions } = await setUp(
      [
        [toolCallPart('readPage', { url: 'https://example.com' }), finishPart('tool-calls')],
        [...textParts('Cannot read pages'), finishPart('stop')],
      ],
      { setup: { system: 'S', tools: ['listFolders'], maxSteps: 4 } },
    );
    const chat = await service.createChat();
    await (await service.send(chat, 'Read it', 'r1')).wait(service.context);
    expect(actions).toEqual([]);
    // The model is offered only the actions turned on now.
    expect(calls[0].tools?.map((offered) => offered.name)).toEqual(['listFolders']);
  });

  it('tells the model to answer past Max steps, and ends a run that keeps calling tools', async () => {
    const loop = () => [
      toolCallPart('listFolders', {}, `c${Math.random()}`),
      finishPart('tool-calls'),
    ];
    const { service, actions } = await setUp(
      Array.from({ length: 10 }, () => loop),
      {
        setup: { system: 'S', tools: ['listFolders'], maxSteps: 1 },
      },
    );
    const chat = await service.createChat();
    await (await service.send(chat, 'Loop', 'r1')).wait(service.context);
    // One call runs; later rounds are told to answer, then the run ends.
    expect(actions).toHaveLength(1);
  });
});

describe('what a conversation allows a call', () => {
  const assistant = (diagnostics?: object[]) => ({
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text: 'Searched' }],
    api: 'ai-sdk',
    provider: 'ask-ai',
    model: 'default',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop' as const,
    timestamp: 1,
    ...(diagnostics ? { diagnostics } : {}),
  });

  it('knows URLs the user typed or a tool named, and when unreviewed text came in', () => {
    const plain = readDurableConversation([
      { role: 'user', content: 'Save https://a.example/page', timestamp: 1 },
      {
        role: 'toolResult',
        toolCallId: 'c1',
        toolName: 'searchBookmarks',
        content: [
          { type: 'text', text: JSON.stringify({ items: [{ url: 'https://b.example/' }] }) },
        ],
        isError: false,
        timestamp: 2,
      },
    ]);
    expect(plain.untrustedContentSeen).toBe(false);
    expect(plain.knownUrls.size).toBe(2);

    const read = readDurableConversation([
      {
        role: 'toolResult',
        toolCallId: 'c2',
        toolName: 'readPage',
        content: [{ type: 'text', text: '{"text":"page"}' }],
        isError: false,
        timestamp: 3,
      },
    ]);
    expect(read.untrustedContentSeen).toBe(true);

    const searched = readDurableConversation([
      assistant([
        { type: PROVIDER_TOOL_DIAGNOSTIC, timestamp: 4, details: { toolName: 'web_search' } },
      ]),
    ]);
    expect(searched.untrustedContentSeen).toBe(true);
    expect(readDurableConversation([assistant()]).untrustedContentSeen).toBe(false);
  });
});

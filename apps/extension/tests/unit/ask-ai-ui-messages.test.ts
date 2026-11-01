import type { AssistantMessage } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';
import {
  ASK_AI_DECISION_ENTRY,
  ASK_AI_OUTCOME_ENTRY,
  SOURCES_DIAGNOSTIC,
  toUIMessages,
} from '@/lib/ask-ai-ui-messages';

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const assistant = (content: AssistantMessage['content'], extra: Partial<AssistantMessage> = {}) =>
  ({
    role: 'assistant',
    content,
    api: 'ai-sdk',
    provider: 'ask-ai',
    model: 'default',
    usage,
    stopReason: 'stop',
    timestamp: 1,
    ...extra,
  }) as AssistantMessage;
const user = (id: number, text: string) => ({
  id,
  kind: 'pi.user',
  model: [{ role: 'user' as const, content: text, timestamp: 1 }],
});
const toolResult = (id: number, callId: string, name: string, text: string, details?: object) => ({
  id,
  kind: 'pi.tool-result',
  model: [
    {
      role: 'toolResult' as const,
      toolCallId: callId,
      toolName: name,
      content: [{ type: 'text' as const, text }],
      isError: false,
      timestamp: 1,
      ...(details ? { details } : {}),
    },
  ],
});

describe('an Ask AI conversation as the chat shows it', () => {
  it('turns one answer with its tool steps into one assistant message', () => {
    const { messages } = toUIMessages([
      user(1, 'Folders?'),
      {
        id: 2,
        kind: 'pi.assistant',
        model: [assistant([{ type: 'toolCall', id: 'c1', name: 'listFolders', arguments: {} }])],
      },
      toolResult(3, 'c1', 'listFolders', '{"folders":["Work"]}'),
      { id: 4, kind: 'pi.assistant', model: [assistant([{ type: 'text', text: 'One: Work' }])] },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[1].parts).toEqual([
      {
        type: 'tool-listFolders',
        toolCallId: 'c1',
        state: 'output-available',
        input: {},
        output: { folders: ['Work'] },
      },
      { type: 'text', text: 'One: Work', state: 'done' },
    ]);
  });

  it('shows a call waiting for approval, then its outcome, and hides the outcome input', () => {
    const waiting = [
      user(1, 'Apply it'),
      {
        id: 2,
        kind: 'pi.assistant',
        model: [
          assistant([
            { type: 'toolCall', id: 'c1', name: 'applyChanges', arguments: { planId: 'p' } },
          ]),
        ],
      },
      toolResult(3, 'c1', 'applyChanges', 'waits', {
        approval: 'requested',
        reason: 'always',
        tool: 'applyChanges',
        args: { planId: 'p' },
      }),
    ];
    expect(toUIMessages(waiting).messages[1].parts[0]).toMatchObject({
      state: 'approval-requested',
      approval: { id: 'c1', isAutomatic: false, requestReason: 'always' },
    });
    const approved = toUIMessages([
      ...waiting,
      { id: 4, kind: ASK_AI_DECISION_ENTRY, data: { callId: 'c1', approved: true } },
      {
        id: 5,
        kind: ASK_AI_OUTCOME_ENTRY,
        model: [{ role: 'user' as const, content: 'approved', timestamp: 1 }],
        data: { callId: 'c1', approved: true, result: { applied: 2 } },
      },
    ]).messages;
    expect(approved).toHaveLength(2);
    expect(approved[1].parts[0]).toMatchObject({
      state: 'output-available',
      output: { applied: 2 },
    });
    const declined = toUIMessages([
      ...waiting,
      { id: 4, kind: ASK_AI_DECISION_ENTRY, data: { callId: 'c1', approved: false } },
    ]).messages;
    expect(declined[1].parts[0]).toMatchObject({
      state: 'approval-responded',
      approval: { approved: false },
    });
  });

  it('streams the partial answer, lists web sources, and reports a failed answer', () => {
    const picture = toUIMessages(
      [
        user(1, 'News?'),
        {
          id: 2,
          kind: 'pi.assistant',
          model: [
            assistant([{ type: 'text', text: 'Here' }], {
              diagnostics: [
                {
                  type: SOURCES_DIAGNOSTIC,
                  timestamp: 1,
                  details: { sources: [{ url: 'https://news.example/', title: 'News' }] },
                },
              ],
            }),
          ],
        },
      ],
      assistant([{ type: 'text', text: 'More' }]),
    );
    expect(picture.messages[1].parts).toEqual([
      { type: 'text', text: 'Here', state: 'done' },
      {
        type: 'source-url',
        sourceId: 'https://news.example/',
        url: 'https://news.example/',
        title: 'News',
      },
      { type: 'text', text: 'More', state: 'streaming' },
    ]);
    const failed = toUIMessages([
      user(1, 'Hi'),
      {
        id: 2,
        kind: 'pi.assistant',
        model: [assistant([], { stopReason: 'error', errorMessage: 'Invalid API key' })],
      },
    ]);
    expect(failed.error).toBe('Invalid API key');
  });
});

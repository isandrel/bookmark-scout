/**
 * An Ask AI conversation as the chat shows it: Pi Durable's entries turned into AI SDK UI
 * messages, the shape the chat's components (steps, approval cards, suggestion buttons) read. One
 * assistant message per answer, with its tool calls as steps; a call that waits for the user's
 * approval as `approval-requested` until the decision entry answers it. Pure, so the AI host page
 * builds it and tests check it without a browser.
 */
import type { AssistantMessage, Message } from '@earendil-works/pi-ai';
import type { UIMessage } from 'ai';

/** The entry kind of the user's answer to a call that waited for approval. */
export const ASK_AI_DECISION_ENTRY = 'askai.decision';
/** The entry kind of the input that tells the model how a decision turned out; never shown. */
export const ASK_AI_OUTCOME_ENTRY = 'askai.outcome';
/** The diagnostic an answer carries for the sources of a web search the provider ran. */
export const SOURCES_DIAGNOSTIC = 'sources';

type Part = UIMessage['parts'][number];
type ToolPart = Extract<Part, { toolCallId: string }>;

/** One stored entry, as much of it as the chat reads. */
export type ChatEntry = {
  id: number;
  kind: string;
  model?: readonly Message[];
  data?: unknown;
};

export type DecisionData = { callId: string; approved: boolean };
export type OutcomeData = DecisionData & { result?: unknown };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A tool result's text, parsed back into the value the action returned. */
function parseResult(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function assistantParts(message: AssistantMessage, streaming: boolean): Part[] {
  const parts: Part[] = [];
  for (const block of message.content) {
    if (block.type === 'text' && block.text) {
      parts.push({ type: 'text', text: block.text, state: streaming ? 'streaming' : 'done' });
    } else if (block.type === 'thinking' && block.thinking && !block.redacted) {
      parts.push({
        type: 'reasoning',
        text: block.thinking,
        state: streaming ? 'streaming' : 'done',
      });
    } else if (block.type === 'toolCall') {
      parts.push({
        type: `tool-${block.name}`,
        toolCallId: block.id,
        state: 'input-available',
        input: block.arguments,
      } as ToolPart);
    }
  }
  for (const diagnostic of message.diagnostics ?? []) {
    if (diagnostic.type !== SOURCES_DIAGNOSTIC || !Array.isArray(diagnostic.details?.sources))
      continue;
    for (const source of diagnostic.details.sources) {
      if (isObject(source) && typeof source.url === 'string') {
        parts.push({
          type: 'source-url',
          sourceId: source.url,
          url: source.url,
          ...(typeof source.title === 'string' ? { title: source.title } : {}),
        });
      }
    }
  }
  return parts;
}

export type ChatPicture = {
  messages: UIMessage[];
  /** The last answer failed with this error, and nothing came after it. */
  error?: string;
};

/**
 * The chat's messages from its entries (oldest first) and, while an answer streams, its partial
 * message.
 */
export function toUIMessages(
  entries: readonly ChatEntry[],
  partial?: AssistantMessage,
): ChatPicture {
  const messages: UIMessage[] = [];
  const decisions = new Map<string, OutcomeData>();
  for (const entry of entries) {
    if (
      (entry.kind === ASK_AI_DECISION_ENTRY || entry.kind === ASK_AI_OUTCOME_ENTRY) &&
      isObject(entry.data) &&
      typeof entry.data.callId === 'string'
    ) {
      const known = decisions.get(entry.data.callId);
      decisions.set(entry.data.callId, {
        callId: entry.data.callId,
        approved: entry.data.approved === true,
        ...(known && 'result' in known ? { result: known.result } : {}),
        ...('result' in entry.data ? { result: entry.data.result } : {}),
      });
    }
  }
  let error: string | undefined;
  const current = (): UIMessage => {
    const last = messages.at(-1);
    if (last?.role === 'assistant') return last;
    const message: UIMessage = { id: `a${messages.length}`, role: 'assistant', parts: [] };
    messages.push(message);
    return message;
  };
  for (const entry of entries) {
    if (entry.kind === ASK_AI_OUTCOME_ENTRY || entry.kind === ASK_AI_DECISION_ENTRY) continue;
    for (const message of entry.model ?? []) {
      if (message.role === 'user') {
        const text =
          typeof message.content === 'string'
            ? message.content
            : message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
        messages.push({ id: `u${entry.id}`, role: 'user', parts: [{ type: 'text', text }] });
        error = undefined;
      } else if (message.role === 'assistant') {
        const target = current();
        if (target.parts.length === 0) target.id = `a${entry.id}`;
        target.parts.push(...assistantParts(message, false));
        error = message.stopReason === 'error' ? (message.errorMessage ?? 'error') : undefined;
      } else if (message.role === 'toolResult') {
        const target = current();
        const index = target.parts.findIndex(
          (part) => 'toolCallId' in part && part.toolCallId === message.toolCallId,
        );
        if (index < 0) continue;
        const call = target.parts[index] as ToolPart;
        const text = message.content
          .flatMap((part) => (part.type === 'text' ? [part.text] : []))
          .join('\n');
        const details = message.details;
        let next: ToolPart;
        if (isObject(details) && details.approval === 'requested') {
          const decision = decisions.get(message.toolCallId);
          next = !decision
            ? ({
                ...call,
                state: 'approval-requested',
                approval: {
                  id: message.toolCallId,
                  isAutomatic: false,
                  ...(typeof details.reason === 'string' ? { requestReason: details.reason } : {}),
                },
              } as ToolPart)
            : decision.approved && 'result' in decision
              ? ({
                  ...call,
                  state: 'output-available',
                  output: decision.result,
                  approval: { id: message.toolCallId, approved: true },
                } as ToolPart)
              : ({
                  ...call,
                  state: 'approval-responded',
                  approval: { id: message.toolCallId, approved: decision.approved },
                } as ToolPart);
        } else {
          next = message.isError
            ? ({ ...call, state: 'output-error', errorText: text } as ToolPart)
            : ({ ...call, state: 'output-available', output: parseResult(text) } as ToolPart);
        }
        target.parts[index] = next;
      }
    }
  }
  if (partial) {
    const parts = assistantParts(partial, true);
    if (parts.length > 0) current().parts.push(...parts);
  }
  return { messages, ...(error ? { error } : {}) };
}

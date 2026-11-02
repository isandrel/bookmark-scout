/**
 * Ask AI's conversations on Pi Durable: the tool loop runs in the AI host page and every step is
 * committed to storage first, so an answer goes on after the popup closes, and picks up where it
 * stopped after the worker or the browser restarts. Model requests stay on the AI SDK
 * (`ai-sdk-pi-provider.lazy.ts`).
 *
 * Everything the host page cannot do itself comes in through `AskAIDurableDeps`: in Chrome the
 * page has only the runtime API, so the background builds the prompt, picks the enabled actions,
 * and runs every action call. Approval is code, never left to the model: a call that needs it
 * (`actionApproval`) is not run; its result says it waits, the answer ends there, and the user's
 * decision later runs the call (or not) and hands the outcome back to the model as a new input.
 * Like every `*.lazy.ts` file it is left out of auto-imports; import it only with `import()`.
 */
import { BACKGROUND_CONTEXT, type Context } from '@earendil-works/chord/context';
import { createModels, type Message, type TSchema } from '@earendil-works/pi-ai';
import {
  type Conversation,
  type ConversationView,
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  type JsonObject,
  type Storage,
  section,
  type ToolRegistration,
} from '@earendil-works/pi-durable';
import type { SkillRegistry } from 'agent-skills-ts-sdk';
import type { LanguageModel, ToolSet } from 'ai';
import { z } from 'zod';
import { ASK_AI_DECISION_ENTRY, ASK_AI_OUTCOME_ENTRY } from '@/lib/ask-ai-ui-messages';
import { boundedNumber } from '@/lib/config/bounded';
import { createAISdkPiProvider, PROVIDER_TOOL_DIAGNOSTIC } from './ai-sdk-pi-provider.lazy';
import { askAISkillCatalog } from './ask-ai-skills.lazy';

export const durableConfig = readConfig(
  'ai/durable',
  z.strictObject({
    context_window: boundedNumber({ integer: true }),
    max_output_tokens: boundedNumber({ integer: true }),
    step_overrun: boundedNumber({ integer: true }),
    retry_attempts: boundedNumber({ integer: true }),
    retry_base_delay_ms: boundedNumber({ integer: true }),
    progress_interval_ms: boundedNumber({ integer: true }),
  }),
);

/** The pi-ai provider and model every Ask AI conversation names; each call reads the current service. */
const PROVIDER_ID = 'ask-ai';
const MODEL_ID = 'default';
const EXTENSION_NAME = 'ask-ai';

/** What a call that waits for the user's approval records in its result's details. */
export type PendingApproval = {
  approval: 'requested';
  reason: 'always' | 'untrusted';
  tool: string;
  args: JsonObject;
};

/** What the background sets up for each answer: built from the current settings. */
export type AskAISetup = {
  /** The Ask AI system prompt (`buildPrompt('ask_ai')`). */
  system: string;
  /** The actions Ask AI may call now (`agentActionIds`). */
  tools: readonly string[];
  /** Ask AI's Max steps setting: tool rounds in one answer. */
  maxSteps: number;
};

export type AskAIDurableDeps = {
  storage: Storage;
  setup: () => Promise<AskAISetup>;
  /** The default AI service's model, with the request transport this page must use. */
  languageModel: () => Promise<LanguageModel>;
  /** An answer's error as the chat shows it, in the user's language. */
  describeError?: (error: unknown) => string;
  /** Tools the provider runs itself (web search), when they are on. */
  providerTools?: () => Promise<ToolSet>;
  /** Runs an action in the background, with what the conversation so far allows. */
  callAction: (name: string, args: unknown, conversation: ActionConversation) => Promise<unknown>;
  skills?: () => Promise<SkillRegistry>;
  context?: Context;
};

/** The action's text for the model: its result as JSON, as the AI SDK agent sent it. */
function resultText(result: unknown): string {
  return JSON.stringify(result ?? null);
}

/** Every model message of the conversation's active context, oldest first. */
async function contextMessages(conversation: Conversation, context: Context): Promise<Message[]> {
  const view = await conversation.context(context);
  return view.entries.flatMap((entry) => entry.model ?? []);
}

/**
 * What the conversation allows a call, from its messages: whether text nobody reviewed came in
 * (a page read, or a web search the provider ran), and the URLs the user typed or a tool named.
 */
export function readDurableConversation(messages: readonly Message[]): ActionConversation {
  let untrustedContentSeen = false;
  const urls: string[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      const text =
        typeof message.content === 'string'
          ? message.content
          : message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
      urls.push(...webUrlsInMessage(text));
    } else if (message.role === 'toolResult') {
      if (UNTRUSTED_ACTION_IDS.has(message.toolName)) untrustedContentSeen = true;
      for (const part of message.content) {
        if (part.type !== 'text') continue;
        try {
          urls.push(...urlsInToolResult(JSON.parse(part.text)));
        } catch {
          // A result that is not JSON names no URLs.
        }
      }
    } else if (message.role === 'assistant') {
      if (
        message.diagnostics?.some(
          (diagnostic) =>
            diagnostic.type === PROVIDER_TOOL_DIAGNOSTIC &&
            ASK_AI_WEB_SEARCH_TOOL_NAMES.has(String(diagnostic.details?.toolName ?? '')),
        )
      ) {
        untrustedContentSeen = true;
      }
    }
  }
  return { untrustedContentSeen, knownUrls: new Set(urls.map(conversationUrlKey)) };
}

/** Tool rounds since the user's latest input. */
function roundsSinceInput(messages: readonly Message[]): number {
  let rounds = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user') break;
    if (message.role === 'assistant' && message.content.some((part) => part.type === 'toolCall')) {
      rounds += 1;
    }
  }
  return rounds;
}

/** The calls in a view that wait for the user's approval and have no decision yet. */
export function pendingApprovals(
  view: Pick<ConversationView, 'entries'>,
): { callId: string; approval: PendingApproval }[] {
  const decided = new Set(
    view.entries.flatMap((entry) =>
      entry.kind === ASK_AI_DECISION_ENTRY && isPlainObject(entry.data)
        ? [String(entry.data.callId)]
        : [],
    ),
  );
  return view.entries.flatMap((entry) =>
    (entry.model ?? []).flatMap((message) => {
      if (message.role !== 'toolResult' || decided.has(message.toolCallId)) return [];
      const details = message.details;
      return isPlainObject(details) && details.approval === 'requested'
        ? [{ callId: message.toolCallId, approval: details as unknown as PendingApproval }]
        : [];
    }),
  );
}

export class AskAIDurable {
  private setupCache: AskAISetup | undefined;

  private constructor(
    readonly harness: Harness,
    private readonly deps: AskAIDurableDeps,
    /** The cancellation context every call of this service runs in. */
    readonly context: Context,
    private readonly tools: readonly ToolRegistration[],
  ) {}

  static async open(deps: AskAIDurableDeps): Promise<AskAIDurable> {
    const context = deps.context ?? BACKGROUND_CONTEXT;
    let service: AskAIDurable | undefined;
    const setup = async () => {
      if (!service) throw new Error('Ask AI is not open yet');
      return service.currentSetup();
    };
    const models = createModels();
    models.setProvider(
      createAISdkPiProvider({
        id: PROVIDER_ID,
        models: [
          {
            id: MODEL_ID,
            contextWindow: durableConfig.context_window,
            maxTokens: durableConfig.max_output_tokens,
          },
        ],
        languageModel: () => deps.languageModel(),
        ...(deps.describeError ? { describeError: deps.describeError } : {}),
        ...(deps.providerTools ? { providerTools: deps.providerTools } : {}),
      }),
    );
    const registry = createRegistry();
    const extension = defineExtension({
      name: EXTENSION_NAME,
      sections: [
        section('ask_ai', async () => (await setup()).system, { tag: false }),
        ...(deps.skills
          ? [
              section(
                'skills',
                async () => {
                  const skills = await deps.skills?.();
                  return skills ? askAISkillCatalog(skills) || undefined : undefined;
                },
                { tag: false },
              ),
            ]
          : []),
      ],
      tools: [
        ...agentActionChoices('askAI').map((name) => {
          const { agent, input, risk } = getAction(name);
          return defineTool({
            name,
            description: agent?.description ?? name,
            parameters: (input ? z.toJSONSchema(input) : { type: 'object' }) as TSchema,
            // As the AI SDK did: the action's own schema drops fields a model guessed, so one bad
            // item fails on its own in `execute` instead of failing the whole call.
            prepareArguments: (args: unknown) => {
              const parsed = input?.safeParse(args);
              return (parsed?.success ? parsed.data : args) as never;
            },
            // Reads run again after a restart; a change never runs twice.
            replay: risk === 'read' ? 'safe' : 'unsafe',
            execute: async (args, api, callContext) => {
              const conversation = await service?.harness.conversation(
                api.conversationId,
                callContext,
              );
              const messages = conversation ? await contextMessages(conversation, callContext) : [];
              const current = await setup();
              const rounds = roundsSinceInput(messages);
              if (!current.tools.includes(name)) {
                return {
                  output: [{ type: 'text', text: `The ${name} tool is turned off now.` }],
                  isError: true,
                };
              }
              if (rounds > current.maxSteps + durableConfig.step_overrun) {
                return {
                  output: [{ type: 'text', text: 'Step limit reached.' }],
                  isError: true,
                  control: { terminate: true },
                };
              }
              if (rounds > current.maxSteps) {
                return {
                  output: [
                    {
                      type: 'text',
                      text: 'The step limit is reached: do not call more tools, answer now with what you have.',
                    },
                  ],
                  isError: true,
                };
              }
              const allowed = readDurableConversation(messages);
              const need = actionApproval(name, args, allowed);
              if (need !== 'none') {
                const pending: PendingApproval = {
                  approval: 'requested',
                  reason: need,
                  tool: name,
                  args: args as JsonObject,
                };
                return {
                  output: [
                    {
                      type: 'text',
                      text: 'This call waits for the user to approve or decline it. Stop here; their answer comes as a new message.',
                    },
                  ],
                  details: pending,
                  control: { terminate: true },
                };
              }
              const result = await deps.callAction(name, args, allowed);
              return {
                output: [{ type: 'text', text: resultText(result) }],
                isError: isActionError(result),
              };
            },
          });
        }),
        ...(deps.skills
          ? [
              defineTool({
                name: ASK_AI_SKILL_TOOL,
                description: 'Read a skill, or one of its files.',
                parameters: {
                  type: 'object',
                  properties: { name: { type: 'string' }, resource: { type: 'string' } },
                  required: ['name'],
                  additionalProperties: false,
                } as unknown as TSchema,
                replay: 'safe',
                execute: async (args) => {
                  const skills = await deps.skills?.();
                  const result = skills
                    ? await skills.read(args as { name: string; resource?: string })
                    : { ok: false, error: 'No skills' };
                  return { output: [{ type: 'text', text: resultText(result) }] };
                },
              }),
            ]
          : []),
      ],
    });
    registry.install(extension);
    const harness = await Harness.open(
      deps.storage,
      {
        models,
        registry,
        settings: {
          retry: {
            enabled: durableConfig.retry_attempts > 0,
            maxRetries: durableConfig.retry_attempts,
            baseDelayMs: durableConfig.retry_base_delay_ms,
          },
          progress: {
            partialIntervalMs: durableConfig.progress_interval_ms,
            outputIntervalMs: durableConfig.progress_interval_ms,
          },
        },
        identity: { attribution: null },
      },
      context,
    );
    service = new AskAIDurable(harness, deps, context, extension.tools ?? []);
    return service;
  }

  /** The setup for the current answer; read again before each new input. */
  private async currentSetup(): Promise<AskAISetup> {
    this.setupCache ??= await this.deps.setup();
    return this.setupCache;
  }

  /** Runs whatever a stopped worker or browser left unfinished. */
  resume(): void {
    this.harness.resume();
  }

  /** The storage's own conversation: one chat per database. */
  async root(): Promise<Conversation> {
    return this.harness.root(this.context, {
      agent: { model: { provider: PROVIDER_ID, modelId: MODEL_ID } },
    });
  }

  /** A new conversation for a new chat. */
  async createChat(): Promise<Conversation> {
    return this.harness.createConversation(
      {
        ownership: { kind: 'ownerless' },
        agent: { model: { provider: PROVIDER_ID, modelId: MODEL_ID } },
      },
      this.context,
    );
  }

  async chat(id: number): Promise<Conversation | undefined> {
    return this.harness.conversation(id as Conversation['id'], this.context);
  }

  /**
   * Reads the setup again and offers the chat only the actions turned on now (and the skills),
   * so a model never sees a tool it may not call.
   */
  private async prepare(chat: Conversation): Promise<void> {
    this.setupCache = await this.deps.setup();
    const enabled = new Set([...this.setupCache.tools, ASK_AI_SKILL_TOOL]);
    await chat.configure(
      { tools: this.tools.filter((registration) => enabled.has(registration.name)) },
      this.context,
    );
  }

  /** Sends the user's message; the same `requestId` again finds the same submission. */
  async send(chat: Conversation, text: string, requestId: string) {
    await this.prepare(chat);
    return chat.submit(
      { type: 'input', content: text, requestId, whenBusy: 'followUp' },
      this.context,
    );
  }

  async stop(chat: Conversation): Promise<void> {
    await chat.abort(this.context);
  }

  /**
   * The user's answer to a call that waits for approval: runs it when approved, then tells the
   * model what happened. The decision is written first, so a restart while the call runs never
   * runs it again, and a second answer to the same call is refused.
   */
  async decide(chat: Conversation, callId: string, approved: boolean) {
    const view = await chat.context(this.context);
    const pending = pendingApprovals(view).find((entry) => entry.callId === callId);
    if (!pending) return { ok: false as const, error: 'not_pending' };
    await chat.submit(
      {
        type: 'write',
        entry: { kind: ASK_AI_DECISION_ENTRY, data: { callId, approved } },
        requestId: `decision:${callId}`,
      },
      this.context,
    );
    await this.prepare(chat);
    const { tool, args } = pending.approval;
    let text: string;
    let result: unknown;
    if (approved) {
      const messages = await contextMessages(chat, this.context);
      result = await this.deps.callAction(tool, args, readDurableConversation(messages));
      text = `The user approved the ${tool} call ${callId}. Its result: ${resultText(result)}`;
    } else {
      text = `The user declined the ${tool} call ${callId}; it did not run.`;
    }
    const outcome = {
      callId,
      approved,
      ...(approved ? { result: JSON.parse(resultText(result)) as JsonObject[string] } : {}),
    };
    const submission = await chat.submit(
      {
        type: 'input',
        content: text,
        entry: { kind: ASK_AI_OUTCOME_ENTRY, data: outcome },
        requestId: `outcome:${callId}`,
        whenBusy: 'followUp',
      },
      this.context,
    );
    return { ok: true as const, submission };
  }

  async close(): Promise<void> {
    await this.harness.close(this.context);
  }
}

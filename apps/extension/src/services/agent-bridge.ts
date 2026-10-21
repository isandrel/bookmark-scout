/**
 * Access for local AI agents (Options > For developers): the background's end of the bookmark-scout-mcp bridge
 * (`packages/mcp-bridge`). While the setting is on and native messaging is allowed, it starts the
 * bridge program through native messaging, tells it which actions agents may use (the registry's
 * entries as JSON Schema), and answers their calls through `runAction`, like Ask AI's tools.
 *
 * Local agents look things up, and change bookmarks only while the user allows it, each change
 * after the user approves it in the browser (`agent-approvals.ts`). What an agent may use is
 * decided here and in `runAction`, never by the bridge program or the agent: the tool list leaves
 * out what the user turned off, a call for anything else is refused, and calls are rate limited.
 * Titles and URLs in results have
 * private values hidden unless the user turned that off. Calls are in the AI activity log, with
 * the name the agent gave, while recording is on.
 */
import {
  type BridgeTool,
  type CallMessage,
  type ClientInfo,
  type HelloMessage,
  hostMessageSchema,
  NATIVE_HOST_NAME,
  PROTOCOL_VERSION,
  profileIdSchema,
} from '@bookmark-scout/mcp-bridge/protocol';
import { z } from 'zod';

/**
 * This browser profile's random id, which tells agents which profile they reach. It names this
 * profile only, so it stays in local storage.
 */
const agentBridgeProfileValue = defineStoredValue<string>(STORAGE_ITEMS.agentBridgeProfile, {
  parse: (raw) => (profileIdSchema.safeParse(raw).success ? (raw as string) : ''),
  empty: '',
  isEmpty: (id) => id === '',
});

const PROFILE_ID_LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PROFILE_ID_LENGTH = 12;

/** The profile id, made on first use. */
function getAgentBridgeProfileId(): Promise<string> {
  return agentBridgeProfileValue.update(
    (current) =>
      current ||
      Array.from(
        crypto.getRandomValues(new Uint8Array(PROFILE_ID_LENGTH)),
        (byte) => PROFILE_ID_LETTERS[byte % PROFILE_ID_LETTERS.length],
      ).join(''),
  );
}

const bridgeConfig = readConfig(
  'ai/agent-bridge',
  z.strictObject({
    reconnect_seconds: z.array(z.number().positive()).min(1),
    max_calls_per_minute: z.number().int().positive(),
    max_concurrent_calls: z.number().int().positive(),
    max_argument_chars: z.number().int().positive(),
  }),
);

const MINUTE_MS = 60_000;

type Port = Browser.runtime.Port;

/** An action as local agents see it. Annotations are hints for the agent; nothing relies on them. */
export function toBridgeTool(id: ActionId): BridgeTool {
  const action = getAction(id);
  const schema = (type: z.ZodType, io: 'input' | 'output') => {
    // MCP clients validate with their own JSON Schema draft; the dialect marker is left out.
    const { $schema: _dialect, ...json } = z.toJSONSchema(type, { io, unrepresentable: 'any' });
    return json;
  };
  return {
    name: id,
    description: action.agent?.description ?? '',
    inputSchema: action.input ? schema(action.input, 'input') : { type: 'object' },
    ...(action.output ? { outputSchema: schema(action.output, 'output') } : {}),
    annotations: {
      readOnlyHint: !changesBookmarks(id),
      destructiveHint: action.risk === 'destructive',
      openWorldHint: Boolean(action.agent?.untrusted || action.permission === 'webAccess'),
    },
  };
}

/** Reads a page in the AI host page, which can parse HTML where the background cannot. */
function readPageForAgents(settings: Settings) {
  return async (url: string) =>
    (await withAIHost(
      null,
      { locale: resolveAppLocale(settings.language), source: 'agentBridge' },
      (host) => host.readPage(url),
    )) ?? undefined;
}

/** What a local agent's calls may use: the active tab, and page reading when it is on and allowed. */
export async function createAgentBridgeContext(
  settings: Settings,
  client: ClientInfo,
): Promise<ActionContext> {
  const readPages = settings.aiReadPageContent && (await hasPermission('pageReading'));
  return {
    client: { kind: 'external', name: client.name },
    settings,
    activeTab: activeTabPage,
    ...(readPages ? { readPage: readPageForAgents(settings) } : {}),
  };
}

/** Hides private values in every `title` and `url` of a result, by the Privacy Scanner's rules. */
export function redactForAgents(value: unknown, settings: Settings): unknown {
  const options = {
    sensitiveParams: settings.privacyScannerSensitiveParams,
    emailDetection: settings.privacyScannerEmailDetection,
  };
  const walk = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(walk);
    if (!isPlainObject(item)) return item;
    const entries = Object.entries(item).map(([key, field]) => {
      if ((key === 'title' || key === 'url') && typeof field === 'string') {
        return [key, redactPrivateText({ [key]: field }, options)[key]];
      }
      return [key, walk(field)];
    });
    return Object.fromEntries(entries);
  };
  return walk(value);
}

type CallAnswer = { isError: boolean; result: Record<string, unknown> };

const refused = (code: ActionErrorCode, message: string, hint?: string): CallAnswer => ({
  isError: true,
  result: actionError(code, message, hint ? { hint } : {}),
});

/** What the agent is told when a change was not approved. */
const NOT_APPROVED: Record<Exclude<ApprovalOutcome, 'approved'>, [string, string]> = {
  declined: ['The user declined this change.', 'Ask the user what they want instead.'],
  expired: ['Nobody answered the approval in time; nothing was changed.', 'Ask the user first.'],
  cancelled: ['The request was cancelled before it was answered.', 'Try again if still needed.'],
  busy: ['Too many changes are waiting for approval.', 'Wait for the user to answer them.'],
};

/**
 * Every change a local agent asks for waits for the user's approval in the browser, whatever the
 * agent says about it. A call that would be refused or fail anyway (turned off, invalid input, a
 * plan that no longer exists, a change already undone) is answered at once with the reason and
 * never shown. Undefined when the call may run.
 */
async function approvalFor(
  call: CallMessage,
  context: ActionContext,
): Promise<CallAnswer | undefined> {
  if (!isActionId(call.tool) || getAction(call.tool).risk === 'read') return undefined;
  const problem = await checkActionCall(call.tool, call.args, context);
  if (problem) return { isError: true, result: problem };
  const outcome = await requestAgentApproval({
    id: call.id,
    client: call.client.name,
    tool: call.tool,
    input: call.args,
  });
  if (outcome === 'approved') return undefined;
  const [message, hint] = NOT_APPROVED[outcome];
  return refused('not_allowed', message, hint);
}

/** Start times of the calls in the last minute, and the calls running now. */
const recentCalls: number[] = [];
let runningCalls = 0;

/** Answers one call from a local agent; never throws. */
export async function answerAgentCall(call: CallMessage): Promise<CallAnswer> {
  const now = Date.now();
  while (recentCalls.length > 0 && (recentCalls[0] ?? 0) <= now - MINUTE_MS) recentCalls.shift();
  if (recentCalls.length >= bridgeConfig.max_calls_per_minute) {
    return refused('unavailable', 'Too many requests from local agents.', 'Wait a minute.');
  }
  if (runningCalls >= bridgeConfig.max_concurrent_calls) {
    return refused('unavailable', 'Too many requests are running.', 'Wait for one to finish.');
  }
  if (JSON.stringify(call.args).length > bridgeConfig.max_argument_chars) {
    return refused('too_large', 'The arguments are too long.');
  }
  recentCalls.push(now);
  runningCalls += 1;
  try {
    const settings = await getSettings();
    if (!settings.agentBridgeEnabled) {
      return refused('not_allowed', 'The user turned off access for local agents.');
    }
    const context = await createAgentBridgeContext(settings, call.client);
    const approval = await approvalFor(call, context);
    if (approval) return approval;
    const result = await runAction(call.tool, call.args, context);
    if (isActionError(result)) return { isError: true, result };
    // Only what the advertised output schema describes is sent.
    const output = isActionId(call.tool)
      ? getAction(call.tool).output?.safeParse(result)
      : undefined;
    if (!output?.success || !isPlainObject(output.data)) {
      return refused('failed', 'The result could not be sent.');
    }
    const data = settings.agentBridgeRedactUrls
      ? redactForAgents(output.data, settings)
      : output.data;
    return { isError: false, result: data as Record<string, unknown> };
  } catch (error) {
    return refused('failed', getErrorMessage(error));
  } finally {
    runningCalls -= 1;
  }
}

/** The hello the bridge program passes to every agent: this profile and the tools it may use. */
async function buildHello(settings: Settings): Promise<HelloMessage> {
  const context = await createAgentBridgeContext(settings, { name: '' });
  return {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    extensionVersion: browser.runtime.getManifest().version,
    browser: currentBrowser(),
    profileId: await getAgentBridgeProfileId(),
    tools: (await agentActionIds(context)).map(toBridgeTool),
  };
}

let port: Port | undefined;
/** The last hello sent on `port`, so a settings change that changes nothing sends nothing. */
let sentHello = '';
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

async function sendHello(to: Port, settings: Settings): Promise<void> {
  const hello = JSON.stringify(await buildHello(settings));
  if (port !== to || hello === sentHello) return;
  sentHello = hello;
  to.postMessage(JSON.parse(hello));
}

let statusWrites: Promise<unknown> = Promise.resolve();

/** Stores the status for Options; writes land in the order they were made. */
function setStatus(status: AgentBridgeStatus): Promise<unknown> {
  statusWrites = statusWrites.then(() => agentBridgeStatusValue.set(status)).catch(() => undefined);
  return statusWrites;
}

/** The browser's reason a port closed: `lastError` in Chrome, `port.error` in Firefox. */
function disconnectReason(closed: Port): string | undefined {
  return (
    browser.runtime.lastError?.message ??
    (closed as Port & { error?: { message?: string } }).error?.message
  );
}

const NOT_INSTALLED = /not found|no such native application/i;

function scheduleRetry(): void {
  const delays = bridgeConfig.reconnect_seconds;
  const seconds = delays[Math.min(attempt, delays.length - 1)] ?? delays[0] ?? 60;
  attempt += 1;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void syncAgentBridge(), seconds * MS_PER_SECOND);
}

async function onHostMessage(from: Port, raw: unknown): Promise<void> {
  const parsed = hostMessageSchema.safeParse(raw);
  if (!parsed.success) return;
  const message = parsed.data;
  if (message.type === 'ready') {
    attempt = 0;
    await setStatus({ state: 'ready' });
    return;
  }
  // A cancelled change stops waiting for approval; a running lookup just finishes.
  if (message.type === 'cancel') {
    cancelAgentApproval(message.id);
    return;
  }
  const answer = await answerAgentCall(message);
  if (port === from) from.postMessage({ type: 'result', id: message.id, ...answer });
}

async function connect(): Promise<void> {
  await setStatus({ state: 'connecting' });
  let opened: Port;
  try {
    opened = browser.runtime.connectNative(NATIVE_HOST_NAME);
  } catch (error) {
    await setStatus({ state: 'failed', detail: getErrorMessage(error) });
    scheduleRetry();
    return;
  }
  port = opened;
  sentHello = '';
  opened.onMessage.addListener((message: unknown) => void onHostMessage(opened, message));
  opened.onDisconnect.addListener(() => {
    const reason = disconnectReason(opened);
    if (port !== opened) return;
    port = undefined;
    // No one is left to receive the answer.
    cancelAllAgentApprovals();
    void setStatus({
      state: reason && NOT_INSTALLED.test(reason) ? 'notInstalled' : 'failed',
      ...(reason ? { detail: reason.slice(0, 500) } : {}),
    });
    scheduleRetry();
  });
  await sendHello(opened, await getSettings());
}

let syncing: Promise<void> = Promise.resolve();

/**
 * Starts or stops the bridge to match the setting and the permission, and sends the bridge an
 * up-to-date tool list when it is running (the user may have turned an action off). Calls run one
 * after another, so two changes at once never open two connections.
 */
export function syncAgentBridge(): Promise<void> {
  syncing = syncing.then(syncNow, syncNow);
  return syncing;
}

async function syncNow(): Promise<void> {
  clearTimeout(retryTimer);
  const settings = await getSettings();
  const wanted = settings.agentBridgeEnabled && (await hasPermission('agentBridge'));
  if (!wanted) {
    attempt = 0;
    const closing = port;
    port = undefined;
    closing?.disconnect();
    cancelAllAgentApprovals();
    await setStatus({ state: 'off' });
    return;
  }
  if (port) {
    await sendHello(port, settings);
    return;
  }
  await connect();
}

/**
 * Called once from the background: follows the setting, the permission, and Options' Try again.
 * Listeners are added synchronously so they are in place whenever the worker wakes.
 */
export function registerAgentBridge(): void {
  const sync = () => void syncAgentBridge().catch(() => undefined);
  settingsValue.watch(sync);
  watchPermissions(sync);
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isPlainObject(message) || message.type !== AGENT_BRIDGE_MESSAGE.retry) return undefined;
    attempt = 0;
    sync();
    return undefined;
  });
  sync();
}

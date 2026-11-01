/**
 * The background's side of Ask AI on Pi Durable. The chats run in the AI host page
 * (`ask-ai-host.lazy.ts`), which in Chrome has only the runtime API, so the background:
 * - opens the page for a chat UI and keeps it open until the page says it is idle;
 * - sets up each answer from the current settings (service and key, prompt, enabled actions);
 * - runs every action call, as it does for local agents (`agent-bridge.ts`);
 * - streams provider requests through the logging fetch (`ai-host-stream-fetch.ts`);
 * - keeps the chat list, and reopens the page after a restart to pick up a running answer.
 */

/** What keeps the AI host page open for Ask AI (`holdAIHost`). */
const HOST_HOLDER = 'ask-ai';

/** Each open chat's logging token, released when the chat's next answer gets a new one. */
const chatTokens = new Map<string, () => void>();

/** What Ask AI's calls may use in the background: the active tab, and page reading when allowed. */
async function askAIContext(settings: Settings): Promise<ActionContext> {
  const readPages = settings.aiReadPageContent && (await hasPermission('pageReading'));
  return {
    client: { kind: 'askAI' },
    settings,
    activeTab: activeTabPage,
    ...(readPages
      ? {
          readPage: async (url: string) =>
            (await withAIHost(
              null,
              { locale: resolveAppLocale(settings.language), source: 'askAI' },
              (host) => host.readPage(url),
            )) ?? undefined,
        }
      : {}),
  };
}

/** One answer's setup, from the current settings; an error says what to fix, in the user's language. */
export async function askAISetup(chatId: string): Promise<AskAIHostSetup> {
  const appSettings = await getSettings();
  try {
    const settings = await getActiveAISettings(appSettings.aiEnabled, 'askAI');
    const [tools, prompt, userSkills] = await Promise.all([
      askAIContext(appSettings).then(agentActionIds),
      buildPrompt('ask_ai', appSettings),
      askAiSkillsValue.get(),
    ]);
    chatTokens.get(chatId)?.();
    const token = crypto.randomUUID();
    chatTokens.set(
      chatId,
      registerAIHostCall(token, {
        provider: settings.provider,
        model: settings.model,
        source: 'askAI',
      }),
    );
    return {
      ok: true,
      settings,
      token,
      locale: resolveAppLocale(appSettings.language),
      system: prompt.system,
      tools,
      maxSteps: appSettings.askAiMaxSteps,
      webSearch: appSettings.askAiWebSearch && supportsWebSearch(settings.provider),
      webSearchMaxUses: ASK_AI_CONFIG.web_search_max_uses,
      skills: { user: userSkills, disabled: appSettings.askAiDisabledSkills },
    };
  } catch (error) {
    return { ok: false, error: describeAIError(error) };
  }
}

async function callAction(message: unknown): Promise<unknown> {
  const parsed = askAICallActionSchema.safeParse(message);
  if (!parsed.success) return actionError('invalid_input', 'Malformed action call');
  const { name, args, untrustedContentSeen, knownUrls } = parsed.data;
  const context = await askAIContext(await getSettings());
  return runAction(name, args, {
    ...context,
    conversation: { untrustedContentSeen, knownUrls: new Set(knownUrls) },
  });
}

/** Asks the host page to delete chats the list dropped; the page is open, since it reported them. */
function forgetChats(chatIds: string[]): void {
  if (chatIds.length === 0) return;
  const message = { type: ASK_AI_MESSAGE.forget, chatIds };
  void browser.runtime.sendMessage(message).catch(() => undefined);
}

async function recordHostChat(message: unknown): Promise<void> {
  const parsed = askAIChatUpdateSchema.safeParse(message);
  if (!parsed.success) return;
  const { chatId, title, updatedAt, running } = parsed.data;
  const { askAiChatsMax } = await getSettings();
  forgetChats(await recordChat({ id: chatId, title, updatedAt, running }, askAiChatsMax));
}

/** Opens the host page to pick up the answers a stopped worker or browser left running. */
async function resumeRunningChats(): Promise<void> {
  const running = (await askAiChatsValue.get()).filter((chat) => chat.running);
  if (running.length === 0) return;
  await holdAIHost(HOST_HOLDER);
  const message = { type: ASK_AI_MESSAGE.resume, chatIds: running.map((chat) => chat.id) };
  await browser.runtime.sendMessage(message).catch(() => undefined);
}

export function registerAskAI(): void {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === AI_HOST_FETCH_PORT && port.sender && isFromAIHost(port.sender)) {
      serveAIHostFetchPort(port, aiHostCallFetch);
    }
  });
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isPlainObject(message) || sender.id !== browser.runtime.id) return undefined;
    // From any extension page (the tests open the popup as a tab); never from a web page.
    if (
      message.type === ASK_AI_MESSAGE.open &&
      sender.url?.startsWith(browser.runtime.getURL('/'))
    ) {
      void holdAIHost(HOST_HOLDER).then(
        () => sendResponse({ ok: true }),
        (error: unknown) => sendResponse({ ok: false, error: getErrorMessage(error) }),
      );
      return true;
    }
    if (!isFromAIHost(sender)) return undefined;
    switch (message.type) {
      case ASK_AI_MESSAGE.setup:
        void askAISetup(String(message.chatId)).then(sendResponse);
        return true;
      case ASK_AI_MESSAGE.callAction:
        void callAction(message).then(sendResponse, (error: unknown) =>
          sendResponse(actionError('failed', getErrorMessage(error))),
        );
        return true;
      case ASK_AI_MESSAGE.chat:
        void recordHostChat(message);
        return undefined;
      case ASK_AI_MESSAGE.chatDeleted: {
        const parsed = askAIChatDeletedSchema.safeParse(message);
        if (parsed.success) {
          chatTokens.get(parsed.data.chatId)?.();
          chatTokens.delete(parsed.data.chatId);
          void removeChat(parsed.data.chatId);
        }
        return undefined;
      }
      case ASK_AI_MESSAGE.idle:
        void releaseAIHost(HOST_HOLDER);
        return undefined;
      default:
        return undefined;
    }
  });
  void resumeRunningChats().catch((error: unknown) => {
    aiLogger.error({ error }, 'Failed to pick up Ask AI chats after a restart');
  });
}

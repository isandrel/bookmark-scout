/**
 * Starts Ask AI in the AI host page. The chats themselves load with the first chat UI or the
 * background's first request (`ask-ai-host.lazy.ts`); listening starts at once, so nothing sent
 * while they load is lost.
 */

let chatModule: Promise<typeof import('./ask-ai-host.lazy')> | undefined;
const loadChats = () => (chatModule ??= import('./ask-ai-host.lazy'));

export function startAskAIHost(): void {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== ASK_AI_PORT || port.sender?.id !== browser.runtime.id) return;
    const buffered: unknown[] = [];
    const hold = (message: unknown) => buffered.push(message);
    port.onMessage.addListener(hold);
    void loadChats().then(
      ({ serve }) => {
        port.onMessage.removeListener(hold);
        serve(port, buffered);
      },
      (error: unknown) => {
        port.postMessage({ type: 'error', message: getErrorMessage(error) });
        port.disconnect();
      },
    );
  });
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (!isPlainObject(message) || sender.id !== browser.runtime.id) return undefined;
    if (message.type === ASK_AI_MESSAGE.resume || message.type === ASK_AI_MESSAGE.forget) {
      void loadChats().then(({ handleBackgroundMessage }) => handleBackgroundMessage(message));
    }
    return undefined;
  });
}

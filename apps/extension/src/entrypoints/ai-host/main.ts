// The AI host page: an offscreen document in Chrome and Edge, a frame in Firefox's background page.
// It runs AI quick save's requests (services/quick-save-ai-runner.ts explains why it exists) and
// Ask AI's chats (services/ask-ai-host.lazy.ts).
startAIHost();
startAskAIHost();

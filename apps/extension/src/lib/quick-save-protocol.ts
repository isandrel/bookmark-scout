/**
 * What quick save passes between the background, the notification it injects into a tab, the
 * popup, and the AI host page. No dependencies, so the notification script injected into pages
 * stays small; the schemas that check incoming messages are in `quick-save-validation.ts`.
 */

/** Message `type`s, namespaced so they never match another feature's messages. */
export const QUICK_SAVE_MESSAGE = {
  /** The notification or the popup asks the background to act on the last quick save. */
  action: 'quick-save/action',
  /** The background asks the AI host page for folder suggestions or page text. */
  hostGenerate: 'quick-save/ai-host-generate',
  hostReadPage: 'quick-save/ai-host-read-page',
  /** The AI host page asks the background to send one provider request for it. */
  hostFetch: 'quick-save/ai-host-fetch',
} as const;

export type QuickSaveStatus = 'saving' | 'saved' | 'duplicate' | 'failed' | 'removed';

export type QuickSaveTheme = 'light' | 'dark' | 'system';

export type QuickSaveToastActionId = 'undo' | 'openAISettings';

/** Everything the notification shows, with every string already in the app language. */
export type QuickSaveToastView = {
  /** The quick save this notification belongs to; actions echo it back. */
  id: string;
  status: QuickSaveStatus;
  theme: QuickSaveTheme;
  /** The language tag of the strings, for `lang`. */
  lang: string;
  /** The landmark's name, such as "Bookmark Scout". */
  label: string;
  title: string;
  /** The folder path, under the title. */
  detail?: string;
  /** A sentence about a fallback or failure. */
  note?: string;
  actions: { id: QuickSaveToastActionId; label: string }[];
  /** "Move to", over the alternatives. */
  alternativesLabel: string;
  alternatives: { index: number; label: string; title: string }[];
  dismissLabel: string;
  /** Milliseconds before it closes on its own, paused on hover and focus; null stays open. */
  autoDismissMs: number | null;
};

export type QuickSaveActionMessage = {
  type: typeof QUICK_SAVE_MESSAGE.action;
  /** The quick save the notification shows; a stale notification cannot act on a newer one. */
  id: string;
} & ({ action: 'undo' | 'dismiss' | 'openAISettings' } | { action: 'move'; index: number });

/** The background's answer to an action: the notification's next state, or null to close it. */
export type QuickSaveActionResponse = { view: QuickSaveToastView | null };

/** A provider request the AI host page hands to the background, which logs and sends it. */
export type QuickSaveHostFetchMessage = {
  type: typeof QUICK_SAVE_MESSAGE.hostFetch;
  /** The token of the AI call in progress; requests outside one are refused. */
  token: string;
  url: string;
  method: string;
  headers: [string, string][];
  body?: string;
};

export type QuickSaveHostFetchResponse =
  | { ok: true; status: number; statusText: string; headers: [string, string][]; body: string }
  | { ok: false; error: string };

/** A message for the AI host page: one structured AI call, or reading one page's text. */
export type QuickSaveHostRequest =
  | {
      type: typeof QUICK_SAVE_MESSAGE.hostGenerate;
      token: string;
      /** AISettings; the AI client checks them again before use. */
      settings: Record<string, unknown>;
      source: string;
      /** The locale error messages are written in; the host page cannot read the settings. */
      locale: string;
      schema: 'folderRecommendations';
      system: string;
      prompt: string;
    }
  | { type: typeof QUICK_SAVE_MESSAGE.hostReadPage; token: string; url: string };

export type QuickSaveHostResponse =
  | { ok: true; object?: unknown; page?: { title?: string; text: string } | null }
  | { ok: false; error: string };

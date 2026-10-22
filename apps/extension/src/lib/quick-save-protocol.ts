/**
 * What quick save passes between the background, the notification it injects into a tab, the
 * popup, and the AI host page. No dependencies, so the notification script injected into pages
 * stays small; the schemas that check incoming messages are in `quick-save-validation.ts`.
 */

/** Message `type`s, namespaced so they never match another feature's messages. */
export const QUICK_SAVE_MESSAGE = {
  /** The notification or the popup asks the background to act on the last quick save. */
  action: 'quick-save/action',
  /**
   * The background asks the AI host page for folder suggestions, page text, a page head, or the
   * readable text of a page it downloaded.
   */
  hostGenerate: 'quick-save/ai-host-generate',
  hostReadPage: 'quick-save/ai-host-read-page',
  hostReadHead: 'quick-save/ai-host-read-head',
  hostReadText: 'quick-save/ai-host-read-text',
  /** The AI host page asks the background to send one provider request for it. */
  hostFetch: 'quick-save/ai-host-fetch',
  /** The AI host page reports a call to the built-in model for the AI activity log. */
  hostActivity: 'quick-save/ai-host-activity',
  /** The AI host page's warm built-in session went idle, so the page can close. */
  hostIdle: 'quick-save/ai-host-idle',
} as const;

/**
 * What the notification says. `expired` is only ever shown, never stored: a newer quick save
 * replaced the one an older notification belongs to, so its buttons no longer act.
 */
export type QuickSaveStatus = 'saving' | 'saved' | 'duplicate' | 'failed' | 'removed' | 'expired';

export type QuickSaveTheme = 'light' | 'dark' | 'system';

/** Buttons the notification can show; each is also an action message the background answers. */
export const QUICK_SAVE_TOAST_ACTIONS = [
  'undo',
  'openAISettings',
  'retry',
  'saveWithoutAI',
] as const;

export type QuickSaveToastActionId = (typeof QUICK_SAVE_TOAST_ACTIONS)[number];

/** Everything the notification shows, with every string already in the app language. */
export type QuickSaveToastView = {
  /** The quick save this notification belongs to; actions echo it back. */
  id: string;
  /**
   * Random bytes in the token the page's notification makes for itself on its first view; the
   * notification reads no config of its own, so the page gets no more of the extension.
   */
  documentTokenBytes: number;
  status: QuickSaveStatus;
  theme: QuickSaveTheme;
  /** The language tag of the strings, for `lang`. */
  lang: string;
  /** The writing direction of that language; the page's own direction never applies. */
  dir: 'ltr' | 'rtl';
  /** The landmark's name, such as "Bookmark Scout". */
  label: string;
  title: string;
  /** The folder path, under the title. */
  detail?: string;
  /** A sentence about a fallback or failure. */
  note?: string;
  /** The first `primary` one is drawn filled. */
  actions: { id: QuickSaveToastActionId; label: string; primary?: boolean }[];
  /** "Move to", over the alternatives. */
  alternativesLabel: string;
  alternatives: { index: number; label: string; title: string }[];
  dismissLabel: string;
  /** Milliseconds before it closes on its own, paused on hover and focus; null stays open. */
  autoDismissMs: number | null;
  /** CSS pixels the notification may stick out of the viewport and still count as shown. */
  visibleTolerancePx: number;
};

/**
 * The page a notification must be drawn in: the document that showed this quick save before (its
 * token from an earlier `render`), and the address it was saved from. Either one differing means
 * the tab has moved on, and the result goes to the popup instead.
 */
export type QuickSaveToastBinding = { document?: string; url?: string };

/** What `render` did: whether the notification is on screen, and this document's token. */
export type QuickSaveRenderResult = { shown: boolean; document: string };

/** What the injected script installs once per document (`entrypoints/quick-save-toast`). */
export type QuickSaveToastController = {
  render: (view: QuickSaveToastView, binding?: QuickSaveToastBinding) => QuickSaveRenderResult;
};

export type QuickSaveActionMessage = {
  type: typeof QUICK_SAVE_MESSAGE.action;
  /** The quick save the notification shows; a stale notification cannot act on a newer one. */
  id: string;
} & ({ action: 'dismiss' | QuickSaveToastActionId } | { action: 'move'; index: number });

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

/**
 * The answer shapes the AI host page can ask a model for, by name; the host holds the schema for
 * each (`AI_HOST_SCHEMAS` in `quick-save-ai-runner.ts`). A new structured AI call from the
 * background is a new name here and a schema there.
 */
export const AI_HOST_SCHEMA_NAMES = [
  'folderRecommendations',
  // Ids picked from `choices` (the browser's built-in model choosing among shortlisted folders).
  'folderIds',
  // One batch of AI Folder Reorganization run as a background job.
  'reorganization',
] as const;

export type AIHostSchemaName = (typeof AI_HOST_SCHEMA_NAMES)[number];

/**
 * One call to the browser's built-in model in the AI host page, which the background records in
 * the AI activity log (the page cannot reach storage, and no fetch passes through the background).
 */
export type QuickSaveHostActivityMessage = {
  type: typeof QUICK_SAVE_MESSAGE.hostActivity;
  /** The token of the AI call in progress; entries outside one are refused. */
  token: string;
  input: string;
  output?: string;
  error?: string;
  durationMs: number;
};

/** The AI host page's warm built-in session went idle; the background may close the page. */
export type QuickSaveHostIdleMessage = { type: typeof QUICK_SAVE_MESSAGE.hostIdle };

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
      schema: AIHostSchemaName;
      /** For `folderIds`: the ids the answer may hold, and how many at most. */
      choices?: string[];
      maxChoices?: number;
      system: string;
      prompt: string;
    }
  | { type: typeof QUICK_SAVE_MESSAGE.hostReadPage; token: string; url: string }
  | {
      type: typeof QUICK_SAVE_MESSAGE.hostReadHead;
      token: string;
      /** A page's `<head>` the background fetched; a service worker has no DOM parser. */
      html: string;
      descriptions: boolean;
    }
  | {
      type: typeof QUICK_SAVE_MESSAGE.hostReadText;
      token: string;
      /** A whole page the background downloaded for Index Page Text. */
      html: string;
      maxChars: number;
    };

/**
 * What reading a page for Index Page Text found: its readable text, no text, or a page that asks
 * for a sign-in instead of showing its content, whose text is never kept.
 */
export type PageTextReading = { status: 'read'; text: string } | { status: 'empty' | 'signIn' };

export type QuickSaveHostResponse =
  | {
      ok: true;
      object?: unknown;
      page?: { title?: string; text: string } | null;
      head?: { title?: string; description?: string };
      /** What reading the page found, for `hostReadText`. */
      reading?: PageTextReading;
    }
  | {
      ok: false;
      error: string;
      /** `answer`: the model answered, but not in the requested shape; the request itself worked. */
      errorKind?: 'answer';
    };

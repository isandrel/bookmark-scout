/**
 * Quick save: the keyboard shortcuts that save the current page without opening any extension
 * page (`lib/command-catalog.ts`). Quick save puts the page where the Quick save setting says
 * (`quick-save-target.ts`); AI quick save puts it in the first AI suggestion
 * (`quick-save-ai-host.ts`). A notification in the page (`entrypoints/quick-save-toast`) says
 * where it went and offers Undo and other folders; on pages the extension cannot draw in, the
 * toolbar badge shows the result and the popup shows the notification instead.
 * With Save a Cover With Quick Save and Fetch Covers on, the saved bookmark also gets a cover
 * (`quick-save-cover.ts`) after the save, and the notification offers Remove cover, which puts
 * back the cover it replaced (kept on the record, at most `replaced_cover_max_kb`).
 *
 * The last quick save is kept in session storage, so Undo and Move still work after the service
 * worker restarts. Background only: `registerQuickSave` adds the listeners.
 */

import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';
import type { BookmarkTreeNode } from '@/types';

const quickSaveConfig = readConfig(
  'ui/quick-save',
  z.strictObject({
    recent_alternatives: boundedNumber({ integer: true }),
    visible_tolerance_px: boundedNumber({ integer: false }),
    badge_clear_ms: boundedNumber({ integer: true }),
    popup_result_max_age_ms: boundedNumber({ integer: true }),
    badge_success_text: z.string().min(1).max(INPUT_LIMITS.chars.action_badge),
    badge_failure_text: z.string().min(1).max(INPUT_LIMITS.chars.action_badge),
    badge_success_color: z.string().regex(/^#[0-9a-f]{6}$/i),
    badge_failure_color: z.string().regex(/^#[0-9a-f]{6}$/i),
    cover_picture_wait_ms: boundedNumber({ integer: true }),
    replaced_cover_max_kb: boundedNumber({ integer: true }),
  }),
);

/** The largest cover a quick save replaced that its record keeps for Remove cover to put back. */
const REPLACED_COVER_MAX_BYTES = quickSaveConfig.replaced_cover_max_kb * BYTES_PER_KB;

/** How long the popup offers the last quick save that could not be shown in its page. */
export const QUICK_SAVE_POPUP_MAX_AGE_MS = quickSaveConfig.popup_result_max_age_ms;

const QUICK_SAVE_TOAST_SCRIPT = '/quick-save-toast.js';

const recommendationSchema = z.strictObject({
  type: z.enum(['existing', 'new']),
  folderPath: z.string(),
  folderId: z.string().optional(),
  parentPath: z.string().optional(),
  confidence: z.number(),
  reason: z.string(),
});

/**
 * A folder the notification offers. An AI suggestion for a folder that does not exist yet keeps
 * the suggestion, which creates the folder when chosen.
 */
const alternativeSchema = z.strictObject({
  path: z.array(z.string()),
  folderId: z.string().optional(),
  recommendation: recommendationSchema.optional(),
});

type QuickSaveAlternative = z.infer<typeof alternativeSchema>;

const failureSchema = z.enum(['noPage', 'aiUnavailable', 'aiFailed', 'saveFailed']);

const recordSchema = z.strictObject({
  id: z.string(),
  mode: z.enum(['local', 'ai']),
  status: z.enum(['saving', 'saved', 'duplicate', 'failed', 'removed']),
  at: z.number(),
  tabId: z.number().optional(),
  /**
   * The document in the tab that first showed this quick save's notification. Later views go only
   * to that document; after the tab navigates, the popup shows the result instead.
   */
  documentToken: z.string().max(INPUT_LIMITS.chars.document_token).optional(),
  /** Where the notification goes: the page, or the popup when the page cannot show it. */
  delivery: z.enum(['page', 'popup']),
  page: z.strictObject({ title: z.string(), url: z.string() }),
  bookmarkId: z.string().optional(),
  folderId: z.string().optional(),
  /** Titles from the outermost folder down to the bookmark's folder. */
  path: z.array(z.string()),
  /** The AI suggestion behind the current folder, to offer it again after a move. */
  recommendation: recommendationSchema.optional(),
  /** Folders this quick save created, outermost first; Undo and Move remove them when empty. */
  createdFolderIds: z.array(z.string()),
  /** A new bookmark, or one that was already saved (Undo moves it back). */
  origin: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('created') }),
    z.strictObject({
      kind: z.literal('existing'),
      parentId: z.string(),
      index: z.number().optional(),
      path: z.array(z.string()),
    }),
  ]),
  alternatives: z.array(alternativeSchema),
  /**
   * The cover Save a Cover With Quick Save stored for the bookmark, which Remove cover removes,
   * and the cover of the same address it replaced, which Remove cover puts back.
   */
  cover: z
    .strictObject({
      source: z.enum(COVER_SOURCES),
      replaced: portableCoverSchema
        .extend({ data: z.string().max(base64Length(REPLACED_COVER_MAX_BYTES)) })
        .optional(),
    })
    .optional(),
  fallback: z.enum(['noMatch', 'fixedMissing']).optional(),
  failure: failureSchema.optional(),
  /** A localized reason to show under the title. */
  error: z.string().optional(),
});

export type QuickSaveRecord = z.infer<typeof recordSchema>;

/** The last quick save; null when there is none or it was dismissed. */
export const quickSaveRecordValue = defineStoredValue<QuickSaveRecord | null>(
  STORAGE_ITEMS.quickSave,
  {
    parse: (raw) => {
      const parsed = recordSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    empty: null,
    isEmpty: (value) => value === null,
  },
);

/** Stores `record` unless a newer quick save replaced it meanwhile; true when stored. */
async function storeRecord(record: QuickSaveRecord, replace = false): Promise<boolean> {
  let stored = false;
  await quickSaveRecordValue.update((current) => {
    if (!replace && current && current.id !== record.id) return current;
    stored = true;
    return record;
  });
  return stored;
}

// ---------------------------------------------------------------------------------------------
// Language and view
// ---------------------------------------------------------------------------------------------

/** The bundled locale the app language resolves to. */
export function resolveAppLocale(language: Settings['language']): SupportedLocale {
  if (language !== AUTO_LANGUAGE) return language;
  let uiLanguage = '';
  try {
    uiLanguage = browser.i18n.getUILanguage();
  } catch {
    // Outside the extension (unit tests) the fallback applies.
  }
  return matchBundledLocale(uiLanguage) ?? FALLBACK_LOCALE;
}

async function readSettingsInAppLanguage(): Promise<Settings> {
  const settings = await getSettings();
  await whenLanguageReady();
  return settings;
}

function folderName(path: readonly string[]): string {
  return getBookmarkDisplayTitle(path.at(-1));
}

function pathText(path: readonly string[]): string {
  return path.map((title) => getBookmarkDisplayTitle(title)).join(FOLDER_PATH_SEPARATOR);
}

const FAILURE_TITLES: Record<z.infer<typeof failureSchema>, MessageKey> = {
  noPage: 'quickSave_noPage',
  aiUnavailable: 'quickSave_aiUnavailable',
  aiFailed: 'quickSave_aiFailed',
  saveFailed: 'quickSave_failed',
};

/**
 * The buttons for `record`: Undo after a save, and Remove cover once quick save stored a cover;
 * after a failed AI quick save of a page, Retry (or Open AI settings when AI is not set up) and
 * Save without AI, which uses the Quick save setting.
 */
export function quickSaveActions(record: QuickSaveRecord): QuickSaveToastView['actions'] {
  const removeCover: QuickSaveToastView['actions'] =
    record.cover && record.bookmarkId ? [{ id: 'removeCover', label: t('menu_removeCover') }] : [];
  if (record.status === 'saved' && record.bookmarkId) {
    return [{ id: 'undo', label: t('action_undo') }, ...removeCover];
  }
  if (record.status === 'duplicate') return removeCover;
  if (record.status !== 'failed' || record.mode !== 'ai' || !record.page.url) return [];
  return [
    record.failure === 'aiUnavailable'
      ? { id: 'openAISettings', label: t('quickSave_openAISettings'), primary: true }
      : { id: 'retry', label: t('action_retry'), primary: true },
    { id: 'saveWithoutAI', label: t('quickSave_saveWithoutAI') },
  ];
}

/** What every view shares: theme, language, and the notification's frame. */
function viewFrame(settings: Settings) {
  const lang = toLanguageTag(resolveAppLocale(settings.language));
  return {
    theme: settings.theme,
    lang,
    dir: languageDirection(lang),
    label: t('extName'),
    alternativesLabel: t('quickSave_moveTo'),
    dismissLabel: t('action_dismiss'),
    visibleTolerancePx: quickSaveConfig.visible_tolerance_px,
    documentTokenBytes: INPUT_LIMITS.ids.document_token_bytes,
  } satisfies Partial<QuickSaveToastView>;
}

/**
 * The answer to a button in a notification whose quick save a newer one replaced: only the last
 * quick save is kept, so this one can no longer be undone or moved from here.
 */
export function buildExpiredQuickSaveView(id: string, settings: Settings): QuickSaveToastView {
  return {
    ...viewFrame(settings),
    id,
    status: 'expired',
    title: t('quickSave_replaced'),
    note: t('quickSave_replacedNote'),
    actions: [],
    alternatives: [],
    autoDismissMs: settings.quickSaveNotificationMs,
  };
}

/** The notification for `record`, in the language `t()` shows. */
export function buildQuickSaveView(
  record: QuickSaveRecord,
  settings: Settings,
): QuickSaveToastView {
  const hasFolder = record.status === 'saved' || record.status === 'duplicate';
  const title = (() => {
    switch (record.status) {
      case 'saving':
        return t(record.mode === 'ai' ? 'quickSave_aiSaving' : 'action_saving');
      case 'saved':
        return t('quickSave_savedTo', folderName(record.path));
      case 'duplicate':
        return t('quickSave_alreadyIn', folderName(record.path));
      case 'removed':
        return t('quickSave_removed');
      case 'failed':
        return t(FAILURE_TITLES[record.failure ?? 'saveFailed']);
    }
  })();
  const note =
    record.error ??
    (record.failure === 'aiUnavailable'
      ? t('quickSave_aiUnavailableDesc')
      : record.status === 'saved' && record.fallback === 'noMatch'
        ? t('quickSave_noMatchNote')
        : record.status === 'saved' && record.fallback === 'fixedMissing'
          ? t('quickSave_fixedMissingNote')
          : undefined);
  return {
    ...viewFrame(settings),
    id: record.id,
    status: record.status,
    title,
    ...(hasFolder ? { detail: pathText(record.path) } : {}),
    ...(note ? { note } : {}),
    actions: quickSaveActions(record),
    alternatives: hasFolder
      ? record.alternatives.map((alternative, index) => ({
          index,
          label: truncateText(folderName(alternative.path), settings.truncateLength),
          title: pathText(alternative.path),
        }))
      : [],
    autoDismissMs: record.status === 'saving' ? null : settings.quickSaveNotificationMs,
  };
}

/**
 * The last quick save for the popup: one its page could not show, while it is recent. A retry
 * started from the popup shows there while it runs.
 */
export function isQuickSaveForPopup(record: QuickSaveRecord | null, now = Date.now()): boolean {
  return (
    record !== null && record.delivery === 'popup' && now - record.at <= QUICK_SAVE_POPUP_MAX_AGE_MS
  );
}

// ---------------------------------------------------------------------------------------------
// Showing the result
// ---------------------------------------------------------------------------------------------

/**
 * Draws the notification in the tab, in the page `binding` names. Resolves to the document's token
 * when it is on screen; null where the browser does not let the extension in, the tab shows
 * another page now, or the page hid the notification.
 */
async function showInTab(
  tabId: number,
  view: QuickSaveToastView,
  binding: QuickSaveToastBinding,
): Promise<string | null> {
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: [QUICK_SAVE_TOAST_SCRIPT] });
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: (toastView: QuickSaveToastView, toastBinding: QuickSaveToastBinding) => {
        const scope = globalThis as typeof globalThis & {
          __bookmarkScoutQuickSave?: QuickSaveToastController;
        };
        return scope.__bookmarkScoutQuickSave?.render(toastView, toastBinding) ?? null;
      },
      args: [view, binding],
    });
    const rendered = result?.result as QuickSaveRenderResult | null | undefined;
    return rendered?.shown === true ? rendered.document : null;
  } catch {
    return null;
  }
}

/** The toolbar button's API, for its badge. */
export function toolbarAction() {
  // Firefox's Manifest V2 build has browserAction instead of action.
  return browser.action ?? browser.browserAction;
}

/** The badge shows the result for a moment, and the popup opens where the browser allows it. */
async function showInToolbar(record: QuickSaveRecord): Promise<void> {
  const action = toolbarAction();
  if (!action) return;
  const ok = record.status === 'saved' || record.status === 'duplicate';
  const tabId = record.tabId;
  try {
    await action.setBadgeBackgroundColor({
      color: ok ? quickSaveConfig.badge_success_color : quickSaveConfig.badge_failure_color,
      ...(tabId !== undefined ? { tabId } : {}),
    });
    await action.setBadgeText({
      text: ok ? quickSaveConfig.badge_success_text : quickSaveConfig.badge_failure_text,
      ...(tabId !== undefined ? { tabId } : {}),
    });
    setTimeout(() => {
      void action.setBadgeText({ text: '', ...(tabId !== undefined ? { tabId } : {}) });
    }, quickSaveConfig.badge_clear_ms);
  } catch {
    // The tab may be gone; the popup still shows the result.
  }
  try {
    await action.openPopup();
  } catch {
    // Not allowed here (no focused window, or the browser requires a click); the badge stays.
  }
}

/**
 * Shows `record` in its page, or in the toolbar when the page cannot show it, has hidden it, or
 * the tab has moved on to another page since the quick save began. With `cover`, the page shows
 * it only once the picture of the tab is taken, so the notification is never in it.
 */
async function deliver(
  record: QuickSaveRecord,
  settings: Settings,
  cover?: QuickSaveCover | null,
): Promise<QuickSaveRecord> {
  await cover?.ready;
  let shown = record;
  if (record.delivery === 'page' && record.tabId !== undefined) {
    const documentToken = await showInTab(record.tabId, buildQuickSaveView(record, settings), {
      ...(record.documentToken ? { document: record.documentToken } : {}),
      ...(record.page.url ? { url: record.page.url } : {}),
    });
    if (documentToken !== null) {
      if (documentToken === record.documentToken) return record;
      // The first view this page showed: later ones go to this document only.
      const bound = { ...record, documentToken };
      await storeRecord(bound);
      return bound;
    }
    shown = { ...record, delivery: 'popup' };
    if (!(await storeRecord(shown))) return shown;
  }
  if (shown.status !== 'saving') await showInToolbar(shown);
  return shown;
}

// ---------------------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------------------

let rankingIndex: FolderRankingIndex | undefined;

/** Forgets the folder ranking index; the next quick save rebuilds it from the current tree. */
export function invalidateQuickSaveIndex(): void {
  rankingIndex = undefined;
}

function getRankingIndex(tree: readonly BookmarkTreeNode[]): FolderRankingIndex {
  rankingIndex ??= buildFolderRankingIndex(tree);
  return rankingIndex;
}

type QuickSavePage = { title: string; url: string };

function pageOf(tab: Browser.tabs.Tab): QuickSavePage | null {
  const url = tab.url?.trim();
  if (!url) return null;
  return { url, title: tab.title?.trim() || url };
}

async function trackRecentFolder(folderId: string, path: readonly string[]): Promise<void> {
  try {
    await addRecentFolder(folderId, path.at(-1) ?? '');
  } catch (error) {
    bookmarkLogger.error({ error }, 'Failed to track recent folder');
  }
}

/** The bookmark already saved for the page, with where it is. */
async function findExisting(
  url: string,
  folders: ReadonlyMap<string, QuickSaveFolder>,
): Promise<{ node: Browser.bookmarks.BookmarkTreeNode; path: string[] } | undefined> {
  const [node] = await findBookmarksByUrl(url);
  if (!node?.parentId) return undefined;
  return { node, path: folders.get(node.parentId)?.path ?? [] };
}

function existingRecord(
  base: QuickSaveRecord,
  existing: { node: Browser.bookmarks.BookmarkTreeNode; path: string[] },
  alternatives: QuickSaveAlternative[],
): QuickSaveRecord {
  const parentId = existing.node.parentId ?? '';
  return {
    ...base,
    status: 'duplicate',
    bookmarkId: existing.node.id,
    folderId: parentId,
    path: existing.path,
    origin: { kind: 'existing', parentId, index: existing.node.index, path: existing.path },
    alternatives: alternatives.filter((alternative) => alternative.folderId !== parentId),
  };
}

async function saveLocally(
  base: QuickSaveRecord,
  page: QuickSavePage,
  settings: Settings,
): Promise<QuickSaveRecord> {
  const tree = await fetchBookmarkTree();
  const folders = indexWritableFolders(tree);
  const existing = await findExisting(page.url, folders);
  const recentFolderIds = (await getRecentFolders()).map((folder) => folder.id);
  // Every strategy offers the folders that match the page; only best match chooses one, and only
  // a strong one (FOLDER_RANKING_MIN_SCORE).
  const ranked = rankFolders(getRankingIndex(tree), page, {
    limit: settings.quickSaveAlternatives + 1,
    minScore: Number.MIN_VALUE,
  });
  const target = chooseQuickSaveTarget(tree, {
    strategy: settings.quickSaveFolderStrategy,
    fixedFolderId: settings.quickSaveFixedFolder,
    recentFolderIds,
    ranked,
    minScore: FOLDER_RANKING_MIN_SCORE,
    alternatives: settings.quickSaveAlternatives,
    recentAlternatives: quickSaveConfig.recent_alternatives,
    ...(existing?.node.parentId ? { excludeIds: new Set([existing.node.parentId]) } : {}),
  });

  if (existing) {
    // Offer where it would have gone first, then the other choices; a fallback (the bookmarks
    // bar) says nothing about the page, so it is not offered.
    const choices = target
      ? [...(target.fallback ? [] : [target.folder]), ...target.alternatives]
      : [];
    return existingRecord(
      base,
      existing,
      choices
        .slice(0, settings.quickSaveAlternatives)
        .map(({ id, path }) => ({ folderId: id, path })),
    );
  }
  if (!target) return { ...base, status: 'failed', failure: 'saveFailed' };

  const { result: bookmark } = await recordBookmarkWrites(
    { action: 'add', title: page.title },
    (writer) => writer.create({ parentId: target.folder.id, title: page.title, url: page.url }),
    { source: 'quick_save' },
  );
  await trackRecentFolder(target.folder.id, target.folder.path);
  return {
    ...base,
    status: 'saved',
    bookmarkId: bookmark.id,
    folderId: target.folder.id,
    path: target.folder.path,
    alternatives: target.alternatives.map(({ id, path }) => ({ folderId: id, path })),
    ...(target.fallback ? { fallback: target.fallback } : {}),
  };
}

/** The suggestion as a choice, with the path it leads to in `tree`; null when it cannot be saved. */
function toAlternative(
  recommendation: FolderRecommendation,
  tree: readonly BookmarkTreeNode[],
): QuickSaveAlternative | null {
  try {
    const { folder, existingTitles, newTitles } = resolveRecommendedFolderPath(
      recommendation,
      tree,
    );
    return {
      path: [...existingTitles, ...newTitles],
      ...(newTitles.length === 0 ? { folderId: folder.id } : {}),
      recommendation,
    };
  } catch {
    return null;
  }
}

function describeFolderError(error: unknown): string {
  return error instanceof RecommendedFolderError && error.code === 'path-conflict'
    ? t('ai_newFolderConflictDesc', error.segment ?? '')
    : getErrorMessage(error, 'ai_newFolderFailedDesc');
}

/** Checks AI is on, allowed, and has a usable service; the reason when not. */
async function getQuickSaveAISettings(
  settings: Settings,
): Promise<{ ok: true; settings: AISettings } | { ok: false; error?: string }> {
  if (!settings.aiEnabled || !(await hasPermission('ai'))) return { ok: false };
  try {
    // The host page checks the rest (validateAISettings) before the request; importing the AI
    // client here would bundle model listing and page reading into the background.
    return { ok: true, settings: await getActiveAISettings(true, 'quickSave') };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

/**
 * Folder suggestions from the browser's built-in model, which runs in the AI host page with a
 * warm session kept there between quick saves. Null when the model is not ready (it never starts a
 * download), fails, or is slow, so the caller falls back to the local word match.
 */
async function recommendWithBuiltinAI(
  aiSettings: AISettings,
  page: QuickSavePage,
  tree: BookmarkTreeNode[],
  settings: Settings,
  readPage: boolean,
): Promise<FolderRecommendation[] | null> {
  // Where the worker can ask (Chrome), a model known not to be ready skips opening the host page;
  // without the API here, the host page checks for itself.
  const status = await getBuiltinAIStatus({ refresh: true });
  if (status !== 'available' && status !== 'unsupported') return null;
  try {
    return await withAIHost(
      aiSettings,
      {
        locale: resolveAppLocale(settings.language),
        source: 'folderRecommendation',
        keepOpen: true,
      },
      async (host) => {
        const text = readPage ? await host.readPage(page.url) : null;
        return askBuiltinModelForFolders(
          ({ choices, maxChoices, system, prompt }) =>
            host.generate({ schema: 'folderIds', choices, maxChoices, system, prompt }),
          { ...page, ...(text ? { pageText: text.text } : {}) },
          tree,
          settings.aiMaxRecommendations,
        );
      },
    );
  } catch {
    // The AI activity log has the model's error.
    return null;
  }
}

async function saveWithAI(
  base: QuickSaveRecord,
  page: QuickSavePage,
  settings: Settings,
  cover: QuickSaveCover | null,
): Promise<QuickSaveRecord> {
  const ai = await getQuickSaveAISettings(settings);
  if (!ai.ok) {
    return {
      ...base,
      status: 'failed',
      failure: 'aiUnavailable',
      ...(ai.error ? { error: ai.error } : {}),
    };
  }
  // "Saving…" while the AI call runs.
  const saving = await deliver(base, settings, cover);
  const tree = await fetchBookmarkTree();
  const existing = await findExisting(page.url, indexWritableFolders(tree));
  const readPage = settings.aiReadPageContent && (await hasPermission('pageReading'));

  let recommendations: FolderRecommendation[];
  if (isBuiltinProvider(ai.settings.provider)) {
    const onDevice = await recommendWithBuiltinAI(ai.settings, page, tree, settings, readPage);
    // Not ready, failed, or too slow: the page still gets saved, by the local word match.
    if (!onDevice) {
      return saveLocally(saving, page, { ...settings, quickSaveFolderStrategy: 'best_match' });
    }
    recommendations = onDevice;
  } else {
    try {
      recommendations = await withAIHost(
        ai.settings,
        { locale: resolveAppLocale(settings.language), source: 'folderRecommendation' },
        (host) => recommendFoldersVia(host, page, tree, settings.aiMaxRecommendations, readPage),
      );
    } catch (error) {
      // A service that wants an API key needs setup, not a retry: offer Open AI settings.
      const failure =
        error instanceof AIHostError && error.kind === 'keyRequired' ? 'aiUnavailable' : 'aiFailed';
      return { ...saving, status: 'failed', failure, error: getErrorMessage(error) };
    }
  }
  const choices = recommendations
    .map((recommendation) => toAlternative(recommendation, tree))
    .filter((choice) => choice !== null);

  if (existing) return existingRecord(saving, existing, choices);
  const [first] = recommendations;
  if (!first) return { ...saving, status: 'failed', failure: 'aiFailed' };

  let result: RecommendedFolderBookmarkResult;
  try {
    result = await createRecommendedFolderBookmark(first, page, tree, { source: 'quick_save' });
  } catch (error) {
    return {
      ...saving,
      status: 'failed',
      failure: 'saveFailed',
      error: describeFolderError(error),
    };
  }
  await trackRecentFolder(result.folderId, result.folderTitles);
  const others = choices.filter(
    (choice) => choice.recommendation !== first && choice.folderId !== result.folderId,
  );
  return {
    ...saving,
    status: result.status === 'duplicate' ? 'duplicate' : 'saved',
    bookmarkId: result.bookmarkId,
    folderId: result.folderId,
    path: result.folderTitles,
    recommendation: first,
    createdFolderIds: result.createdFolderIds,
    alternatives: others,
  };
}

/**
 * Saves the page in `tab` (the active tab when the browser did not say) and shows where it went.
 * Resolves to the quick save as stored.
 */
export async function runQuickSave(
  command: QuickSaveCommand,
  tab?: Browser.tabs.Tab,
): Promise<QuickSaveRecord> {
  const settings = await readSettingsInAppLanguage();
  const activeTab = tab ?? (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  const page = activeTab ? pageOf(activeTab) : null;
  const mode = EXTENSION_COMMANDS[command].mode;
  const base: QuickSaveRecord = {
    id: crypto.randomUUID(),
    mode,
    status: 'saving',
    at: Date.now(),
    ...(activeTab?.id !== undefined && activeTab.id >= 0 ? { tabId: activeTab.id } : {}),
    delivery: 'page',
    page: page ?? { title: '', url: '' },
    path: [],
    createdFolderIds: [],
    origin: { kind: 'created' },
    alternatives: [],
  };
  // The picture of the tab, when one may become the cover, is taken now, before any notification.
  const cover = startQuickSaveCover(settings, activeTab, {
    pictureWaitMs: quickSaveConfig.cover_picture_wait_ms,
    picture: true,
  });
  await storeRecord(base, true);
  return completeQuickSave(base, settings, { toolbar: true, cover });
}

/**
 * Saves the page `base` names its own way (`mode`), stores the result, and shows it: in the page,
 * or, with `toolbar`, in the badge and popup when the page cannot show it.
 */
async function completeQuickSave(
  base: QuickSaveRecord,
  settings: Settings,
  { toolbar, cover }: { toolbar: boolean; cover: QuickSaveCover | null },
): Promise<QuickSaveRecord> {
  const page = base.page.url ? base.page : null;
  let record: QuickSaveRecord;
  try {
    if (!page) record = { ...base, status: 'failed', failure: 'noPage' };
    else if (base.mode === 'ai') record = await saveWithAI(base, page, settings, cover);
    else record = await saveLocally(base, page, settings);
  } catch (error) {
    record = { ...base, status: 'failed', failure: 'saveFailed', error: getErrorMessage(error) };
  }
  // A newer quick save replaced this one while it ran: its notification wins.
  if (!(await storeRecord(record))) return record;
  const shown =
    !toolbar && record.delivery === 'popup'
      ? record
      : await deliver(record, await readSettingsInAppLanguage(), cover);
  // After the save and its notification, never before: neither waits for the cover.
  if (cover) void attachCover(shown, cover);
  return shown;
}

/** Whether `record` is still the last quick save, with the same bookmark saved. */
async function isStillSaved(record: QuickSaveRecord): Promise<boolean> {
  const current = await quickSaveRecordValue.get();
  return (
    current?.id === record.id &&
    current.bookmarkId === record.bookmarkId &&
    (current.status === 'saved' || current.status === 'duplicate')
  );
}

/**
 * Gets the bookmark's cover (`quick-save-cover.ts`), notes it on the quick save, and shows Remove
 * cover in the notification while it is still on screen; the popup follows the stored record.
 */
async function attachCover(record: QuickSaveRecord, cover: QuickSaveCover): Promise<void> {
  const { bookmarkId } = record;
  if (!bookmarkId || (record.status !== 'saved' && record.status !== 'duplicate')) return;
  try {
    const saved = await cover.save(bookmarkId, () => isStillSaved(record));
    if (!saved) return;
    const { source, replaced } = saved;
    // A replaced cover too large to keep on the record is not put back by Remove cover.
    const kept =
      replaced && replaced.image.data.byteLength <= REPLACED_COVER_MAX_BYTES
        ? { replaced: toPortableCover(replaced) }
        : {};
    const attached: { record?: QuickSaveRecord } = {};
    await quickSaveRecordValue.update((current) => {
      if (
        current?.id !== record.id ||
        current.bookmarkId !== bookmarkId ||
        (current.status !== 'saved' && current.status !== 'duplicate')
      ) {
        return current;
      }
      attached.record = { ...current, cover: { source, ...kept } };
      return attached.record;
    });
    const updated = attached.record;
    if (!updated) {
      // Undone while the cover was stored: a removed bookmark keeps no cover.
      const exists = await browser.bookmarks.get(bookmarkId).then(
        () => true,
        () => false,
      );
      if (!exists) await takeCovers([bookmarkId]);
      return;
    }
    if (updated.delivery === 'page' && updated.tabId !== undefined) {
      await showInTab(
        updated.tabId,
        buildQuickSaveView(updated, await readSettingsInAppLanguage()),
        {
          ...(updated.documentToken ? { document: updated.documentToken } : {}),
          ...(updated.page.url ? { url: updated.page.url } : {}),
          onlyIfShown: true,
        },
      );
    }
  } catch (error) {
    bookmarkLogger.error({ error }, 'Quick save cover failed');
  }
}

/**
 * Retry and Save without AI after a failed AI quick save: the same page again, AI or the Quick
 * save setting. It keeps the quick save's id, so the notification or popup updates in place.
 */
async function redoQuickSave(
  record: QuickSaveRecord,
  mode: QuickSaveRecord['mode'],
  settings: Settings,
): Promise<QuickSaveRecord> {
  if (record.status !== 'failed' || !record.page.url) return record;
  const base: QuickSaveRecord = {
    id: record.id,
    mode,
    status: 'saving',
    at: Date.now(),
    ...(record.tabId !== undefined ? { tabId: record.tabId } : {}),
    ...(record.documentToken ? { documentToken: record.documentToken } : {}),
    delivery: record.delivery,
    page: record.page,
    path: [],
    createdFolderIds: [],
    origin: { kind: 'created' },
    alternatives: [],
  };
  if (!(await storeRecord(base))) return record;
  // The notification may be on screen now, so a cover can only be the page's own image.
  const tab =
    record.tabId === undefined
      ? undefined
      : await browser.tabs.get(record.tabId).catch(() => undefined);
  const cover = startQuickSaveCover(settings, tab, {
    pictureWaitMs: quickSaveConfig.cover_picture_wait_ms,
    picture: false,
  });
  // The popup that asked shows the result itself; a page gets it drawn, or the badge and popup
  // when it has moved on meanwhile.
  return completeQuickSave(base, settings, { toolbar: record.delivery === 'page', cover });
}

// ---------------------------------------------------------------------------------------------
// Undo and move
// ---------------------------------------------------------------------------------------------

/** The bookmark's current folder as a choice, to offer it back after it moves. */
function currentAsAlternative(record: QuickSaveRecord): QuickSaveAlternative | null {
  const removed =
    record.folderId !== undefined && record.createdFolderIds.includes(record.folderId);
  if (removed && !record.recommendation) return null;
  return {
    path: record.path,
    ...(record.folderId && !removed ? { folderId: record.folderId } : {}),
    ...(record.recommendation ? { recommendation: record.recommendation } : {}),
  };
}

/** Undo: removes a new bookmark and the folders it created, or moves a saved one back. */
export async function undoQuickSave(record: QuickSaveRecord): Promise<QuickSaveRecord> {
  if (record.status !== 'saved' || !record.bookmarkId) return record;
  const { bookmarkId } = record;
  if (record.origin.kind === 'created') {
    await recordBookmarkWrites(
      { action: 'delete', title: record.page.title },
      async (writer) => {
        try {
          await writer.remove(bookmarkId);
        } catch {
          // Already removed elsewhere; the folders below are still cleaned up.
        }
        await removeEmptyFolders(record.createdFolderIds, writer.remove);
      },
      { source: 'quick_save', required: true },
    );
    // A removed bookmark keeps no cover, such as the one Save a Cover With Quick Save stored.
    await takeCovers([bookmarkId]).catch((error: unknown) => {
      bookmarkLogger.error({ error }, 'Failed to remove the quick save cover');
    });
    return {
      ...record,
      status: 'removed',
      bookmarkId: undefined,
      cover: undefined,
      createdFolderIds: [],
      alternatives: [],
      error: undefined,
    };
  }
  const { parentId, index, path } = record.origin;
  await recordBookmarkWrites(
    { action: 'move', title: record.page.title },
    async (writer) => {
      try {
        await writer.move(bookmarkId, { parentId, index });
      } catch {
        // The old position may no longer exist (the folder shrank); the end of the folder does.
        await writer.move(bookmarkId, { parentId });
      }
      await removeEmptyFolders(record.createdFolderIds, writer.remove);
    },
    { source: 'quick_save' },
  );
  const current = currentAsAlternative(record);
  return {
    ...record,
    status: 'duplicate',
    folderId: parentId,
    path,
    recommendation: undefined,
    createdFolderIds: [],
    alternatives: [
      ...(current ? [current] : []),
      ...record.alternatives.filter((alternative) => alternative.folderId !== parentId),
    ].slice(0, Math.max(record.alternatives.length, 1)),
    error: undefined,
  };
}

/** Moves the bookmark to alternative `index`, creating its folders for an AI suggestion. */
export async function moveQuickSave(
  record: QuickSaveRecord,
  index: number,
): Promise<QuickSaveRecord> {
  const choice = record.alternatives[index];
  if (
    !choice ||
    !record.bookmarkId ||
    (record.status !== 'saved' && record.status !== 'duplicate')
  ) {
    return record;
  }
  const tree = await fetchBookmarkTree();
  const folders = indexWritableFolders(tree);
  const { bookmarkId } = record;
  // The folders it creates, the move, and the folders it leaves empty are one change.
  const { result: target } = await recordBookmarkWrites(
    { action: 'move', title: record.page.title },
    async (writer) => {
      let next: { folderId: string; path: string[]; createdFolderIds: string[] };
      if (choice.folderId && folders.has(choice.folderId)) {
        next = {
          folderId: choice.folderId,
          path: folders.get(choice.folderId)?.path ?? choice.path,
          createdFolderIds: [],
        };
      } else if (choice.recommendation) {
        const created = await createRecommendedFolderPath(choice.recommendation, tree, writer);
        next = {
          folderId: created.folderId,
          path: created.folderTitles,
          createdFolderIds: created.createdFolderIds,
        };
      } else {
        throw new Error(t('quickSave_folderGone'));
      }
      await writer.move(bookmarkId, { parentId: next.folderId });
      await removeEmptyFolders(record.createdFolderIds, writer.remove);
      return next;
    },
    { source: 'quick_save' },
  );
  const current = currentAsAlternative(record);
  await trackRecentFolder(target.folderId, target.path);
  return {
    ...record,
    status: 'saved',
    folderId: target.folderId,
    path: target.path,
    recommendation: choice.recommendation,
    createdFolderIds: target.createdFolderIds,
    alternatives: [
      ...(current ? [current] : []),
      ...record.alternatives.filter((_, position) => position !== index),
    ],
    fallback: undefined,
    error: undefined,
  };
}

/** Whether `sender` may act on `record`: its own tab's notification, or an extension page. */
function maySenderAct(record: QuickSaveRecord, sender: Browser.runtime.MessageSender): boolean {
  if (sender.id !== browser.runtime.id) return false;
  // The popup, also when opened in a tab; content scripts report the web page's URL instead.
  if (sender.url?.startsWith(browser.runtime.getURL('/'))) return true;
  return sender.tab !== undefined && sender.tab.id === record.tabId;
}

/**
 * Answers a button press in the notification or the popup. Null when `message` is not a quick
 * save action; `{ view: null }` closes the notification.
 */
export async function handleQuickSaveAction(
  message: unknown,
  sender: Browser.runtime.MessageSender,
): Promise<QuickSaveActionResponse | null> {
  const parsed = quickSaveActionSchema.safeParse(message);
  if (!parsed.success) return null;
  const action = parsed.data;
  if (sender.id !== browser.runtime.id) return { view: null };
  const record = await quickSaveRecordValue.get();
  if (!record || record.id !== action.id) {
    // Only the last quick save is kept: an older notification says so instead of closing silently.
    if (action.action === 'dismiss' || sender.tab === undefined) return { view: null };
    return { view: buildExpiredQuickSaveView(action.id, await readSettingsInAppLanguage()) };
  }
  if (!maySenderAct(record, sender)) return { view: null };
  const settings = await readSettingsInAppLanguage();
  switch (action.action) {
    case 'dismiss':
      await quickSaveRecordValue.update((current) => (current?.id === record.id ? null : current));
      return { view: null };
    case 'openAISettings':
      await openAISettings('quickSave');
      await quickSaveRecordValue.update((current) => (current?.id === record.id ? null : current));
      return { view: null };
    case 'undo':
    case 'move': {
      let next: QuickSaveRecord;
      try {
        next =
          action.action === 'move'
            ? await moveQuickSave(record, action.index)
            : await undoQuickSave(record);
      } catch (error) {
        next = { ...record, error: getErrorMessage(error) };
      }
      await storeRecord(next);
      return { view: buildQuickSaveView(next, settings) };
    }
    case 'removeCover': {
      let next: QuickSaveRecord = { ...record, cover: undefined };
      try {
        if (record.cover && record.bookmarkId) {
          const { source, replaced } = record.cover;
          const previous = replaced ? fromPortableCover(replaced) : undefined;
          await removeQuickSaveCover(record.bookmarkId, record.page.url, source, previous);
        }
      } catch (error) {
        next = { ...record, error: getErrorMessage(error) };
      }
      await storeRecord(next);
      return { view: buildQuickSaveView(next, settings) };
    }
    case 'retry':
    case 'saveWithoutAI': {
      const next = await redoQuickSave(
        record,
        action.action === 'retry' ? 'ai' : 'local',
        settings,
      );
      return { view: buildQuickSaveView(next, await readSettingsInAppLanguage()) };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Background wiring
// ---------------------------------------------------------------------------------------------

/** Adds the command, message, and bookmark listeners. Call once, synchronously, at startup. */
export function registerQuickSave(): void {
  browser.commands?.onCommand.addListener((command, tab) => {
    // The one command that is no quick save opens the manager (`EXTENSION_COMMANDS`).
    if (isExtensionCommand(command) && EXTENSION_COMMANDS[command].run === 'openManager') {
      void openBookmarkManager().catch((error) => {
        bookmarkLogger.error({ error }, 'Opening the bookmark manager failed');
      });
      return;
    }
    if (!isQuickSaveCommand(command)) return;
    void runQuickSave(command, tab).catch((error) => {
      bookmarkLogger.error({ error }, 'Quick save failed');
    });
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isPlainObject(message)) return undefined;
    if (message.type === QUICK_SAVE_MESSAGE.action) {
      void handleQuickSaveAction(message, sender).then(
        (response) => sendResponse(response ?? { view: null }),
        () => sendResponse({ view: null }),
      );
      return true;
    }
    if (message.type === QUICK_SAVE_MESSAGE.hostFetch) {
      void forwardAIHostFetch(message, sender).then((response) =>
        sendResponse(response ?? { ok: false, error: 'Refused' }),
      );
      return true;
    }
    if (message.type === QUICK_SAVE_MESSAGE.hostActivity) {
      void recordAIHostActivity(message, sender);
      return undefined;
    }
    if (message.type === QUICK_SAVE_MESSAGE.hostIdle) {
      void closeIdleAIHost(message, sender);
      return undefined;
    }
    return undefined;
  });

  // Any change to the tree can change which folder ranks first.
  const bookmarks = browser.bookmarks;
  for (const event of [
    bookmarks.onCreated,
    bookmarks.onRemoved,
    bookmarks.onChanged,
    bookmarks.onMoved,
    bookmarks.onChildrenReordered,
    bookmarks.onImportEnded,
  ]) {
    event?.addListener(invalidateQuickSaveIndex);
  }
}

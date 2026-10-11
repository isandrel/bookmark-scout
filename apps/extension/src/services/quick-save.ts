/**
 * Quick save: the keyboard shortcuts that save the current page without opening any extension
 * page (`lib/command-catalog.ts`). Quick save puts the page where the Quick save setting says
 * (`quick-save-target.ts`); AI quick save puts it in the first AI suggestion
 * (`quick-save-ai-host.ts`). A notification in the page (`entrypoints/quick-save-toast`) says
 * where it went and offers Undo and other folders; on pages the extension cannot draw in, the
 * toolbar badge shows the result and the popup shows the notification instead.
 *
 * The last quick save is kept in session storage, so Undo and Move still work after the service
 * worker restarts. Background only: `registerQuickSave` adds the listeners.
 */

import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

const quickSaveConfig = readConfig(
  'ui/quick-save',
  z.strictObject({
    alternatives: z.number().int().min(0).max(8),
    auto_dismiss_ms: z.number().int().min(1000).max(120_000),
    badge_clear_ms: z.number().int().min(500).max(60_000),
    popup_result_max_age_ms: z.number().int().min(1000),
    badge_success_text: z.string().min(1).max(4),
    badge_failure_text: z.string().min(1).max(4),
    badge_success_color: z.string().regex(/^#[0-9a-f]{6}$/i),
    badge_failure_color: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
);

/** How long the popup offers the last quick save that could not be shown in its page. */
export const QUICK_SAVE_POPUP_MAX_AGE_MS = quickSaveConfig.popup_result_max_age_ms;

const QUICK_SAVE_TOAST_SCRIPT = '/quick-save-toast.js';
const OPTIONS_AI_PATH = '/options.html?category=ai';

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
  const actions: QuickSaveToastView['actions'] = [];
  if (record.status === 'saved' && record.bookmarkId) {
    actions.push({ id: 'undo', label: t('action_undo') });
  }
  if (record.failure === 'aiUnavailable') {
    actions.push({ id: 'openAISettings', label: t('quickSave_openAISettings') });
  }
  return {
    id: record.id,
    status: record.status,
    theme: settings.theme,
    lang: toLanguageTag(resolveAppLocale(settings.language)),
    label: t('extName'),
    title,
    ...(hasFolder ? { detail: pathText(record.path) } : {}),
    ...(note ? { note } : {}),
    actions,
    alternativesLabel: t('quickSave_moveTo'),
    alternatives: hasFolder
      ? record.alternatives.map((alternative, index) => ({
          index,
          label: truncateText(folderName(alternative.path), settings.truncateLength),
          title: pathText(alternative.path),
        }))
      : [],
    dismissLabel: t('action_dismiss'),
    autoDismissMs: record.status === 'saving' ? null : quickSaveConfig.auto_dismiss_ms,
  };
}

/** The last quick save for the popup: one its page could not show, while it is recent. */
export function isQuickSaveForPopup(record: QuickSaveRecord | null, now = Date.now()): boolean {
  return (
    record !== null &&
    record.delivery === 'popup' &&
    record.status !== 'saving' &&
    now - record.at <= QUICK_SAVE_POPUP_MAX_AGE_MS
  );
}

// ---------------------------------------------------------------------------------------------
// Showing the result
// ---------------------------------------------------------------------------------------------

/** Draws the notification in the tab; false where the browser does not let the extension in. */
async function showInTab(tabId: number, view: QuickSaveToastView): Promise<boolean> {
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: [QUICK_SAVE_TOAST_SCRIPT] });
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: (toastView: QuickSaveToastView) => {
        const scope = globalThis as typeof globalThis & {
          __bookmarkScoutQuickSave?: { render: (view: QuickSaveToastView) => boolean };
        };
        return scope.__bookmarkScoutQuickSave?.render(toastView) === true;
      },
      args: [view],
    });
    return result?.result === true;
  } catch {
    return false;
  }
}

function toolbarAction() {
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

/** Shows `record` in its page, or in the toolbar when the page cannot show it. */
async function deliver(record: QuickSaveRecord, settings: Settings): Promise<QuickSaveRecord> {
  let shown = record;
  if (record.delivery === 'page' && record.tabId !== undefined) {
    if (await showInTab(record.tabId, buildQuickSaveView(record, settings))) return record;
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
  const ranked =
    settings.quickSaveFolderStrategy === 'best_match'
      ? // Any match can be offered; only a strong one is chosen (FOLDER_RANKING_MIN_SCORE).
        rankFolders(getRankingIndex(tree), page, {
          limit: quickSaveConfig.alternatives + 1,
          minScore: Number.MIN_VALUE,
        })
      : [];
  const target = chooseQuickSaveTarget(tree, {
    strategy: settings.quickSaveFolderStrategy,
    fixedFolderId: settings.quickSaveFixedFolder,
    recentFolderIds,
    ranked,
    minScore: FOLDER_RANKING_MIN_SCORE,
    alternatives: quickSaveConfig.alternatives,
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
        .slice(0, quickSaveConfig.alternatives)
        .map(({ id, path }) => ({ folderId: id, path })),
    );
  }
  if (!target) return { ...base, status: 'failed', failure: 'saveFailed' };

  const bookmark = await createBookmark({
    parentId: target.folder.id,
    title: page.title,
    url: page.url,
  });
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
    return { ok: true, settings: await getActiveAISettings(true) };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

async function saveWithAI(
  base: QuickSaveRecord,
  page: QuickSavePage,
  settings: Settings,
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
  const saving = await deliver(base, settings);
  const tree = await fetchBookmarkTree();
  const existing = await findExisting(page.url, indexWritableFolders(tree));
  const readPage = settings.aiReadPageContent && (await hasPermission('pageReading'));

  let recommendations: FolderRecommendation[];
  try {
    recommendations = await withAIHost(ai.settings, resolveAppLocale(settings.language), (host) =>
      recommendFoldersVia(host, page, tree, settings.aiMaxRecommendations, readPage),
    );
  } catch (error) {
    return { ...saving, status: 'failed', failure: 'aiFailed', error: getErrorMessage(error) };
  }
  const choices = recommendations
    .map((recommendation) => toAlternative(recommendation, tree))
    .filter((choice) => choice !== null);

  if (existing) return existingRecord(saving, existing, choices);
  const [first] = recommendations;
  if (!first) return { ...saving, status: 'failed', failure: 'aiFailed' };

  let result: RecommendedFolderBookmarkResult;
  try {
    result = await createRecommendedFolderBookmark(first, page, tree);
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
  command: ExtensionCommand,
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
  await storeRecord(base, true);

  let record: QuickSaveRecord;
  try {
    if (!page) record = { ...base, status: 'failed', failure: 'noPage' };
    else if (mode === 'ai') record = await saveWithAI(base, page, settings);
    else record = await saveLocally(base, page, settings);
  } catch (error) {
    record = { ...base, status: 'failed', failure: 'saveFailed', error: getErrorMessage(error) };
  }
  // A newer quick save replaced this one while it ran: its notification wins.
  if (!(await storeRecord(record))) return record;
  return deliver(record, await readSettingsInAppLanguage());
}

// ---------------------------------------------------------------------------------------------
// Undo and move
// ---------------------------------------------------------------------------------------------

/** Removes folders a quick save created that are still empty, innermost first. */
async function removeEmptyCreatedFolders(folderIds: readonly string[]): Promise<void> {
  for (const folderId of [...folderIds].reverse()) {
    try {
      if ((await getBookmarkChildren(folderId)).length === 0) await deleteBookmark(folderId);
    } catch {
      // Already gone, or the user put something in it: keep it.
    }
  }
}

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
  if (record.origin.kind === 'created') {
    try {
      await deleteBookmark(record.bookmarkId);
    } catch {
      // Already removed elsewhere; the folders below are still cleaned up.
    }
    await removeEmptyCreatedFolders(record.createdFolderIds);
    return {
      ...record,
      status: 'removed',
      bookmarkId: undefined,
      createdFolderIds: [],
      alternatives: [],
      error: undefined,
    };
  }
  const { parentId, index, path } = record.origin;
  try {
    await moveBookmark(record.bookmarkId, { parentId, index });
  } catch {
    // The old position may no longer exist (the folder shrank); the end of the folder does.
    await moveBookmark(record.bookmarkId, { parentId });
  }
  const current = currentAsAlternative(record);
  await removeEmptyCreatedFolders(record.createdFolderIds);
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
  let target: { folderId: string; path: string[]; createdFolderIds: string[] };
  if (choice.folderId && folders.has(choice.folderId)) {
    target = {
      folderId: choice.folderId,
      path: folders.get(choice.folderId)?.path ?? choice.path,
      createdFolderIds: [],
    };
  } else if (choice.recommendation) {
    const created = await createRecommendedFolderPath(choice.recommendation, tree);
    target = {
      folderId: created.folderId,
      path: created.folderTitles,
      createdFolderIds: created.createdFolderIds,
    };
  } else {
    throw new Error(t('quickSave_folderGone'));
  }

  await moveBookmark(record.bookmarkId, { parentId: target.folderId });
  const current = currentAsAlternative(record);
  await removeEmptyCreatedFolders(record.createdFolderIds);
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
  const record = await quickSaveRecordValue.get();
  if (!record || record.id !== parsed.data.id || !maySenderAct(record, sender)) {
    return { view: null };
  }
  const settings = await readSettingsInAppLanguage();
  const action = parsed.data;
  switch (action.action) {
    case 'dismiss':
      await quickSaveRecordValue.update((current) => (current?.id === record.id ? null : current));
      return { view: null };
    case 'openAISettings':
      await browser.tabs.create({ url: browser.runtime.getURL(OPTIONS_AI_PATH), active: true });
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
  }
}

// ---------------------------------------------------------------------------------------------
// Background wiring
// ---------------------------------------------------------------------------------------------

/** Adds the command, message, and bookmark listeners. Call once, synchronously, at startup. */
export function registerQuickSave(): void {
  browser.commands?.onCommand.addListener((command, tab) => {
    if (!isExtensionCommand(command)) return;
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

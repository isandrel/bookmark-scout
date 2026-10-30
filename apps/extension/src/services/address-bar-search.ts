/**
 * Address Bar Search (Options > Saving & Search): the keyword (`config/ui/omnibox.toml`) and a
 * space in the address bar hand the rest of the line to the background, which lists the bookmarks
 * it matches, ranked as the search box ranks them (`search-documents.ts`). Enter on a suggestion
 * opens that bookmark, and Enter on the typed text opens the manager with it as the search, in
 * this tab or a new one as the browser's keys ask.
 *
 * The browser declares the keyword at install, so it answers while the setting is off too: it then
 * says the search is off, and Enter opens that setting.
 *
 * The documents are built from the bookmark tree and the local tags and summaries on the first
 * search, kept in memory only (never stored), and dropped when either changes or the background
 * stops; the next search builds them again.
 */
import type { Browser } from 'wxt/browser';

let documents: Promise<SearchDocument[]> | null = null;

/** Forgets the documents, after a bookmark or its metadata changed. */
export function forgetAddressBarDocuments(): void {
  documents = null;
}

function currentDocuments(): Promise<SearchDocument[]> {
  if (!documents) {
    const building = Promise.all([fetchBookmarkTree(), bookmarkMetadataValue.get()]).then(
      ([tree, metadata]) =>
        buildSearchDocuments(tree, metadata).filter(
          (document) => document.kind === 'bookmark' && document.url,
        ),
    );
    documents = building;
    // A failed read is not kept: the next search tries again.
    building.catch(() => {
      if (documents === building) documents = null;
    });
  }
  return documents;
}

/** The bookmarks `text` finds, best first, at most `limit`. */
export async function searchAddressBar(text: string, limit: number): Promise<SearchResult[]> {
  const { query } = parseSearchQuery(text);
  if (query.terms.length === 0) return [];
  const match = compileSearchQuery(query);
  const results: SearchResult[] = [];
  for (const document of await currentDocuments()) {
    const result = match(document);
    if (result) results.push(result);
  }
  // A stable sort keeps tree order between equal scores.
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

/** `text` with `ranges` in `<match>`, escaped for the address bar's XML markup. */
function markMatches(text: string, ranges: readonly SearchMatchRange[]): string {
  let marked = '';
  let at = 0;
  for (const [start, end] of ranges) {
    marked += `${escapeXml(text.slice(at, start))}<match>${escapeXml(text.slice(start, end))}</match>`;
    at = end;
  }
  return marked + escapeXml(text.slice(at));
}

function rangesOf(
  reasons: readonly SearchMatchReason[],
  field: 'title' | 'url',
): readonly SearchMatchRange[] {
  const reason = reasons.find((entry) => entry.field === field);
  return reason && 'ranges' in reason ? reason.ranges : [];
}

/**
 * A result as an address bar suggestion: its title and address, with what matched highlighted
 * where the browser reads markup, and `content` the address Enter opens.
 */
export function addressBarSuggestion(
  result: SearchResult,
  markup: boolean,
): { content: string; description: string } {
  const { document, reasons } = result;
  const url = document.url ?? '';
  const title = getBookmarkDisplayTitle(document.title);
  if (!markup) return { content: url, description: t('addressBar_suggestion', [title, url]) };
  // A title shown in place of an empty one ("Untitled") has nothing to highlight.
  const titleText =
    title === document.title ? markMatches(title, rangesOf(reasons, 'title')) : escapeXml(title);
  const urlText = `<url>${markMatches(url, rangesOf(reasons, 'url'))}</url>`;
  return { content: url, description: t('addressBar_suggestion', [titleText, urlText]) };
}

/** Where Enter asked to open: this tab, or a new one in front or behind. */
type Disposition = Parameters<Parameters<typeof browser.omnibox.onInputEntered.addListener>[0]>[1];

/** The addresses the address bar lists now, so Enter tells a chosen one from typed text. */
let suggested = new Set<string>();
/** Counts searches, so a slow answer to earlier text never replaces a newer one. */
let revision = 0;

const OPTIONS_SEARCH_PATH = '/options.html?category=search';

/** How many to list, or null while Address Bar Search is off. */
async function readAddressBarLimit(): Promise<number | null> {
  const settings = await getSettings();
  return settings.addressBarEnabled ? settings.addressBarMaxResults : null;
}

async function describeDefault(enabled: boolean): Promise<void> {
  await whenLanguageReady();
  browser.omnibox.setDefaultSuggestion({
    description: enabled ? t('addressBar_defaultSuggestion') : t('addressBar_off'),
  });
}

async function suggestFor(
  text: string,
  suggest: (results: Browser.omnibox.SuggestResult[]) => void,
): Promise<void> {
  revision += 1;
  const asked = revision;
  const limit = await readAddressBarLimit();
  await describeDefault(limit !== null);
  const query = text.trim();
  if (limit === null || !query) {
    if (asked === revision) {
      suggested = new Set();
      suggest([]);
    }
    return;
  }
  const results = await searchAddressBar(query, limit);
  if (asked !== revision) return;
  const markup = browserProfile().omniboxMarkup;
  const suggestions = results.map((result) => addressBarSuggestion(result, markup));
  suggested = new Set(suggestions.map(({ content }) => content));
  suggest(suggestions);
}

/** Opens `url` where the address bar's Enter asked: this tab, or a new one in front or behind. */
async function openFor(url: string, disposition: Disposition): Promise<void> {
  if (disposition === 'currentTab') await browser.tabs.update({ url });
  else await browser.tabs.create({ url, active: disposition === 'newForegroundTab' });
}

async function enter(text: string, disposition: Disposition): Promise<void> {
  if ((await readAddressBarLimit()) === null) {
    await openFor(browser.runtime.getURL(OPTIONS_SEARCH_PATH), disposition);
    return;
  }
  if (suggested.has(text)) {
    await openFor(text, disposition);
    return;
  }
  const query = text.trim();
  const params = query ? `?${new URLSearchParams({ [MANAGER_SEARCH_PARAM]: query })}` : '';
  await openFor(browser.runtime.getURL(`${BOOKMARK_MANAGER_PATH}${params}`), disposition);
}

/** Listens to the address bar keyword; added synchronously, so typing it can wake the worker. */
export function registerAddressBarSearch(): void {
  // A browser without the API (or a build without the keyword) has nothing to listen to.
  if (!browser.omnibox) return;
  const log = (error: unknown) => console.error('[Address bar search]', error);
  browser.omnibox.onInputStarted.addListener(() => {
    void readAddressBarLimit()
      .then((limit) => describeDefault(limit !== null))
      .catch(log);
  });
  browser.omnibox.onInputChanged.addListener((text, suggest) => {
    void suggestFor(text, suggest).catch(log);
  });
  browser.omnibox.onInputEntered.addListener((text, disposition) => {
    void enter(text, disposition).catch(log);
  });

  // A change to the bookmarks or their tags drops the documents the search built.
  const forget = () => forgetAddressBarDocuments();
  browser.bookmarks.onCreated.addListener(forget);
  browser.bookmarks.onRemoved.addListener(forget);
  browser.bookmarks.onChanged.addListener(forget);
  browser.bookmarks.onMoved.addListener(forget);
  bookmarkMetadataValue.watch(forget);
}

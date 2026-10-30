import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { BookmarkTreeNode } from '@/types';
import { STORAGE_ITEMS, seedStored } from './storage-helpers';

let tree: BookmarkTreeNode[] = [];

vi.mock('@/services/bookmarks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/bookmarks')>()),
  fetchBookmarkTree: vi.fn(async () => tree),
}));

const bookmark = (id: string, title: string, url: string): BookmarkTreeNode => ({
  id,
  parentId: '1',
  title,
  url,
});

const library = (children: BookmarkTreeNode[]): BookmarkTreeNode[] => [
  {
    id: '0',
    title: '',
    children: [{ id: '1', parentId: '0', title: 'Bookmarks bar', children }],
  },
];

/** An event the test fires itself: the fake browser leaves these APIs unimplemented. */
function testEvent<Listener extends (...args: never[]) => unknown>() {
  const listeners: Listener[] = [];
  return {
    listeners,
    addListener: (listener: Listener) => listeners.push(listener),
    fire: (...args: Parameters<Listener>) => listeners.map((listener) => listener(...args)),
  };
}

type Suggestion = { content: string; description: string };
type Disposition = 'currentTab' | 'newForegroundTab' | 'newBackgroundTab';

function installOmnibox() {
  const omnibox = {
    setDefaultSuggestion: vi.fn(),
    onInputStarted: testEvent<() => void>(),
    onInputChanged: testEvent<(text: string, suggest: (results: Suggestion[]) => void) => void>(),
    onInputEntered: testEvent<(text: string, disposition: Disposition) => void>(),
  };
  Object.assign(fakeBrowser, { omnibox });
  const bookmarkEvents = {
    onCreated: testEvent<() => void>(),
    onRemoved: testEvent<() => void>(),
    onChanged: testEvent<() => void>(),
    onMoved: testEvent<() => void>(),
  };
  Object.assign(fakeBrowser.bookmarks, bookmarkEvents);
  return { omnibox, bookmarkEvents };
}

/** Types `text` after the keyword and waits for the suggestions. */
async function suggestionsFor(omnibox: ReturnType<typeof installOmnibox>['omnibox'], text: string) {
  return new Promise<Suggestion[]>((resolve) => {
    omnibox.onInputChanged.fire(text, resolve);
  });
}

async function register() {
  const { registerAddressBarSearch } = await import('@/services/address-bar-search');
  registerAddressBarSearch();
}

describe('Address Bar Search', () => {
  beforeEach(async () => {
    setLanguage('en');
    // The documents live as long as the module; each test starts from its own library.
    forgetAddressBarDocuments();
    tree = library([
      bookmark('10', 'Rust book', 'https://doc.rust-lang.org/book/'),
      bookmark('11', 'React docs', 'https://react.dev/'),
      bookmark('12', 'React <Native> & more', 'https://reactnative.dev/'),
    ]);
  });

  it('lists the bookmarks the text finds, at most Address Bar Results, folders left out', async () => {
    await seedStored(STORAGE_ITEMS.settings, {
      language: 'en',
      addressBarEnabled: true,
      addressBarMaxResults: 1,
    });
    const { omnibox } = installOmnibox();
    await register();

    const one = await suggestionsFor(omnibox, 'react');
    expect(one).toHaveLength(1);
    expect(one[0]?.content).toMatch(/react/);

    await seedStored(STORAGE_ITEMS.settings, {
      language: 'en',
      addressBarEnabled: true,
      addressBarMaxResults: 9,
    });
    const all = await suggestionsFor(omnibox, 'react');
    expect(all.map(({ content }) => content).sort()).toEqual([
      'https://react.dev/',
      'https://reactnative.dev/',
    ]);
    expect(await suggestionsFor(omnibox, 'bookmarks bar')).toEqual([]);
  });

  it('highlights matches in escaped markup, so a title cannot inject its own', async () => {
    await seedStored(STORAGE_ITEMS.settings, { language: 'en', addressBarEnabled: true });
    const { omnibox } = installOmnibox();
    await register();

    const [native] = await suggestionsFor(omnibox, 'native');
    expect(native?.description).toContain('React &lt;<match>Native</match>&gt; &amp; more');
    expect(native?.description).toContain('<url>https://react<match>native</match>.dev/</url>');
  });

  it('gives plain text where the browser shows markup as text (Firefox)', async () => {
    await seedStored(STORAGE_ITEMS.settings, { language: 'en', addressBarEnabled: true });
    const [result] = await searchAddressBar('native', 1);
    if (!result) throw new Error('no result');
    expect(addressBarSuggestion(result, false)).toEqual({
      content: 'https://reactnative.dev/',
      description: 'React <Native> & more — https://reactnative.dev/',
    });
  });

  it('reads a changed library again after a bookmark event', async () => {
    await seedStored(STORAGE_ITEMS.settings, { language: 'en', addressBarEnabled: true });
    const { omnibox, bookmarkEvents } = installOmnibox();
    await register();
    expect(await suggestionsFor(omnibox, 'vue')).toEqual([]);

    tree = library([bookmark('20', 'Vue guide', 'https://vuejs.org/guide/')]);
    // Without an event the documents built before still answer.
    expect(await suggestionsFor(omnibox, 'vue')).toEqual([]);
    bookmarkEvents.onCreated.fire();
    await vi.waitFor(async () =>
      expect((await suggestionsFor(omnibox, 'vue')).map(({ content }) => content)).toEqual([
        'https://vuejs.org/guide/',
      ]),
    );
  });

  it('opens a chosen bookmark where Enter asked, and typed text as a manager search', async () => {
    await seedStored(STORAGE_ITEMS.settings, { language: 'en', addressBarEnabled: true });
    const { omnibox } = installOmnibox();
    const update = vi.spyOn(fakeBrowser.tabs, 'update').mockResolvedValue({} as never);
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
    await register();
    await suggestionsFor(omnibox, 'rust');

    await Promise.all(omnibox.onInputEntered.fire('https://doc.rust-lang.org/book/', 'currentTab'));
    await vi.waitFor(() =>
      expect(update).toHaveBeenCalledWith({ url: 'https://doc.rust-lang.org/book/' }),
    );

    await Promise.all(omnibox.onInputEntered.fire('rust book', 'newBackgroundTab'));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const opened = create.mock.calls[0]?.[0];
    expect(opened?.active).toBe(false);
    expect(new URL(opened?.url ?? '').searchParams.get(MANAGER_SEARCH_PARAM)).toBe('rust book');
    expect(new URL(opened?.url ?? '').pathname).toBe(BOOKMARK_MANAGER_PATH);
  });

  it('says it is off until turned on, lists nothing, and Enter opens that setting', async () => {
    await seedStored(STORAGE_ITEMS.settings, { language: 'en' });
    const { omnibox } = installOmnibox();
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
    await register();

    expect(await suggestionsFor(omnibox, 'react')).toEqual([]);
    expect(omnibox.setDefaultSuggestion).toHaveBeenLastCalledWith({
      description: 'Address Bar Search is off. Press Enter to turn it on in Settings',
    });
    await Promise.all(omnibox.onInputEntered.fire('react', 'newForegroundTab'));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const opened = new URL(create.mock.calls[0]?.[0]?.url ?? '');
    expect(opened.pathname).toBe('/options.html');
    expect(opened.searchParams.get('category')).toBe('search');
  });
});

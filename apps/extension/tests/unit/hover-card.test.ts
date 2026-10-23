import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import {
  createHoverCardController,
  folderPathOf,
  getHoverCardFields,
  HOVER_CARD_CLOSE_DELAY_MS,
  HOVER_CARD_FIELDS,
  type HoverCardTarget,
} from '@/lib/hover-card';
import { getHoverCardDetails, splitUrlAtHost } from '@/lib/hover-card-content';
import { defaultSettings, SETTING_NUMBER_BOUNDS } from '@/lib/settings-schema';

const OPEN = 600;
const CLOSE = 150;

const row = (id: string): HoverCardTarget => ({
  id,
  anchor: {} as HTMLElement,
  described: {} as HTMLElement,
});

function setup() {
  const changes: (string | null)[] = [];
  const controller = createHoverCardController({
    openDelayMs: () => OPEN,
    closeDelayMs: CLOSE,
    onChange: (target) => changes.push(target?.id ?? null),
  });
  const shown = () => controller.current()?.id ?? null;
  return { controller, changes, shown };
}

describe('hover card timing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens after the Hover Card Delay setting, by default slower to open than to close', () => {
    expect(defaultSettings.hoverCardOpenDelayMs).toBeGreaterThan(HOVER_CARD_CLOSE_DELAY_MS);
    expect(SETTING_NUMBER_BOUNDS.hoverCardOpenDelayMs).toMatchObject({ min: 0, max: 2000 });
  });

  it('reads the open delay each time a card is about to open', () => {
    let delay = OPEN;
    const changes: (string | null)[] = [];
    const controller = createHoverCardController({
      openDelayMs: () => delay,
      closeDelayMs: CLOSE,
      onChange: (target) => changes.push(target?.id ?? null),
    });
    delay = 0;
    controller.hover(row('a'));
    vi.advanceTimersByTime(0);
    expect(changes).toEqual(['a']);
  });

  it('opens only after the pointer rests for the open delay', () => {
    const { controller, shown } = setup();
    controller.hover(row('a'));
    vi.advanceTimersByTime(OPEN - 1);
    expect(shown()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(shown()).toBe('a');
  });

  it('never opens a card for rows the pointer only passes over', () => {
    const { controller, changes } = setup();
    for (const id of ['a', 'b', 'c', 'd']) {
      controller.hover(row(id));
      vi.advanceTimersByTime(OPEN / 2);
    }
    controller.hover(null);
    vi.advanceTimersByTime(OPEN * 2);
    expect(changes).toEqual([]);
  });

  it('stays while the pointer crosses onto the card, and closes after it leaves both', () => {
    const { controller, shown } = setup();
    controller.hover(row('a'));
    vi.advanceTimersByTime(OPEN);
    controller.hover(null);
    vi.advanceTimersByTime(CLOSE - 1);
    controller.hoverCard(true);
    vi.advanceTimersByTime(CLOSE * 4);
    expect(shown()).toBe('a');
    controller.hoverCard(false);
    vi.advanceTimersByTime(CLOSE - 1);
    expect(shown()).toBe('a');
    vi.advanceTimersByTime(1);
    expect(shown()).toBeNull();
  });

  it('closes the shown card and opens the next row only after its own delay', () => {
    const { controller, changes } = setup();
    controller.hover(row('a'));
    vi.advanceTimersByTime(OPEN);
    controller.hover(row('b'));
    vi.advanceTimersByTime(CLOSE);
    expect(changes).toEqual(['a', null]);
    vi.advanceTimersByTime(OPEN - CLOSE);
    expect(changes).toEqual(['a', null, 'b']);
  });

  it('opens for keyboard focus and stays while the row keeps it, wherever the pointer goes', () => {
    const { controller, shown } = setup();
    controller.focus(row('a'));
    vi.advanceTimersByTime(OPEN);
    expect(shown()).toBe('a');
    controller.hover(null);
    vi.advanceTimersByTime(CLOSE * 4);
    expect(shown()).toBe('a');
    controller.focus(null);
    vi.advanceTimersByTime(CLOSE);
    expect(shown()).toBeNull();
  });

  it('stays closed after a dismissal until the pointer and focus have left the row', () => {
    const { controller, shown } = setup();
    controller.hover(row('a'));
    controller.focus(row('a'));
    vi.advanceTimersByTime(OPEN);
    controller.dismiss();
    expect(shown()).toBeNull();
    // Still on the row: no new card.
    controller.hover(row('a'));
    vi.advanceTimersByTime(OPEN * 2);
    expect(shown()).toBeNull();
    // The pointer leaves but focus stays: still closed.
    controller.hover(null);
    vi.advanceTimersByTime(OPEN * 2);
    expect(shown()).toBeNull();
    // Both leave, then the pointer comes back: it opens again.
    controller.focus(null);
    controller.hover(row('a'));
    vi.advanceTimersByTime(OPEN);
    expect(shown()).toBe('a');
  });

  it('a press before the card opens keeps it from opening on that row', () => {
    const { controller, changes } = setup();
    controller.hover(row('a'));
    vi.advanceTimersByTime(OPEN / 2);
    controller.dismiss();
    vi.advanceTimersByTime(OPEN * 2);
    expect(changes).toEqual([]);
    controller.hover(row('b'));
    vi.advanceTimersByTime(OPEN);
    expect(changes).toEqual(['b']);
  });

  it('cancel stops pending timers', () => {
    const { controller, changes } = setup();
    controller.hover(row('a'));
    controller.cancel();
    vi.advanceTimersByTime(OPEN * 2);
    expect(changes).toEqual([]);
  });
});

describe('hover card fields', () => {
  it('shows every detail in the default order of the Hover Card Fields setting', () => {
    expect(getHoverCardFields(defaultSettings.hoverCardFields)).toEqual([...HOVER_CARD_FIELDS]);
  });

  it('follows the order set, hides what the setting leaves out, and skips unknown ids', () => {
    const hideRest = HOVER_CARD_FIELDS.filter((id) => !['summary', 'title'].includes(id)).map(
      (id) => `!${id}`,
    );
    expect(
      getHoverCardFields([
        'summary',
        'futureField',
        'title',
        'summary',
        '!futureField',
        ...hideRest,
      ]),
    ).toEqual(['summary', 'title']);
    expect(getHoverCardFields(HOVER_CARD_FIELDS.map((id) => `!${id}`))).toEqual([]);
    // A detail the list does not name was added since it was saved: it shows after the
    // configured detail before it.
    expect(getHoverCardFields(['summary', 'title'])).toEqual([
      'summary',
      'folder',
      'dateAdded',
      'title',
      'address',
      'cover',
      'tags',
    ]);
    expect(getHoverCardFields([])).toEqual([...HOVER_CARD_FIELDS]);
  });
});

describe('hover card content', () => {
  beforeAll(() => setLanguage('en'));
  afterAll(() => setLanguage('auto'));

  const bookmark = {
    id: '7',
    title: 'Release notes',
    url: 'https://www.example.com/notes',
    folderPath: 'Bookmarks bar / Work',
    dateAdded: 1_700_000_000_000,
  };

  it('shows the folder and date even without tags or a summary', () => {
    expect(getHoverCardDetails(bookmark, undefined)).toEqual({
      title: 'Release notes',
      tags: [],
      summary: '',
      folderPath: 'Bookmarks bar / Work',
      dateAdded: 1_700_000_000_000,
    });
  });

  it('keeps the whole summary trimmed, drops blank tags, and names an untitled bookmark', () => {
    const details = getHoverCardDetails(
      { ...bookmark, title: '  ', dateAdded: 0 },
      { tags: ['work', ' ', 'notes'], summary: '  First line.\nSecond line.  ' },
    );
    expect(details).toEqual({
      title: 'Untitled',
      tags: ['work', 'notes'],
      summary: 'First line.\nSecond line.',
      folderPath: 'Bookmarks bar / Work',
    });
  });

  it('splits an address around its host so the site can stand out', () => {
    expect(splitUrlAtHost('https://www.Example.com/a?b', 'https://www.example.com/a?b')).toEqual({
      before: 'https://',
      host: 'www.Example.com',
      rest: '/a?b',
    });
    expect(splitUrlAtHost('javascript:void(0)', 'javascript:void(0)')).toEqual({
      before: '',
      host: '',
      rest: 'javascript:void(0)',
    });
  });

  it('builds the folder path from the top, without the unnamed root, and survives a loop', () => {
    const nodes: Record<string, { title: string; parentId?: string }> = {
      '0': { title: '' },
      '1': { title: 'Bookmarks bar', parentId: '0' },
      '5': { title: '', parentId: '1' },
      '6': { title: 'Work', parentId: '5' },
      x: { title: 'Loop', parentId: 'y' },
      y: { title: 'Back', parentId: 'x' },
    };
    const lookup = (id: string) => nodes[id];
    expect(folderPathOf('6', lookup)).toBe('Bookmarks bar / Untitled / Work');
    expect(folderPathOf('0', lookup)).toBe('');
    expect(folderPathOf(undefined, lookup)).toBe('');
    expect(folderPathOf('x', lookup)).toBe('Back / Loop');
  });
});

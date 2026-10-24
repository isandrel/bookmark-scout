/**
 * Lists of the ids a part of a page shows (`src/lib/shown-ids.ts`): hidden ids are marked, and a
 * choice the list does not name was added since it was saved, so it shows in its configured place.
 * Each setting's own test checks it reads its list this way.
 */
import { describe, expect, it } from 'vitest';
import { CONTEXT_MENU_ENTRY_IDS } from '@/lib/context-menu-config';
import { HOVER_CARD_FIELDS } from '@/lib/hover-card';
import { POPUP_SECTIONS, POPUP_TOOLBAR_BUTTONS } from '@/lib/popup-layout';
import {
  defaultSettings,
  MANAGER_CARD_FIELDS,
  PREVIEW_FIELDS,
  type Settings,
  settingsSchema,
} from '@/lib/settings-schema';
import {
  encodeShownIds,
  HIDDEN_ID_MARK,
  placeAddedIds,
  readShownIds,
  splitShownIds,
} from '@/lib/shown-ids';
import { TOOL_ORDER_IDS } from '@/lib/tools-sidebar-config';
import { POPUP_MENUS } from '@/services/popup-row-actions';

const CHOICES = ['a', 'b', 'c', 'd'] as const;

/**
 * Every setting that lists shown ids this way, with its choices; the manager's menus, which also
 * mark sections, are checked in `action-menus.test.ts`.
 */
const SHOWN_ID_SETTINGS: Partial<Record<keyof Settings, readonly string[]>> = {
  popupSections: POPUP_SECTIONS,
  popupToolbarButtons: POPUP_TOOLBAR_BUTTONS,
  hoverCardFields: HOVER_CARD_FIELDS,
  managerCardFields: MANAGER_CARD_FIELDS,
  previewFields: PREVIEW_FIELDS,
  toolsSidebarOrder: TOOL_ORDER_IDS,
  contextMenuEntries: CONTEXT_MENU_ENTRY_IDS,
  popupBookmarkMenu: POPUP_MENUS.bookmark.sections.flat(),
  popupFolderMenu: POPUP_MENUS.folder.sections.flat(),
};

describe('lists of shown ids', () => {
  it('fit every setting that uses them, all shown or all hidden, with defaults of known ids', () => {
    for (const [key, choices] of Object.entries(SHOWN_ID_SETTINGS) as [
      keyof Settings,
      readonly string[],
    ][]) {
      const schema = settingsSchema.shape[key];
      for (const stored of [encodeShownIds(choices, choices), encodeShownIds([], choices)]) {
        expect(schema.safeParse(stored).success, `${key}: ${stored.join()}`).toBe(true);
      }
      const defaults = defaultSettings[key] as string[];
      for (const entry of defaults) {
        expect(choices, `${key}: ${entry}`).toContain(entry.replace(HIDDEN_ID_MARK, ''));
      }
    }
  });

  it('keep known ids once each, in order, and skip ids from a newer release', () => {
    expect(readShownIds(['b', 'x', 'a', 'b', '!c', '!d', '!x'], CHOICES)).toEqual(['b', 'a']);
    expect(readShownIds(['b', '!a', '!c', '!d'], CHOICES, ['a'])).toEqual(['b', 'a']);
    // A repeated id counts once, as first named: shown, then hidden, stays shown.
    expect(readShownIds(['a', '!a', '!b', '!c', '!d'], CHOICES)).toEqual(['a']);
  });

  it('show a choice the list does not name, after the configured choice before it', () => {
    expect(splitShownIds(['c', '!a'], CHOICES)).toEqual({ shown: ['c'], added: ['b', 'd'] });
    // b follows nothing shown before it, so it goes before c, the next configured one shown; d
    // follows c.
    expect(readShownIds(['c', '!a'], CHOICES)).toEqual(['b', 'c', 'd']);
    expect(readShownIds(['d', 'a'], CHOICES)).toEqual(['d', 'a', 'b', 'c']);
    expect(readShownIds([], CHOICES)).toEqual([...CHOICES]);
  });

  it('read back what they store, and store every hidden choice', () => {
    const stored = encodeShownIds(['c', 'a'], CHOICES);
    expect(stored).toEqual(['c', 'a', `${HIDDEN_ID_MARK}b`, `${HIDDEN_ID_MARK}d`]);
    expect(readShownIds(stored, CHOICES)).toEqual(['c', 'a']);
    // A choice added after the list was stored shows after the nearest configured one before it
    // that shows (c, as d is hidden).
    expect(readShownIds(stored, [...CHOICES, 'e'])).toEqual(['c', 'e', 'a']);
    expect(readShownIds(encodeShownIds([], CHOICES), CHOICES)).toEqual([]);
  });

  it('place added ids in their configured section, or a section of their own', () => {
    const configured = [
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ];
    // The user moved c into the first section: d follows it there; e and f have no neighbor shown,
    // so they become a section at the end.
    expect(placeAddedIds([['a', 'c'], ['b']], ['d', 'e', 'f'], configured)).toEqual([
      ['a', 'c', 'd'],
      ['b'],
      ['e', 'f'],
    ]);
    expect(placeAddedIds([], ['a', 'b', 'c', 'd', 'e', 'f'], configured)).toEqual(configured);
  });
});

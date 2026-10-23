/**
 * The browser right-click menu's tables (config/ui/context-menu.toml): where it can show and what
 * a click there saves, and the entries it can offer. The settings schema reads the ids for Show
 * Menu On and Menu Entries, and `services/context-menu.ts` builds the menu from both tables.
 */

import { z } from 'zod';

/** The browser's content contexts (Chrome and Firefox share these names). */
const browserContextSchema = z.enum([
  'page',
  'frame',
  'selection',
  'link',
  'editable',
  'image',
  'video',
  'audio',
]);

const idsOnce = (list: readonly { id: string }[]) =>
  new Set(list.map((entry) => entry.id)).size === list.length;

const contextMenuConfig = readConfig(
  'ui/context-menu',
  z.strictObject({
    contexts: z
      .array(
        z.strictObject({
          id: browserContextSchema,
          label: z.string().min(1),
          saves: z.enum(['link', 'page']),
        }),
      )
      .min(1)
      .refine(idsOnce, 'each context once'),
    entries: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[A-Za-z]+$/),
          label: z.string().min(1),
          icon: z.string().min(1),
          submenu: z.boolean(),
        }),
      )
      .min(1)
      .refine(idsOnce, 'each entry once'),
  }),
);

export type ContextMenuContext = (typeof contextMenuConfig.contexts)[number];
export type ContextMenuEntry = (typeof contextMenuConfig.entries)[number];

/** Where the menu can show, in Options order. */
export const CONTEXT_MENU_CONTEXTS: readonly ContextMenuContext[] = contextMenuConfig.contexts;

/** What the menu can offer, in its default order. */
export const CONTEXT_MENU_ENTRIES: readonly ContextMenuEntry[] = contextMenuConfig.entries;

export type ContextMenuContextId = ContextMenuContext['id'];

/** The ids of the contexts, for the Show Menu On setting. */
export const CONTEXT_MENU_CONTEXT_IDS = CONTEXT_MENU_CONTEXTS.map((context) => context.id) as [
  ContextMenuContextId,
  ...ContextMenuContextId[],
];
export const CONTEXT_MENU_ENTRY_IDS = CONTEXT_MENU_ENTRIES.map((entry) => entry.id);

/** The entries the menu shows, in order: every one when `stored` is empty, else those it names. */
export function getContextMenuEntries(stored: readonly string[]): ContextMenuEntry[] {
  if (stored.length === 0) return [...CONTEXT_MENU_ENTRIES];
  return [...new Set(stored)].flatMap((id) => {
    const entry = CONTEXT_MENU_ENTRIES.find((candidate) => candidate.id === id);
    return entry ? [entry] : [];
  });
}

/** The contexts of `stored` (Show Menu On), in Options order, each once. */
export function getContextMenuContexts(stored: readonly string[]): ContextMenuContext[] {
  return CONTEXT_MENU_CONTEXTS.filter((context) => stored.includes(context.id));
}

/** The context or entry `id` names; every caller passes an id of its table. */
function byId<T extends { id: string }>(table: readonly T[], id: string): T {
  const found = table.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown context menu id: ${id}`);
  return found;
}

/** The name of a context, for Options. */
export function getContextMenuContextLabel(id: string): string {
  return t(byId(CONTEXT_MENU_CONTEXTS, id).label as MessageKey);
}

/** The name of an entry, for Options and the menu. */
export function getContextMenuEntryLabel(id: string): string {
  return t(byId(CONTEXT_MENU_ENTRIES, id).label as MessageKey);
}

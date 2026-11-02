/**
 * Settings an earlier release had that were removed on purpose, with why. Their stored values are
 * dropped on read; the upgrade tests skip them and check they are really gone.
 */
export const RETIRED_SETTINGS: Readonly<Record<string, string>> = {
  folderMatchesTypos:
    'Allow Typos (0.3.5 and earlier), replaced on 2026-10-29 by Search Matching (searchFuzzy and ' +
    'the settings beside it); the maintainer chose not to carry the value over',
};

/**
 * Settings an earlier release stored in another scope, moved on purpose without carrying the value
 * over (new features need no backward compatibility): read back at their default, in `scope`.
 */
export const MOVED_SETTINGS: Readonly<
  Record<string, { scope: 'sync' | 'lists' | 'device'; why: string }>
> = {
  askAiDisabledActions: {
    scope: 'device',
    why:
      "Ask AI's turned-off actions, synced through 0.3.5, kept on each device since 2026-11-02: the list " +
      'outgrew what the sync quota holds',
  },
};

/** `values` without the settings moved since without their values. */
export function withoutMoved<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !(key in MOVED_SETTINGS)),
  ) as Partial<T>;
}

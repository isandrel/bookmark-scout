/**
 * Settings an earlier release had that were removed on purpose, with why. Their stored values are
 * dropped on read; the upgrade tests skip them and check they are really gone.
 */
export const RETIRED_SETTINGS: Readonly<Record<string, string>> = {
  folderMatchesTypos:
    'Allow Typos (0.3.5 and earlier), replaced on 2026-10-29 by Search Matching (searchFuzzy and ' +
    'the settings beside it); the maintainer chose not to carry the value over',
};

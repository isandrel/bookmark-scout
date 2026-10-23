/**
 * A manager menu's sections as the user arranged them in Options (`customizeMenu`), following the
 * setting live.
 */
import { useMemo } from 'react';

export function useManagerMenu(kind: ActionMenuKind): ActionId[][] {
  const { value: stored } = useSetting(MENU_SETTING_KEYS[kind]);
  return useMemo(() => customizeMenu(kind, stored), [kind, stored]);
}

/**
 * The in-page shortcuts' keys for React: the configured ones (config/ui/shortcuts.toml) with the
 * keys the user gave them in Options (`pageShortcutOverrides`), so every listener, tooltip, hint,
 * and help row follows a change at once.
 */

import { useMemo } from 'react';

export function usePageShortcuts(): PageShortcutBindings {
  const { value: overrides } = useSetting('pageShortcutOverrides');
  return useMemo(() => getPageShortcutBindings(parsePageShortcutOverrides(overrides)), [overrides]);
}

/**
 * Options > Saving & Search > Quick save shortcuts: the keys each command has now, read from the
 * browser (`commands.getAll`), and the way to change them. Browsers own the bindings, so this
 * panel only links to their shortcut settings; it re-reads the keys when the page regains focus.
 */

import { Keyboard } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

/** Chromium's shortcut settings page per build; Firefox has an API that opens its own. */
const SHORTCUT_SETTINGS_URLS: Partial<Record<PermissionBrowser, string>> = {
  chrome: 'chrome://extensions/shortcuts',
  edge: 'edge://extensions/shortcuts',
};

/** Firefox 137+ opens its Manage Extension Shortcuts page; Chrome's types do not know it. */
type FirefoxCommands = { openShortcutSettings?: () => Promise<void> };

function firefoxCommands(): FirefoxCommands | undefined {
  return browser.commands as FirefoxCommands | undefined;
}

/** The keys of a browser shortcut string: "Alt+Shift+S", or macOS glyphs such as "⌥⇧S". */
function shortcutKeys(shortcut: string): string[] {
  return shortcut.includes('+') ? shortcut.split('+') : [...shortcut];
}

export function ShortcutsPanel() {
  const [bindings, setBindings] = useState<Record<string, string> | null>(null);
  const browserName = CURRENT_PERMISSION_BROWSER;
  const settingsUrl = SHORTCUT_SETTINGS_URLS[browserName];
  const canOpenFirefoxSettings =
    browserName === 'firefox' && typeof firefoxCommands()?.openShortcutSettings === 'function';

  const load = useCallback(() => {
    browser.commands
      ?.getAll()
      .then((commands) =>
        setBindings(
          Object.fromEntries(
            commands.map((command) => [command.name ?? '', command.shortcut ?? '']),
          ),
        ),
      )
      .catch(() => setBindings({}));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  const openSettings = () => {
    if (settingsUrl) {
      void browser.tabs.create({ url: settingsUrl, active: true });
    } else if (canOpenFirefoxSettings) {
      void firefoxCommands()?.openShortcutSettings?.();
    }
  };

  return (
    <OptionsPanel
      id="quick-save-shortcuts"
      data-testid="quick-save-shortcuts"
      title={t('settings_shortcuts')}
      description={t('settings_shortcutsDesc')}
      actionsLayout="wrap"
      actions={
        settingsUrl || canOpenFirefoxSettings ? (
          <Button type="button" variant="outline" size="sm" onClick={openSettings}>
            <Keyboard aria-hidden="true" className="h-4 w-4" />
            {t('settings_shortcutsChange')}
          </Button>
        ) : undefined
      }
    >
      <ul className="divide-y rounded-md border">
        {(Object.keys(EXTENSION_COMMANDS) as ExtensionCommand[]).map((name) => {
          const shortcut = bindings?.[name] ?? '';
          return (
            <li
              key={name}
              data-command={name}
              className="flex min-h-10 items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0">{t(EXTENSION_COMMANDS[name].descriptionKey)}</span>
              {bindings === null ? null : shortcut ? (
                <span className="flex shrink-0 items-center gap-1">
                  {shortcutKeys(shortcut).map((key, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a binding's keys never reorder.
                    <Kbd key={`${index}-${key}`}>{key}</Kbd>
                  ))}
                </span>
              ) : (
                <span className="shrink-0 text-muted-foreground">
                  {t('settings_shortcutNotSet')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {browserName === 'firefox' && (
        <p className="text-sm text-muted-foreground">{t('settings_shortcutsFirefoxHint')}</p>
      )}
    </OptionsPanel>
  );
}

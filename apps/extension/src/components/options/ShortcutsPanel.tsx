/**
 * Options > Saving & Search > Quick save shortcuts: the keys each command has now, read from the
 * browser (`useCommandShortcuts`), and the way to change them. Where the extension can set
 * shortcuts itself (Firefox), each command gets a `ShortcutRecorder`; elsewhere the keys are shown
 * as key caps and **Change shortcuts** opens the browser's shortcut page, which lists every
 * extension. `options.html#quick-save-shortcuts` scrolls here, as the popup's notice links.
 */

import { Keyboard } from 'lucide-react';
import { useEffect } from 'react';

export function ShortcutsPanel() {
  const { shortcuts, reload } = useCommandShortcuts();
  const editable = canEditCommandShortcuts();
  const canOpenSettings = canOpenBrowserShortcutSettings();
  // Chrome and Edge list every extension on one page; Firefox's opens on this one.
  const listsAllExtensions = canOpenSettings && !editable;
  const apple = isApplePlatform();

  useEffect(() => {
    if (window.location.hash !== `#${SHORTCUTS_PANEL_ID}`) return;
    document.getElementById(`${SHORTCUTS_PANEL_ID}-heading`)?.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <OptionsPanel
      id={SHORTCUTS_PANEL_ID}
      data-testid="quick-save-shortcuts"
      title={t('settings_shortcuts')}
      description={t('settings_shortcutsDesc')}
      actionsLayout="wrap"
      actions={
        canOpenSettings ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void openBrowserShortcutSettings()}
            >
              <Keyboard aria-hidden="true" className="h-4 w-4" />
              {t('settings_shortcutsChange')}
            </Button>
            {listsAllExtensions && (
              <span data-testid="shortcuts-page-hint" className="text-xs text-muted-foreground">
                {t('settings_shortcutsFindExtension')}
              </span>
            )}
          </span>
        ) : undefined
      }
    >
      <ul className="divide-y rounded-md border">
        {(Object.keys(EXTENSION_COMMANDS) as ExtensionCommand[]).map((name) => {
          const shortcut = shortcuts?.[name] ?? '';
          return (
            <li
              key={name}
              data-command={name}
              className="flex min-h-10 items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0">{t(EXTENSION_COMMANDS[name].descriptionKey)}</span>
              {shortcuts === null ? null : editable ? (
                <ShortcutRecorder
                  name={name}
                  shortcut={shortcut}
                  otherShortcuts={shortcuts}
                  onChanged={reload}
                />
              ) : shortcut ? (
                <span className="flex shrink-0 items-center gap-1">
                  {commandShortcutKeyCaps(shortcut, { apple }).map((key, index) => (
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
      {editable && (
        <p className="text-sm text-muted-foreground">{t('settings_shortcutRecorderHint')}</p>
      )}
    </OptionsPanel>
  );
}

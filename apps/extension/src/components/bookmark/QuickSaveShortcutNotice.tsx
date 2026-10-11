import { Keyboard, X } from 'lucide-react';

/**
 * One line above the popup and side panel footer when a quick save command has no keys, which
 * Chrome does when another extension already took the suggested ones. **Set it up** goes where the
 * keys can be set (`openCommandShortcutSetup`); the dismissal is remembered on this device. Shown
 * only once the keys and the dismissal are both read, so it never flashes.
 */
export function QuickSaveShortcutNotice() {
  const { shortcuts } = useCommandShortcuts();
  const { value: dismissed, isLoading } = useStoredValue(dismissedNoticesValue, (notices) =>
    notices.includes('quick-save-shortcut'),
  );
  const missing = shortcuts !== null && Object.values(shortcuts).some((keys) => keys === '');
  if (!missing || isLoading || dismissed) return null;

  const message = t('popup_shortcutNotSet');
  return (
    <section
      aria-label={message}
      data-testid="quick-save-shortcut-notice"
      className="flex h-7 shrink-0 items-center gap-1.5 border-t pl-3 pr-1 text-xs text-muted-foreground"
    >
      <Keyboard aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate" title={message}>
        {message}
      </span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        className="shrink-0 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => void openCommandShortcutSetup()}
      >
        {t('popup_shortcutSetUp')}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="ml-auto text-muted-foreground"
        aria-label={t('action_dismiss')}
        title={t('action_dismiss')}
        onClick={() => void dismissNotice('quick-save-shortcut')}
      >
        <X aria-hidden="true" className="size-3.5" />
      </Button>
    </section>
  );
}

import { Keyboard, X } from 'lucide-react';

type ShortcutNotice = {
  id: DismissibleNotice;
  message: string;
  open: () => Promise<void>;
};

/**
 * The notice to show, in order of importance: a quick save command has no keys (Chrome does that
 * when another extension already took the suggested ones), then, in Chrome and Edge, the offer to
 * give quick save the browser's bookmark keys, which only the user can do. Notices the user
 * dismissed are skipped.
 */
function pickNotice(
  shortcuts: CommandShortcuts,
  dismissed: readonly DismissibleNotice[],
  apple: boolean,
): ShortcutNotice | null {
  const takeover = getBookmarkShortcutTakeover();
  const notices: (ShortcutNotice | false)[] = [
    Object.values(shortcuts).some((keys) => keys === '') && {
      id: 'quick-save-shortcut',
      message: t('popup_shortcutNotSet'),
      open: openCommandShortcutSetup,
    },
    takeover !== null &&
      !isSameCommandShortcut(shortcuts[takeover.command], takeover.shortcut, { apple }) && {
        id: 'quick-save-bookmark-key',
        message: t(
          'settings_shortcutUseBookmarkKey',
          formatCommandShortcut(takeover.shortcut, { apple }),
        ),
        // The steps need more room than this line; Options explains them beside the button.
        open: openCommandShortcutsInOptions,
      },
  ];
  return (
    notices.find(
      (notice): notice is ShortcutNotice => notice !== false && !dismissed.includes(notice.id),
    ) ?? null
  );
}

/**
 * One line above the popup and side panel footer about the quick save shortcuts (`pickNotice`).
 * **Set it up** goes where the keys can be set; each notice's dismissal is remembered on this
 * device. Shown only once the keys and the dismissals are both read, so it never flashes.
 */
export function QuickSaveShortcutNotice() {
  const { shortcuts } = useCommandShortcuts();
  const { value: dismissed, isLoading } = useStoredValue(dismissedNoticesValue);
  if (shortcuts === null || isLoading) return null;
  const notice = pickNotice(shortcuts, dismissed, isApplePlatform());
  if (!notice) return null;

  return (
    <section
      aria-label={notice.message}
      data-testid="quick-save-shortcut-notice"
      data-notice={notice.id}
      className="flex h-7 shrink-0 items-center gap-1.5 border-t pl-3 pr-1 text-xs text-muted-foreground"
    >
      <Keyboard aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate" title={notice.message}>
        {notice.message}
      </span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        className="shrink-0 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => void notice.open()}
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
        onClick={() => void dismissNotice(notice.id)}
      >
        <X aria-hidden="true" className="size-3.5" />
      </Button>
    </section>
  );
}

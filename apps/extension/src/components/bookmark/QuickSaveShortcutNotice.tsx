import { Keyboard, X } from 'lucide-react';

type ShortcutNotice = {
  id: DismissibleNotice;
  message: string;
  /** The link after the message, if any. */
  action?: { label: string; open: () => Promise<void> };
  /** An offer rather than a problem: it gives way to the tree in a very short popup. */
  optional?: boolean;
};

/** The command whose keys the tip names: the one that saves without AI, which always works. */
const TIP_COMMAND: ExtensionCommand = 'quick-save';

/**
 * The notice to show, in order of importance: a quick save command has no keys (Chrome does that
 * when another extension already took the suggested ones), then a tip naming the quick save keys
 * that work now. In Chrome and Edge the tip also offers the browser's bookmark keys, which only
 * the user can set up; once quick save has them, the user knows the shortcut and there is no
 * tip. Notices the user dismissed are skipped.
 */
function pickNotice(
  shortcuts: CommandShortcuts,
  dismissed: readonly DismissibleNotice[],
  apple: boolean,
): ShortcutNotice | null {
  const takeover = getBookmarkShortcutTakeover();
  const tipKeys = shortcuts[TIP_COMMAND];
  const hasBookmarkKeys =
    takeover !== null &&
    isSameCommandShortcut(shortcuts[takeover.command], takeover.shortcut, { apple });
  const notices: (ShortcutNotice | false)[] = [
    Object.values(shortcuts).some((keys) => keys === '') && {
      id: 'quick-save-shortcut',
      message: t('popup_shortcutNotSet'),
      action: { label: t('popup_shortcutSetUp'), open: openCommandShortcutSetup },
    },
    tipKeys !== '' &&
      !hasBookmarkKeys && {
        id: 'quick-save-bookmark-key',
        message: t('newcomer_quickSaveTip', formatCommandShortcut(tipKeys, { apple })),
        // The steps need more room than this line; Options explains them beside the button.
        action: takeover
          ? {
              label: t(
                'newcomer_useBookmarkKeyInstead',
                formatCommandShortcut(takeover.shortcut, { apple }),
              ),
              open: openCommandShortcutsInOptions,
            }
          : undefined,
        optional: true,
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
 * Its link goes where the keys can be set; each notice's dismissal is remembered on this device.
 * Shown only once the keys and the dismissals are both read, so it never flashes.
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
      // Below 400px of height (the popup goes down to 300), the tree needs every row it can get.
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 border-t pl-3 pr-1 text-xs text-muted-foreground',
        notice.optional && '[@media(max-height:399px)]:hidden',
      )}
    >
      <Keyboard aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate" title={notice.message}>
        {notice.message}
      </span>
      {notice.action && (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="shrink-0 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void notice.action?.open()}
          >
            {notice.action.label}
          </button>
        </>
      )}
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

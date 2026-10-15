/**
 * Notices the user dismissed on this device (`STORAGE_ITEMS.dismissedNotices`). A new notice that
 * can be dismissed is a new id here; stored ids this release does not know are dropped on read.
 */

export const DISMISSIBLE_NOTICES = [
  /** The popup and side panel line saying a quick save command has no shortcut. */
  'quick-save-shortcut',
  /**
   * The same line naming the quick save keys that work now and, in Chrome and Edge, offering the
   * browser's bookmark keys instead (the id dates from when it was only that offer).
   */
  'quick-save-bookmark-key',
] as const;

export type DismissibleNotice = (typeof DISMISSIBLE_NOTICES)[number];

function isDismissibleNotice(value: unknown): value is DismissibleNotice {
  return (DISMISSIBLE_NOTICES as readonly unknown[]).includes(value);
}

export const dismissedNoticesValue = defineStoredValue<DismissibleNotice[]>(
  STORAGE_ITEMS.dismissedNotices,
  {
    parse: (raw) => (Array.isArray(raw) ? [...new Set(raw.filter(isDismissibleNotice))] : []),
    empty: [],
    isEmpty: (notices) => notices.length === 0,
  },
);

export async function dismissNotice(notice: DismissibleNotice): Promise<void> {
  await dismissedNoticesValue.update((current) =>
    current.includes(notice) ? current : [...current, notice],
  );
}

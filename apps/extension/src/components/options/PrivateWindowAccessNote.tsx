/**
 * Under a setting that works in private windows only where the browser allows the extension
 * there: while it does not, says where to allow it, and that private windows are skipped until then.
 */
export function PrivateWindowAccessNote() {
  const allowed = usePrivateWindowAccess();
  if (allowed !== false) return null;
  return (
    <p
      data-testid="private-window-access-note"
      role="note"
      className="mx-4 -mt-1 rounded-md bg-warning-wash px-3 py-2 text-xs text-foreground"
    >
      {t('covers_privateAccessNote')}
    </p>
  );
}

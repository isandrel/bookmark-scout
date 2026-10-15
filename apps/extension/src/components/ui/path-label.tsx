/**
 * A folder path on one line that truncates in the middle: the leading folders shrink to an
 * ellipsis first and the last folder stays readable, so similar paths stay distinguishable.
 * The full path is the native tooltip. A label without a separator is shown whole.
 */
export function PathLabel({ path, className }: { path: string; className?: string }) {
  const cut = path.lastIndexOf(FOLDER_PATH_SEPARATOR);
  if (cut < 0) {
    return (
      <span className={cn('min-w-0 truncate', className)} title={path}>
        {path}
      </span>
    );
  }
  return (
    <span className={cn('flex min-w-0 gap-[0.25em]', className)} title={path}>
      {/* The separator's trailing space keeps the text whole for copying and screen readers;
          it does not render at the end of a line, so the gap stands in for it. */}
      <span className="min-w-0 truncate" data-slot="path-label-parents">
        {`${path.slice(0, cut)}${FOLDER_PATH_SEPARATOR}`}
      </span>
      <span className="max-w-[75%] shrink-0 truncate" data-slot="path-label-name">
        {path.slice(cut + FOLDER_PATH_SEPARATOR.length)}
      </span>
    </span>
  );
}

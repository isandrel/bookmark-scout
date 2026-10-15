import { FilePlus } from 'lucide-react';

/**
 * One line under the popup and side panel search box naming the page a folder click saves, so a
 * first-time user sees what the folders are for. Hidden while the page is unknown (the side panel
 * before tab access) and, like the other optional lines, below 400px of height.
 */
export function CurrentPageLine() {
  const title = useCurrentPageTitle();
  if (!title) return null;
  const text = t('newcomer_pageToSave', title);
  return (
    <p
      data-testid="current-page-line"
      title={text}
      className="flex h-6 shrink-0 items-center gap-1.5 border-b px-3 text-xs text-muted-foreground [@media(max-height:399px)]:hidden"
    >
      <FilePlus aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{text}</span>
    </p>
  );
}

import type { AnchorHTMLAttributes, MouseEvent } from 'react';

/** Whether a URL can be opened in a tab from an extension page (bookmarklets cannot). */
export function isOpenableUrl(url: string | undefined): url is string {
  if (!url || isScriptUrl(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * A click handler for links that opens them where the "Open links in" setting says. Plain
 * left clicks are handled; middle-click and modifier clicks keep the browser's own behavior
 * (background tab, new window), which the anchor's `target="_blank"` already gives.
 */
export function useLinkClick(): (event: MouseEvent<HTMLAnchorElement>, url: string) => void {
  const { value: target } = useSetting('linkOpenTarget');
  return (event, url) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    openUrl(url, target).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  };
}

type UrlLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string };

/**
 * A URL shown in the extension's pages, clickable when it can be opened. Clicks do not reach
 * the row or card around the link, so opening a link never also selects or toggles that row.
 */
export function UrlLink({ href, className, children, onClick, ...props }: UrlLinkProps) {
  const onLinkClick = useLinkClick();
  if (!isOpenableUrl(href)) {
    return <span className={className}>{children ?? href}</span>;
  }
  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
        if (!event.defaultPrevented) onLinkClick(event, href);
      }}
    >
      {children ?? href}
    </a>
  );
}

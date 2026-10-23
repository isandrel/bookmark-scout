import { ArrowRight, ExternalLink, Layers2, type LucideIcon } from 'lucide-react';
import type { AnchorHTMLAttributes, MouseEvent } from 'react';

/** Whether a URL can be opened in a tab from an extension page (`isOpenableBookmarkUrl`). */
export function isOpenableUrl(url: string | undefined): url is string {
  if (!isOpenableBookmarkUrl(url)) return false;
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

/** Formats addresses the way the Show Trailing Slash setting says (`formatDisplayUrl`). */
export function useDisplayUrl(): (url: string) => string {
  const { value: showTrailingSlash } = useSetting('showTrailingSlash');
  return (url) => formatDisplayUrl(url, showTrailingSlash);
}

/** What a link shows for each "Open links in" choice: one conventional icon and its words. */
export const LINK_TARGET_ICONS = {
  new_tab: { icon: ExternalLink, labelKey: 'link_opensInNewTab' },
  background_tab: { icon: Layers2, labelKey: 'link_opensInBackgroundTab' },
  current_tab: { icon: ArrowRight, labelKey: 'link_opensInThisTab' },
} as const satisfies Record<LinkOpenTarget, { icon: LucideIcon; labelKey: MessageKey }>;

/** Where a plain click on a link goes, or null while Show Where Links Open is off. */
export function useLinkTarget(): {
  target: LinkOpenTarget;
  icon: LucideIcon;
  label: string;
} | null {
  const { value: target } = useSetting('linkOpenTarget');
  const { value: show } = useSetting('showLinkTarget');
  // Table cells and rows can be memoized, so follow the language here too.
  useLanguageRevision();
  if (!show) return null;
  const { icon, labelKey } = LINK_TARGET_ICONS[target];
  return { target, icon, label: t(labelKey) };
}

/**
 * A muted icon for where a plain click on a link opens (Settings > Behavior > Open links in),
 * with its words in a tooltip and, inside a link, for screen readers. `decorative` leaves the
 * words out where they would not belong to the link, such as a row's hover actions.
 */
export function LinkTargetIcon({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  const linkTarget = useLinkTarget();
  if (!linkTarget) return null;
  const { target, icon: Icon, label } = linkTarget;
  return (
    <span
      data-slot="link-target"
      data-target={target}
      aria-hidden={decorative || undefined}
      title={decorative ? undefined : label}
      className={cn('inline-flex shrink-0 text-muted-foreground', className)}
    >
      <Icon aria-hidden="true" className="size-3" />
      {decorative ? null : <span className="sr-only">{label}</span>}
    </span>
  );
}

type UrlLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  /**
   * One line cut short with an ellipsis: the text truncates and the icon after it stays whole.
   * Without it the link flows with the text around it and the icon follows its last line.
   */
  truncate?: boolean;
};

/**
 * A URL shown in the extension's pages, clickable when it can be opened. Clicks do not reach
 * the row or card around the link, so opening a link never also selects or toggles that row.
 */
export function UrlLink({
  href,
  className,
  children,
  onClick,
  truncate = false,
  ...props
}: UrlLinkProps) {
  const onLinkClick = useLinkClick();
  const displayUrl = useDisplayUrl();
  const content = children ?? displayUrl(href);
  if (!isOpenableUrl(href)) {
    return <span className={cn(truncate && 'truncate', className)}>{content}</span>;
  }
  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        truncate && 'flex min-w-0 items-center gap-1',
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
        if (!event.defaultPrevented) onLinkClick(event, href);
      }}
    >
      {truncate ? <span className="min-w-0 truncate">{content}</span> : content}
      {/* In a link laid out as flex, its gap spaces the icon. */}
      <LinkTargetIcon
        className={truncate ? undefined : 'ms-1 align-middle [.inline-flex>&]:ms-0'}
      />
    </a>
  );
}

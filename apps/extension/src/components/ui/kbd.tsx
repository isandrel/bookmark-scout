import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react';
import type * as React from 'react';

/**
 * Arrow and Enter key caps drawn as icons. As text they mix fonts: the bundled fonts' Latin
 * subsets have ↑ and ↓ but not ← → ↵, which then fall back to a system font at another size.
 */
const KEY_CAP_ICONS: Readonly<Record<string, LucideIcon>> = {
  '↑': ArrowUp,
  '↓': ArrowDown,
  '←': ArrowLeft,
  '→': ArrowRight,
  '↵': CornerDownLeft,
};

/** A keyboard key glyph, such as `/` or `↵`, drawn as a small keycap. */
function Kbd({ className, children, ...props }: React.ComponentProps<'kbd'>) {
  const Icon = typeof children === 'string' ? KEY_CAP_ICONS[children] : undefined;
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm border bg-muted px-1 font-mono text-[11px] font-medium leading-none text-muted-foreground',
        className,
      )}
      {...props}
    >
      {Icon ? (
        <>
          <Icon aria-hidden="true" data-slot="kbd-icon" className="size-3" strokeWidth={2.25} />
          {/* The glyph stays the key's text for screen readers and text matching. */}
          <span className="sr-only">{children}</span>
        </>
      ) : (
        children
      )}
    </kbd>
  );
}

export { Kbd };

import {
  ArrowBigUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CornerDownLeft,
  Delete,
  type LucideIcon,
  OptionIcon,
} from 'lucide-react';
import type * as React from 'react';

type KeyCapIcon = { icon: LucideIcon; className?: string };

/**
 * Key caps drawn as icons. As text they mix fonts: the bundled fonts' Latin subsets have ↑ and ↓
 * but not ← → ↵ or Apple's ⌥ ⇧ ⌫ ⌦, which then fall back to a system font at another size.
 */
const KEY_CAP_ICONS: Readonly<Record<string, KeyCapIcon>> = {
  '↑': { icon: ArrowUp },
  '↓': { icon: ArrowDown },
  '←': { icon: ArrowLeft },
  '→': { icon: ArrowRight },
  '↵': { icon: CornerDownLeft },
  '⌥': { icon: OptionIcon },
  '⇧': { icon: ArrowBigUp },
  '⌫': { icon: Delete },
  // Forward delete's key cap is backspace's, mirrored.
  '⌦': { icon: Delete, className: '-scale-x-100' },
};

/** A keyboard key glyph, such as `/` or `↵`, drawn as a small keycap. */
function Kbd({ className, children, ...props }: React.ComponentProps<'kbd'>) {
  const keyCapIcon = typeof children === 'string' ? KEY_CAP_ICONS[children] : undefined;
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm border bg-muted px-1 font-mono text-[11px] font-medium leading-none text-muted-foreground',
        className,
      )}
      {...props}
    >
      {keyCapIcon ? (
        <>
          <keyCapIcon.icon
            aria-hidden="true"
            data-slot="kbd-icon"
            className={cn('size-3', keyCapIcon.className)}
            strokeWidth={2.25}
          />
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

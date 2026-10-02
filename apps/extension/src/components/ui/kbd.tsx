import type * as React from 'react';

/** A keyboard key glyph, such as `/` or `↵`, drawn as a small keycap. */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm border bg-muted px-1 font-mono text-[11px] font-medium leading-none text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };

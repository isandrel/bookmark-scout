import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { Check, Minus } from 'lucide-react';
import * as React from 'react';

const Checkbox = React.forwardRef<
  HTMLElement,
  Omit<CheckboxPrimitive.Root.Props, 'className'> & { className?: string }
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // The root renders a <span> (Radix rendered a <button>), so it needs its own box model.
      'group/checkbox peer inline-flex items-center justify-center h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-checked:bg-primary data-checked:text-primary-foreground data-indeterminate:bg-primary data-indeterminate:text-primary-foreground',
      className,
    )}
    {...props}
  >
    {/* A partly selected group (indeterminate) shows a dash, never the check of a full one. */}
    <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
      <Check className="h-4 w-4 group-data-indeterminate/checkbox:hidden" />
      <Minus className="hidden h-4 w-4 group-data-indeterminate/checkbox:block" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };

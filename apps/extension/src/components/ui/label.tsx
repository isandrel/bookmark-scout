import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
);

// Base UI has no Label primitive; a native <label> keeps htmlFor association.
const Label = React.forwardRef<
  HTMLLabelElement,
  React.ComponentPropsWithoutRef<'label'> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: callers associate the control via htmlFor.
  <label ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = 'Label';

export { Label };

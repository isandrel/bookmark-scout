import { Separator as SeparatorPrimitive } from '@base-ui/react/separator';
import * as React from 'react';

const Separator = React.forwardRef<
  HTMLDivElement,
  Omit<SeparatorPrimitive.Props, 'className'> & { className?: string }
>(({ className, orientation = 'horizontal', ...props }, ref) => (
  <SeparatorPrimitive
    ref={ref}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
      className,
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';

export { Separator };

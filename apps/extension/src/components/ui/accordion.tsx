import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronDown } from 'lucide-react';
import * as React from 'react';

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  HTMLDivElement,
  Omit<AccordionPrimitive.Item.Props, 'className'> & { className?: string }
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item ref={ref} className={cn(className)} {...props} />
));
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  Omit<AccordionPrimitive.Trigger.Props, 'className'> & {
    className?: string;
    /** Hide the chevron (e.g. nothing to expand) while keeping its space for alignment. */
    hideIndicator?: boolean;
  }
>(({ className, children, hideIndicator = false, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'group/trigger flex w-full items-center justify-between py-4 text-sm font-medium transition-all hover:underline [&[data-panel-open]>svg]:rotate-180',
        className,
      )}
      {...props}
    >
      <div className="flex-1 min-w-0 overflow-hidden">{children}</div>
      <div
        className={cn('flex-shrink-0 ml-2 w-4 flex justify-center', hideIndicator && 'invisible')}
        aria-hidden={hideIndicator || undefined}
      >
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </div>
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';

const AccordionContent = React.forwardRef<
  HTMLDivElement,
  Omit<AccordionPrimitive.Panel.Props, 'className'> & { className?: string }
>(({ className, children, ...props }, ref) => {
  const hasContent = React.Children.count(children) > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <AccordionPrimitive.Panel
      ref={ref}
      className={cn(
        'overflow-hidden text-sm data-ending-style:animate-accordion-up data-open:animate-accordion-down',
      )}
      {...props}
    >
      <div className={cn('pb-4 pt-0', className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
});
AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };

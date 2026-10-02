import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronRight } from 'lucide-react';
import * as React from 'react';

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  HTMLDivElement,
  Omit<AccordionPrimitive.Item.Props, 'className'> & { className?: string }
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item ref={ref} className={cn(className)} {...props} />
));
AccordionItem.displayName = 'AccordionItem';

/**
 * Tree-style disclosure trigger: the chevron leads the row, points right while closed, and turns
 * down while open. Its slot is fixed width so rows line up whether or not they can expand.
 */
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
        'group/trigger flex w-full items-center gap-1 py-4 text-sm font-medium transition-all hover:underline',
        className,
      )}
      {...props}
    >
      {/* The trigger's aria-expanded already conveys the state, so the chevron stays decorative. */}
      <div
        data-slot="accordion-indicator"
        aria-hidden="true"
        className={cn(
          'flex size-4 shrink-0 items-center justify-center transition-transform duration-200 group-data-[panel-open]/trigger:rotate-90',
          hideIndicator && 'invisible',
        )}
      >
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">{children}</div>
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

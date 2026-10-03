import type { ComponentProps, ReactNode } from 'react';

type OptionsPanelProps = Omit<ComponentProps<'section'>, 'id' | 'title'> & {
  /** Names the heading (`<id>-heading`) and the description (`<id>-description`). */
  id: string;
  title: ReactNode;
  description: ReactNode;
  /** Controls beside the heading, such as an Add button or an on/off switch. */
  actions?: ReactNode;
  /**
   * `beside` (default) keeps small actions, such as a switch, next to the text and narrows the
   * text. `wrap` moves wide actions, such as a labeled button, under the text when both don't fit.
   */
  actionsLayout?: 'beside' | 'wrap';
};

/** A boxed section of an Options page with a heading, a description, and optional actions. */
export function OptionsPanel({
  id,
  title,
  description,
  actions,
  actionsLayout = 'beside',
  children,
  ...props
}: OptionsPanelProps) {
  const headingId = `${id}-heading`;
  const wrap = actionsLayout === 'wrap';
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-lg border bg-card p-4"
      {...props}
    >
      <div className={cn('flex flex-wrap items-start justify-between', wrap ? 'gap-2' : 'gap-3')}>
        <div className={cn('min-w-0', !wrap && 'flex-1')}>
          <h3 id={headingId} className="text-base font-medium">
            {title}
          </h3>
          <p id={`${id}-description`} className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

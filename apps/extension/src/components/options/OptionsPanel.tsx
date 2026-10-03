import type { ComponentProps, ReactNode } from 'react';

type OptionsPanelProps = Omit<ComponentProps<'section'>, 'id' | 'title'> & {
  /** Names the heading (`<id>-heading`) and the description (`<id>-description`). */
  id: string;
  title: ReactNode;
  description: ReactNode;
  /** Controls beside the heading, such as an Add button or an on/off switch. */
  actions?: ReactNode;
};

/** A boxed section of an Options page with a heading, a description, and optional actions. */
export function OptionsPanel({
  id,
  title,
  description,
  actions,
  children,
  ...props
}: OptionsPanelProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-lg border bg-card p-4"
      {...props}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
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

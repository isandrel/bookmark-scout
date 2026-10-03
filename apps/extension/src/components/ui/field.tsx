/**
 * A labeled form field: the label, description, and inline error, with the ids and ARIA wiring
 * that connect them to the control. The caller renders the control from `children(control)`.
 */
import type { ReactNode } from 'react';

/** Props for the field's control: spread them onto an input, or pass them to a custom control. */
export type FieldControlProps = {
  id: string;
  'aria-labelledby': string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
};

type FieldProps = {
  /** The control's id; the label, description, and error ids derive from it. */
  id: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  /**
   * `stacked` (default) puts the label, control, description, and error in one column.
   * `setting` is an Options setting row: label, description, and error beside the control.
   */
  layout?: 'stacked' | 'setting';
  /** Setting layout: shown after the label, such as a Modified badge. */
  badge?: ReactNode;
  /** Setting layout: shown after the control, such as a reset button. */
  actions?: ReactNode;
  children: (control: FieldControlProps) => ReactNode;
};

function getFieldIds(id: string) {
  return {
    label: `${id}-label`,
    description: `${id}-description`,
    error: `${id}-error`,
  };
}

export function Field({
  id,
  label,
  description,
  error,
  layout = 'stacked',
  badge,
  actions,
  children,
}: FieldProps) {
  const ids = getFieldIds(id);
  const describedBy = [description ? ids.description : '', error ? ids.error : '']
    .filter(Boolean)
    .join(' ');
  const control: FieldControlProps = {
    id,
    'aria-labelledby': ids.label,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(error ? { 'aria-invalid': true } : {}),
  };

  if (layout === 'setting') {
    return (
      <>
        <div className="min-w-0 flex-1 space-y-1 sm:pr-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label id={ids.label} htmlFor={id} className="text-base font-medium">
              {label}
            </Label>
            {badge}
          </div>
          {description && (
            <p id={ids.description} className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
          {error && (
            <p id={ids.error} role="alert" className="text-sm text-destructive-text">
              {error}
            </p>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
          {children(control)}
          {actions}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label id={ids.label} htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {children(control)}
      {description && (
        <p id={ids.description} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={ids.error} role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}
    </div>
  );
}

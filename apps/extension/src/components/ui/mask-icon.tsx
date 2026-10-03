import type * as React from 'react';

/**
 * A one-color image, such as a provider logo, drawn as a CSS mask so it takes the current text
 * color in every theme. The image is never inserted as a document, so nothing in it runs.
 */
export function MaskIcon({
  url,
  className,
  ...props
}: { url: string } & Omit<React.ComponentProps<'span'>, 'style' | 'children'>) {
  const mask = `url("${url}") center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      className={cn('bg-current', className)}
      style={{ mask, WebkitMask: mask }}
      {...props}
    />
  );
}

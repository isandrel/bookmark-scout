import { Search, X } from 'lucide-react';
import { type ComponentProps, useRef } from 'react';

export type SearchInputProps = Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Shows a magnifier at the start of the box. */
  icon?: boolean;
  /** Classes of the wrapper; `className` styles the input itself. */
  wrapperClassName?: string;
};

/**
 * A search box with its own Clear search button, in every browser: only Chromium draws one inside
 * `type="search"`, so Firefox had none. A text input with the searchbox role keeps Chromium from
 * drawing a second one, without the CSS that would hide it.
 */
export function SearchInput({
  value,
  onValueChange,
  icon = false,
  wrapperClassName,
  className,
  ...props
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cn('relative', wrapperClassName)}>
      {icon && (
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
      )}
      <Input
        {...props}
        ref={inputRef}
        type="text"
        role="searchbox"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(icon && 'pl-9', value && 'pr-9', className)}
      />
      {value && (
        <button
          type="button"
          // Keeps focus in the box, so the click does not blur it first.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onValueChange('');
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('search_clear')}
          title={t('search_clear')}
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * A list of short values as removable chips with a box that adds more, so nobody has to type a
 * comma-separated list. Shared by list settings (query parameter names), bookmark tags, and the
 * tags a Smart Rule adds.
 */

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TokenChip({
  label,
  onRemove,
  mono = false,
  disabled = false,
}: {
  label: string;
  onRemove: () => void;
  /** Code-like values (parameter names, status codes) read better in the monospace font. */
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      data-slot="list-chip"
      className={cn(
        'inline-flex h-7 max-w-full items-center gap-1 rounded-full border bg-muted/50 pl-2.5 pr-1 text-xs',
        mono && 'font-mono',
      )}
    >
      <span className="truncate" title={label}>
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={t('settings_listRemove', label)}
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </span>
  );
}

type TokenInputProps = {
  id: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Splits typed or pasted text into values. */
  parse: (raw: string) => string[];
  /** Matches a typed or pasted character that commits what came before it. */
  separator: RegExp;
  /** Whether a parsed value may be added; repeats of a value already shown are dropped anyway. */
  accept?: (token: string) => boolean;
  /** What makes two values the same, such as a tag's case-insensitive key. */
  keyOf?: (token: string) => string;
  maxItems?: number;
  maxLength?: number;
  placeholder?: string;
  labelledBy?: string;
  describedBy?: string;
  disabled?: boolean;
  mono?: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
  'data-testid'?: string;
};

/**
 * Enter, a separator, or leaving the box adds what was typed; pasting a list adds each value; and
 * Backspace in the empty box removes the last one. The draft is the caller's, so a form can save
 * what is still being typed.
 */
export function TokenInput({
  id,
  value,
  onChange,
  parse,
  separator,
  accept = () => true,
  keyOf = (token) => token,
  maxItems = Number.POSITIVE_INFINITY,
  maxLength,
  placeholder,
  labelledBy,
  describedBy,
  disabled = false,
  mono = false,
  draft,
  onDraftChange,
  'data-testid': testId,
}: TokenInputProps) {
  const room = Math.max(0, maxItems - value.length);

  const add = (raw: string) => {
    onDraftChange('');
    const added = addTokens(value, parse(raw), { accept, keyOf, maxItems, maxLength });
    if (added.length > value.length) onChange(added);
  };

  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring',
        disabled && 'opacity-50',
      )}
    >
      {value.map((token) => (
        <TokenChip
          key={keyOf(token)}
          label={token}
          mono={mono}
          disabled={disabled}
          onRemove={() => onChange(value.filter((item) => item !== token))}
        />
      ))}
      <input
        id={id}
        data-testid={testId}
        value={draft}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled || room === 0}
        onChange={(event) => {
          const next = event.target.value;
          if (separator.test(next)) add(next);
          else onDraftChange(next);
        }}
        onKeyDown={(event) => {
          // An IME composing CJK text uses Enter to pick a candidate, not to add the tag.
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            add(draft);
          } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

/** `value` plus each new token that passes, in typed order, without repeats or past the cap. */
export function addTokens(
  value: readonly string[],
  tokens: readonly string[],
  {
    accept = () => true,
    keyOf = (token) => token,
    maxItems = Number.POSITIVE_INFINITY,
    maxLength,
  }: {
    accept?: (token: string) => boolean;
    keyOf?: (token: string) => string;
    maxItems?: number;
    maxLength?: number;
  },
): string[] {
  const next = [...value];
  const seen = new Set(value.map(keyOf));
  for (const token of tokens) {
    if (next.length >= maxItems) break;
    const key = keyOf(token);
    if (seen.has(key) || !accept(token)) continue;
    if (maxLength !== undefined && token.length > maxLength) continue;
    seen.add(key);
    next.push(token);
  }
  return next;
}

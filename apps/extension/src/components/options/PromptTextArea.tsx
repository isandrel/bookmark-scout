/**
 * The prompt editor's text box. Typing `{{` lists the task's placeholders with what each means and
 * the value it has now; Arrow keys move, Enter or Tab inserts, Escape closes, and a click inserts.
 * The list follows the ARIA listbox pattern on the text box itself (`aria-autocomplete`,
 * `aria-controls`, `aria-activedescendant`), so focus stays in the text: Base UI's Autocomplete and
 * Combobox fill one value per input and cannot insert a token in the middle of a text.
 */
import {
  type Ref,
  type TextareaHTMLAttributes,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/** `{{` and the name typed so far, right before the caret; `\{{` is literal braces. */
const TYPED_PLACEHOLDER = /(?<!\\)\{\{(\w*)$/;

/** Longest current value shown beside a placeholder in the list. */
const VALUE_PREVIEW_LENGTH = 60;

type PromptTextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange' | 'ref'
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** The placeholders the task fills in, in list order. */
  variables: readonly PromptVariable[];
  /** Their current values, shown beside each one. */
  values: PromptVariables;
  textRef: Ref<HTMLTextAreaElement> & { current: HTMLTextAreaElement | null };
};

function valuePreview(value: PromptVariables[string]): string {
  const text = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) return t('prompt_valueEmpty');
  return t('prompt_valueNow', truncateText(line, VALUE_PREVIEW_LENGTH));
}

export function PromptTextArea({
  value,
  onValueChange,
  variables,
  values,
  textRef,
  onKeyDown,
  ...props
}: PromptTextAreaProps) {
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  // Escape hides the list until the text or caret moves on.
  const [dismissedAt, setDismissedAt] = useState<number>();
  // Where the caret goes once an inserted placeholder is in the text. Placed in the same commit as
  // the new value, before the next key arrives: a caret placed on a later frame moved keys typed
  // right after the insertion back into the middle of the text.
  const caretAfterInsert = useRef<number | null>(null);
  useLayoutEffect(() => {
    const position = caretAfterInsert.current;
    if (position === null) return;
    caretAfterInsert.current = null;
    textRef.current?.focus();
    textRef.current?.setSelectionRange(position, position);
  });

  const typed = value.slice(0, caret).match(TYPED_PLACEHOLDER);
  const query = typed?.[1].toLowerCase() ?? '';
  const matches = typed
    ? variables.filter((variable) => variable.name.toLowerCase().startsWith(query))
    : [];
  const open = matches.length > 0 && dismissedAt !== caret;
  const activeIndex = Math.min(active, matches.length - 1);

  const trackCaret = (field: HTMLTextAreaElement) => {
    setCaret(field.selectionStart ?? field.value.length);
  };

  const insert = (name: string) => {
    if (!typed) return;
    const start = caret - typed[0].length;
    // Typing `{{` may already have added the closing braces after the caret.
    const after = value.slice(caret).replace(/^\w*\}\}/, '');
    const token = `{{${name}}}`;
    onValueChange(value.slice(0, start) + token + after);
    const position = start + token.length;
    setCaret(position);
    setActive(0);
    caretAfterInsert.current = position;
  };

  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <div className="space-y-1">
      <textarea
        {...props}
        ref={textRef}
        value={value}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        onChange={(event) => {
          onValueChange(event.target.value);
          trackCaret(event.target);
          setActive(0);
        }}
        onSelect={(event) => trackCaret(event.currentTarget)}
        onKeyDown={(event) => {
          if (open) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setActive((activeIndex + step + matches.length) % matches.length);
              return;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              insert(matches[activeIndex].name);
              return;
            }
            if (event.key === 'Escape') {
              // Closes the list, not the dialog.
              event.preventDefault();
              event.stopPropagation();
              setDismissedAt(caret);
              return;
            }
          }
          onKeyDown?.(event);
        }}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={t('prompt_placeholders')}
          data-testid="prompt-placeholder-list"
          className="max-h-56 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((variable, index) => (
            <div
              key={variable.name}
              id={optionId(index)}
              role="option"
              tabIndex={-1}
              aria-selected={index === activeIndex}
              // Keeps focus (and the caret) in the text box, which handles the keys.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(variable.name)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') insert(variable.name);
              }}
              className="cursor-pointer rounded-sm px-2 py-1.5 text-xs aria-selected:bg-accent aria-selected:text-accent-foreground"
            >
              <span className="font-mono">{`{{${variable.name}}}`}</span>
              <span className="block text-muted-foreground">{t(variable.descriptionKey)}</span>
              <span className="block truncate text-muted-foreground">
                {valuePreview(values[variable.name])}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

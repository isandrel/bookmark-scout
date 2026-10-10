/**
 * Editors for list settings, so nobody has to type a comma-separated list: query parameter names
 * as removable chips with one-click suggestions, and HTTP status codes as a checklist of the
 * common codes plus any other code.
 */

import { Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { z } from 'zod';

const listSettingsConfig = readConfig(
  'ui/list-settings',
  z.strictObject({
    suggestions: z.strictObject({
      urlCleanerPreserveParams: z.array(z.string().min(1)),
      urlCleanerRemoveParams: z.array(z.string().min(1)),
      privacyScannerSensitiveParams: z.array(z.string().min(1)),
    }),
    status_codes: z.array(z.strictObject({ code: httpStatusCodeSchema, reason: z.string().min(1) })),
  }),
);

/** List settings of names, each with its suggestions. */
export type TokenListSetting = keyof typeof listSettingsConfig.suggestions;

export function isTokenListSetting(fieldKey: string): fieldKey is TokenListSetting {
  return fieldKey in listSettingsConfig.suggestions;
}

/** The checklist's codes by class (2xx, 3xx, 4xx), in configured order. */
const STATUS_GROUPS = [
  ...listSettingsConfig.status_codes
    .reduce((groups, status) => {
      const group = `${Math.floor(status.code / 100)}xx`;
      groups.set(group, [...(groups.get(group) ?? []), status]);
      return groups;
    }, new Map<string, typeof listSettingsConfig.status_codes>())
    .entries(),
];

const STATUS_GROUP_LABEL_KEYS: Readonly<Record<string, string>> = {
  '2xx': 'settings_statusGroup2xx',
  '3xx': 'settings_statusGroup3xx',
  '4xx': 'settings_statusGroup4xx',
};

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      data-slot="list-chip"
      className="inline-flex h-7 items-center gap-1 rounded-full border bg-muted/50 pl-2.5 pr-1 font-mono text-xs"
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('settings_listRemove', label)}
        className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </span>
  );
}

type EditorProps<T> = {
  id: string;
  labelledBy: string;
  describedBy?: string;
  value: readonly T[];
  onChange: (value: T[]) => void;
};

/**
 * Names as chips. Enter, a comma, or a space adds what was typed, pasting a list adds each name,
 * and Backspace in the empty box removes the last one.
 */
export function TokenListEditor({
  id,
  labelledBy,
  describedBy,
  value,
  onChange,
  fieldKey,
}: EditorProps<string> & { fieldKey: TokenListSetting }) {
  const [draft, setDraft] = useState('');
  const suggestionsId = useId();
  const suggestions = listSettingsConfig.suggestions[fieldKey].filter(
    (name) => !value.includes(name),
  );

  const add = (raw: string) => {
    const added = parseListTokens(raw).filter((name) => !value.includes(name));
    if (added.length > 0) onChange([...value, ...added]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring">
        {value.map((name) => (
          <Chip
            key={name}
            label={name}
            onRemove={() => onChange(value.filter((item) => item !== name))}
          />
        ))}
        <input
          id={id}
          value={draft}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          placeholder={t('settings_listAddPlaceholder')}
          onChange={(event) => {
            const next = event.target.value;
            // A typed or pasted separator commits what came before it.
            if (/[\s,]/.test(next)) add(next);
            else setDraft(next);
          }}
          onKeyDown={(event) => {
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
      {suggestions.length > 0 && (
        <fieldset aria-labelledby={suggestionsId} className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0">
          <span id={suggestionsId} className="text-xs text-muted-foreground">
            {t('settings_listSuggestions')}
          </span>
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              data-slot="list-suggestion"
              onClick={() => onChange([...value, name])}
              aria-label={t('settings_listAddItem', name)}
              className="inline-flex h-6 items-center gap-0.5 rounded-full border border-dashed px-2 font-mono text-xs text-muted-foreground hover:border-solid hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus aria-hidden="true" className="size-3" />
              {name}
            </button>
          ))}
        </fieldset>
      )}
    </div>
  );
}

/**
 * HTTP status codes as a checklist of the common codes by class, plus any other code as a chip.
 * The last code cannot be cleared: the setting needs at least one.
 */
export function StatusCodeEditor({
  id,
  labelledBy,
  describedBy,
  value,
  onChange,
}: EditorProps<number>) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const errorId = `${id}-error`;
  const known = new Set(listSettingsConfig.status_codes.map(({ code }) => code));
  const others = value.filter((code) => !known.has(code));
  const sorted = (codes: number[]) => [...codes].sort((a, b) => a - b);
  const toggle = (code: number, on: boolean) =>
    onChange(sorted(on ? [...value, code] : value.filter((item) => item !== code)));

  const addOther = () => {
    const [code] = parseListSetting(draft, 'number') ?? [];
    if (code === undefined || !/^\d{3}$/.test(draft.trim())) {
      setError(t('settings_errorStatusCode'));
      return;
    }
    setError(null);
    setDraft('');
    if (!value.includes(code)) onChange(sorted([...value, code]));
  };

  return (
    <fieldset
      id={id}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="m-0 min-w-0 space-y-3 border-0 p-0"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {STATUS_GROUPS.map(([group, codes]) => (
          <fieldset key={group} className="m-0 min-w-0 space-y-1 border-0 p-0">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">
              {t(STATUS_GROUP_LABEL_KEYS[group] ?? group)}
            </legend>
            {(codes ?? []).map(({ code, reason }) => {
              const checked = value.includes(code);
              const controlId = `${id}-${code}`;
              return (
                <label
                  key={code}
                  htmlFor={controlId}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    id={controlId}
                    checked={checked}
                    // The setting needs at least one code.
                    disabled={checked && value.length === 1}
                    onCheckedChange={(next) => toggle(code, next === true)}
                  />
                  <span className="font-mono tabular-nums">{code}</span>
                  <span className="min-w-0 truncate text-muted-foreground">{reason}</span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">
          {t('settings_statusOther')}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {others.map((code) => (
            <Chip
              key={code}
              label={String(code)}
              onRemove={() => {
                if (value.length > 1) onChange(value.filter((item) => item !== code));
              }}
            />
          ))}
          <Input
            value={draft}
            inputMode="numeric"
            maxLength={3}
            aria-label={t('settings_statusOther')}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            placeholder={t('settings_statusAddPlaceholder')}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addOther();
              }
            }}
            className="h-8 w-24"
          />
          <Button type="button" variant="outline" size="sm" onClick={addOther}>
            {t('settings_listAdd')}
          </Button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-destructive-text">
            {error}
          </p>
        )}
      </div>
    </fieldset>
  );
}

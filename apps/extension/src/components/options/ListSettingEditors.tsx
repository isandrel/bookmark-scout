/**
 * Editors for list settings, so nobody has to type a comma-separated list: query parameter names
 * and site names as removable chips with one-click suggestions, HTTP status codes as a checklist
 * of the common codes plus any other code, and a list of fixed choices as a plain checklist.
 */

import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { z } from 'zod';
import { TokenChip, TokenInput } from '@/components/ui/token-input';

const listSettingsConfig = readConfig(
  'ui/list-settings',
  z.strictObject({
    suggestions: z.strictObject({
      urlCleanerPreserveParams: z.array(z.string().min(1)),
      urlCleanerRemoveParams: z.array(z.string().min(1)),
      privacyScannerSensitiveParams: z.array(z.string().min(1)),
      pageTextExcludedSites: z.array(z.string().min(1)),
      coversNeverCaptureSites: z.array(z.string().min(1)),
    }),
    status_codes: z.array(
      z.strictObject({ code: httpStatusCodeSchema, reason: z.string().min(1) }),
    ),
  }),
);

/** List settings of names, each with its suggestions. */
export type TokenListSetting = keyof typeof listSettingsConfig.suggestions;

export function isTokenListSetting(fieldKey: string): fieldKey is TokenListSetting {
  return fieldKey in listSettingsConfig.suggestions;
}

const queryParamToken = (raw: string) => (isQueryParamName(raw) ? raw : undefined);

/**
 * How each list reads what was typed: the entry it keeps, or undefined when it is not one, which
 * stays in the box with the message saying why. A site list takes a host name or a whole address
 * and keeps the site (`toTypedSiteName`).
 */
const TOKEN_PARSERS: Record<
  TokenListSetting,
  { parse: (raw: string) => string | undefined; invalidKey: string }
> = {
  urlCleanerPreserveParams: { parse: queryParamToken, invalidKey: 'settings_listInvalidParam' },
  urlCleanerRemoveParams: { parse: queryParamToken, invalidKey: 'settings_listInvalidParam' },
  privacyScannerSensitiveParams: {
    parse: queryParamToken,
    invalidKey: 'settings_listInvalidParam',
  },
  pageTextExcludedSites: { parse: toTypedSiteName, invalidKey: 'settings_listInvalidSite' },
  coversNeverCaptureSites: { parse: toTypedSiteName, invalidKey: 'settings_listInvalidSite' },
};

/** The checklist's codes by class (2xx, 3xx, 4xx), in configured order. */
const STATUS_GROUPS = [
  ...listSettingsConfig.status_codes
    .reduce((groups, status) => {
      const group = httpStatusClass(status.code);
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
  // What was typed but is no entry: kept in the box to fix, and named in the message under it.
  const [rejected, setRejected] = useState<string[]>([]);
  const suggestionsId = useId();
  const errorId = useId();
  const parser = TOKEN_PARSERS[fieldKey];
  // Settings sync, so lists are capped (config/settings/*.toml); a full list takes no more names.
  const { maxItems = Number.POSITIVE_INFINITY, maxLength } = getSettingsFieldMeta()[fieldKey];
  const room = Math.max(0, maxItems - value.length);
  const suggestions =
    room > 0
      ? listSettingsConfig.suggestions[fieldKey].filter((name) => !value.includes(name))
      : [];

  return (
    <div className="space-y-2">
      <TokenInput
        id={id}
        value={value}
        onChange={onChange}
        parse={(raw) => {
          const tokens = parseListTokens(raw);
          const invalid = tokens.filter((token) => parser.parse(token) === undefined);
          setRejected(invalid);
          // The input clears its draft before parsing; this puts the rejected text back.
          if (invalid.length > 0) setDraft(invalid.join(' '));
          return tokens.flatMap((token) => parser.parse(token) ?? []);
        }}
        separator={/[\s,]/}
        maxItems={maxItems}
        maxLength={maxLength}
        placeholder={t('settings_listAddPlaceholder')}
        labelledBy={labelledBy}
        describedBy={
          rejected.length > 0 ? [describedBy, errorId].filter(Boolean).join(' ') : describedBy
        }
        draft={draft}
        onDraftChange={(next) => {
          setDraft(next);
          if (next !== draft) setRejected([]);
        }}
        mono
      />
      {rejected.length > 0 && (
        <p id={errorId} role="alert" className="text-xs text-destructive-text">
          {t(parser.invalidKey, rejected.join(', '))}
        </p>
      )}
      {suggestions.length > 0 && (
        <fieldset
          aria-labelledby={suggestionsId}
          className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0"
        >
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
  // Settings sync, so the list is capped (config/settings/maintenance.toml).
  const full =
    value.length >=
    (getSettingsFieldMeta().deadLinksSuccessStatuses.maxItems ?? Number.POSITIVE_INFINITY);
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
                    // The setting needs at least one code, and holds a limited number.
                    disabled={checked ? value.length === 1 : full}
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
            <TokenChip
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
            disabled={full}
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
          <Button type="button" variant="outline" size="sm" onClick={addOther} disabled={full}>
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

/**
 * Some of a setting's fixed choices (`options` of its field meta, such as where the right-click
 * menu shows), as one checkbox each in their order. The last one cannot be cleared: the setting
 * needs at least one.
 */
export function ChoiceListEditor({
  id,
  labelledBy,
  describedBy,
  value,
  onChange,
  options,
}: EditorProps<string> & { options: NonNullable<SettingsFieldMeta['options']> }) {
  const choices = options.map((option) => String(option.value));
  const toggle = (choice: string, on: boolean) =>
    onChange(choices.filter((other) => (other === choice ? on : value.includes(other))));
  return (
    <fieldset
      id={id}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="m-0 flex min-w-0 flex-wrap gap-x-4 gap-y-1 border-0 p-0"
    >
      {options.map((option) => {
        const choice = String(option.value);
        const checked = value.includes(choice);
        const controlId = `${id}-${choice}`;
        return (
          <label
            key={choice}
            htmlFor={controlId}
            data-choice={choice}
            className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50"
          >
            <Checkbox
              id={controlId}
              checked={checked}
              disabled={checked && value.length === 1}
              onCheckedChange={(next) => toggle(choice, next === true)}
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}

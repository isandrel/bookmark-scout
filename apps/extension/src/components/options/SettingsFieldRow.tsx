/**
 * One labeled setting row on the Options page: control, description, inline error, and reset.
 */

import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

type SettingValue = Settings[keyof Settings];
type SelectOption = { value: string | number; label: string };

type SettingsFieldRowProps = {
  fieldKey: keyof Settings;
  value: SettingValue;
  error?: string;
  /** Replaces the configured options, e.g. models for the selected AI provider. */
  selectOptions?: SelectOption[];
  onChange: (value: SettingValue) => void;
  /** Reports input errors that never reach storage, such as an unparsable list. */
  onInputError: (message: string | undefined) => void;
};

export function getSettingControlId(fieldKey: keyof Settings) {
  return `setting-${fieldKey}`;
}

type ListSettingInputProps = {
  id: string;
  kind: 'string' | 'number';
  value: SettingValue;
  placeholder: string;
  describedBy: string;
  labelledBy: string;
  invalid: boolean;
  onChange: (value: SettingValue) => void;
  onInputError: (message: string | undefined) => void;
};

/** Keeps the raw text while typing so commas work; parses when the input is committed. */
function ListSettingInput({
  id,
  kind,
  value,
  placeholder,
  describedBy,
  labelledBy,
  invalid,
  onChange,
  onInputError,
}: ListSettingInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseListSetting(draft, kind);
    if (parsed === null) {
      onInputError(t('settings_errorStatusCodes'));
      return;
    }
    onInputError(undefined);
    setDraft(null);
    onChange(parsed as SettingValue);
  };

  return (
    <Input
      id={id}
      value={draft ?? formatListSetting(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className="w-full sm:w-[220px]"
      placeholder={placeholder}
    />
  );
}

export function SettingsFieldRow({
  fieldKey,
  value,
  error,
  selectOptions,
  onChange,
  onInputError,
}: SettingsFieldRowProps) {
  const meta = getSettingsFieldMeta()[fieldKey];
  const defaultValue = defaultSettings[fieldKey];
  const isChanged = JSON.stringify(value) !== JSON.stringify(defaultValue);
  const controlId = getSettingControlId(fieldKey);
  const labelId = `${controlId}-label`;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const describedBy = error ? `${descriptionId} ${errorId}` : descriptionId;

  const renderControl = () => {
    switch (meta.type) {
      case 'switch':
        return (
          <Switch
            id={controlId}
            checked={value as boolean}
            onCheckedChange={(checked) => onChange(checked)}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
          />
        );

      case 'select': {
        const options = [...(selectOptions ?? meta.options ?? [])];
        // Keep a value that is valid but not in the list (e.g. a detected model) visible.
        if (value !== '' && !options.some((option) => String(option.value) === String(value))) {
          options.unshift({ value: String(value), label: String(value) });
        }
        return (
          <Select
            value={String(value)}
            onValueChange={(next) => {
              const coerced = coerceSelectValue(fieldKey, next);
              if (coerced !== undefined) onChange(coerced);
            }}
          >
            <SelectTrigger
              id={controlId}
              aria-labelledby={labelId}
              aria-describedby={describedBy}
              aria-invalid={Boolean(error)}
              className="w-full sm:w-[220px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case 'number': {
        const numeric = value as number;
        const position = meta.unlimited ? toUnlimitedSliderValue(numeric) : numeric;
        const display =
          meta.unlimited && numeric === -1 ? t('settings_noLimit') : `${numeric}${meta.unit ?? ''}`;
        return (
          <div className="flex w-full items-center gap-3 sm:w-[240px]">
            <Slider
              id={controlId}
              value={[position]}
              onValueChange={([next]) =>
                onChange(meta.unlimited ? fromUnlimitedSliderValue(next) : next)
              }
              min={meta.unlimited ? 0 : meta.min}
              max={meta.max}
              step={meta.step}
              aria-labelledby={labelId}
              className="flex-1"
            />
            <span className="w-20 text-right text-sm text-muted-foreground" aria-hidden="true">
              {display}
            </span>
          </div>
        );
      }

      case 'text':
        if (meta.list) {
          return (
            <ListSettingInput
              id={controlId}
              kind={meta.list}
              value={value}
              placeholder={meta.label}
              describedBy={describedBy}
              labelledBy={labelId}
              invalid={Boolean(error)}
              onChange={onChange}
              onInputError={onInputError}
            />
          );
        }
        return (
          <Input
            id={controlId}
            value={String(value ?? '')}
            onChange={(event) => onChange(event.target.value)}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            aria-invalid={Boolean(error)}
            className="w-full sm:w-[220px]"
            placeholder={meta.label}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div
      data-setting={fieldKey}
      className={`flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 sm:flex-row sm:items-start sm:justify-between ${
        error
          ? 'border-destructive/60'
          : isChanged
            ? 'border-primary/50 bg-primary/5'
            : 'border-transparent hover:border-border'
      }`}
    >
      <div className="min-w-0 flex-1 space-y-1 sm:pr-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label id={labelId} htmlFor={controlId} className="text-base font-medium">
            {meta.label}
          </Label>
          {isChanged && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {t('settings_modified')}
            </span>
          )}
        </div>
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {meta.description}
        </p>
        {error && (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
        {renderControl()}
        {isChanged && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
            onClick={() => {
              onInputError(undefined);
              onChange(defaultValue);
            }}
            title={t('settings_resetToDefault')}
            aria-label={t('settings_resetFieldToDefault', meta.label)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

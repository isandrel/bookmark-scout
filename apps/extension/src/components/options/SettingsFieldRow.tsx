/**
 * One labeled setting row on the Options page: control, description, inline error, and reset.
 */

import { NumberField } from '@base-ui/react/number-field';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';

type SettingValue = Settings[keyof Settings];
type SelectOption = { value: string | number; label: string; group?: string; iconUrl?: string };

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

/**
 * The reset button's slot is always there, so a control never moves when its value returns to
 * the default and the button disappears; the pointer stays on the control.
 */
function ResetSlot({
  visible,
  label,
  onReset,
}: {
  visible: boolean;
  label: string;
  onReset: () => void;
}) {
  return (
    <span className="flex h-8 w-8 shrink-0">
      {visible && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={onReset}
          title={t('settings_resetToDefault')}
          aria-label={label}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </span>
  );
}

function ModifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      {t('settings_modified')}
    </span>
  );
}

const stepperButtonClass =
  'flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40';

/**
 * A number with − and + buttons. Typing works too: the value is clamped to the allowed range when
 * the field is committed. For "no limit" settings, an empty field means no limit.
 */
function NumberStepper({
  id,
  meta,
  value,
  labelledBy,
  describedBy,
  invalid,
  onChange,
}: {
  id: string;
  meta: SettingsFieldMeta;
  value: number;
  labelledBy: string;
  describedBy: string;
  invalid: boolean;
  onChange: (value: number) => void;
}) {
  const unlimited = meta.unlimited && value === -1;
  return (
    <div className="flex items-center gap-2">
      <NumberField.Root
        id={id}
        value={unlimited ? null : value}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        onValueChange={(next) => {
          if (next === null) {
            if (meta.unlimited) onChange(-1);
            return;
          }
          onChange(next);
        }}
      >
        <NumberField.Group className="flex h-8 items-center overflow-hidden rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
          <NumberField.Decrement
            className={stepperButtonClass}
            aria-label={t('settings_decrease', meta.label)}
          >
            <Minus className="h-3.5 w-3.5" />
          </NumberField.Decrement>
          <NumberField.Input
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            placeholder={meta.unlimited ? t('settings_noLimit') : undefined}
            className="h-full w-20 border-x border-input bg-transparent text-center text-sm tabular-nums outline-none placeholder:text-xs placeholder:text-muted-foreground"
          />
          <NumberField.Increment
            className={stepperButtonClass}
            aria-label={t('settings_increase', meta.label)}
          >
            <Plus className="h-3.5 w-3.5" />
          </NumberField.Increment>
        </NumberField.Group>
      </NumberField.Root>
      {meta.unit && (
        <span className="w-8 text-xs text-muted-foreground" aria-hidden="true">
          {getSettingUnitLabel(meta.unit)}
        </span>
      )}
    </div>
  );
}

type SettingsGroupRowProps = {
  group: SettingsFieldGroup;
  values: Settings;
  onChange: (fieldKey: keyof Settings, value: SettingValue) => void;
};

/** Related on/off settings as one checklist; each option still saves to its own setting. */
export function SettingsGroupRow({ group, values, onChange }: SettingsGroupRowProps) {
  const meta = getSettingsFieldMeta();
  const changed = group.fields.filter(
    (fieldKey) => values[fieldKey] !== defaultSettings[fieldKey],
  );
  const labelId = `setting-group-${group.id}-label`;

  return (
    <div
      data-setting-group={group.id}
      className={`flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors sm:flex-row sm:items-start sm:justify-between ${
        changed.length > 0 ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:border-border'
      }`}
    >
      <div className="min-w-0 flex-1 space-y-3 sm:pr-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span id={labelId} className="text-base font-medium">
              {group.label}
            </span>
            {changed.length > 0 && <ModifiedBadge />}
          </div>
          <p id={`${labelId}-description`} className="text-sm text-muted-foreground">
            {group.description}
          </p>
        </div>
        <fieldset
          aria-describedby={`${labelId}-description`}
          className="m-0 grid min-w-0 gap-2 border-0 p-0 sm:grid-cols-2"
        >
          <legend className="sr-only">{group.label}</legend>
          {group.fields.map((fieldKey) => {
            const controlId = getSettingControlId(fieldKey);
            return (
              <label
                key={fieldKey}
                htmlFor={controlId}
                data-setting={fieldKey}
                className="flex cursor-pointer items-start gap-2.5 rounded-md border border-transparent px-2 py-1.5 hover:border-border hover:bg-muted/50"
              >
                <Checkbox
                  id={controlId}
                  checked={values[fieldKey] as boolean}
                  onCheckedChange={(checked) => onChange(fieldKey, checked === true)}
                  aria-describedby={`${controlId}-description`}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{meta[fieldKey].label}</span>
                  <span
                    id={`${controlId}-description`}
                    className="block text-xs text-muted-foreground"
                  >
                    {meta[fieldKey].description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>
      <div className="flex justify-end sm:shrink-0">
        <ResetSlot
          visible={changed.length > 0}
          label={t('settings_resetFieldToDefault', group.label)}
          onReset={() => {
            for (const fieldKey of changed) onChange(fieldKey, defaultSettings[fieldKey]);
          }}
        />
      </div>
    </div>
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
  // Remounts the list input on reset so unsaved, invalid text does not outlive the reset.
  const [resetCount, setResetCount] = useState(0);

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
        if (meta.searchable) {
          return (
            <SearchableSelect
              id={controlId}
              aria-labelledby={labelId}
              aria-describedby={describedBy}
              aria-invalid={Boolean(error)}
              className="w-full sm:w-[220px]"
              value={String(value)}
              options={options.map((option) => ({
                value: String(option.value),
                label: option.label,
                group: option.group,
                iconUrl: option.iconUrl,
              }))}
              onValueChange={(next) => {
                const coerced = coerceSelectValue(fieldKey, next);
                if (coerced !== undefined) onChange(coerced);
              }}
              searchPlaceholder={t('select_searchPlaceholder')}
              emptyText={t('select_noMatches')}
            />
          );
        }
        return (
          <Select
            value={String(value)}
            onValueChange={(next) => {
              if (next === null) return;
              const coerced = coerceSelectValue(fieldKey, next);
              if (coerced !== undefined) onChange(coerced);
            }}
            items={options.map((option) => ({ value: String(option.value), label: option.label }))}
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
        if (meta.control !== 'slider') {
          return (
            <NumberStepper
              id={controlId}
              meta={meta}
              value={numeric}
              labelledBy={labelId}
              describedBy={describedBy}
              invalid={Boolean(error)}
              onChange={onChange}
            />
          );
        }
        const position = meta.unlimited ? toUnlimitedSliderValue(numeric) : numeric;
        const unit = meta.unit ? getSettingUnitLabel(meta.unit) : '';
        const display =
          meta.unlimited && numeric === -1 ? t('settings_noLimit') : `${numeric}${unit}`;
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
              aria-valuetext={display}
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
              key={resetCount}
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
          {isChanged && <ModifiedBadge />}
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
        <ResetSlot
          visible={isChanged || Boolean(error)}
          label={t('settings_resetFieldToDefault', meta.label)}
          onReset={() => {
            onInputError(undefined);
            setResetCount((count) => count + 1);
            onChange(defaultValue);
          }}
        />
      </div>
    </div>
  );
}

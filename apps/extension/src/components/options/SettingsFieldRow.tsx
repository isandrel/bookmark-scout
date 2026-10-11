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
  describedBy?: string;
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
export function ResetSlot({
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
 * the field is committed. For "no limit" settings, an empty field or -1 means no limit; the field
 * then lets a typed value outside the range through, so -1 reaches `commitNumberSetting` instead
 * of being clamped to the minimum.
 */
function NumberStepper({
  id,
  meta,
  value,
  labelledBy,
  describedBy,
  invalid,
  disabled,
  inline = false,
  onChange,
}: {
  id: string;
  meta: SettingsFieldMeta;
  value: number;
  labelledBy: string;
  describedBy?: string;
  invalid: boolean;
  disabled?: boolean;
  /** Inside a grouped row: sized to its content instead of the settings column. */
  inline?: boolean;
  onChange: (value: number) => void;
}) {
  const unlimited = meta.unlimited && value === -1;
  // Edited in the shown unit (seconds for a value stored in ms) and stored in the stored unit.
  const scale = meta.displayScale ?? 1;
  const shown =
    scale === 1
      ? meta
      : {
          ...meta,
          min: meta.min === undefined ? undefined : meta.min / scale,
          max: meta.max === undefined ? undefined : meta.max / scale,
          step: (meta.step ?? 1) / scale,
        };
  return (
    // In a settings row the stepper and its unit fill the same column width as a select, so
    // steppers, selects, and inputs on one page start at the same position, unit or not.
    <div className={cn('flex items-center gap-2', !inline && 'w-full sm:w-[220px]')}>
      <NumberField.Root
        id={id}
        disabled={disabled}
        value={unlimited ? null : value / scale}
        min={shown.min}
        max={shown.max}
        step={shown.step}
        allowOutOfRange={meta.unlimited}
        onValueChange={(next) => {
          const committed = commitNumberSetting(next, shown);
          if (committed === undefined) return;
          onChange(scale === 1 ? committed : Math.round(committed * scale));
        }}
      >
        <NumberField.Group className="flex h-8 items-center overflow-hidden rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring data-disabled:opacity-50">
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
      {(meta.unit || !inline) && (
        <span
          data-slot="setting-unit"
          className="min-w-0 flex-1 text-xs whitespace-nowrap text-muted-foreground"
          aria-hidden="true"
        >
          {meta.unit}
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
  const changed = group.fields.filter((fieldKey) => values[fieldKey] !== defaultSettings[fieldKey]);
  const labelId = `setting-group-${group.id}-label`;

  return (
    <div
      data-setting-group={group.id}
      className={`flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors sm:flex-row sm:items-start sm:justify-between ${
        changed.length > 0
          ? 'border-primary/50 bg-primary/5'
          : 'border-transparent hover:border-border'
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

type GroupRowProps = SettingsGroupRowProps & {
  /** The members shown on this page; others (unsupported in this browser) are left out. */
  visible: ReadonlySet<keyof Settings>;
};

/** The frame every grouped row shares: label, description, Modified badge, and reset. */
function GroupRowFrame({
  group,
  values,
  fields,
  onChange,
  aside,
  children,
}: {
  group: SettingsFieldGroup;
  values: Settings;
  fields: readonly (keyof Settings)[];
  onChange: (fieldKey: keyof Settings, value: SettingValue) => void;
  /** A control beside the label, such as the lead switch of a `switch` group. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const changed = fields.filter((fieldKey) => values[fieldKey] !== defaultSettings[fieldKey]);
  const labelId = `setting-group-${group.id}-label`;
  return (
    <div
      data-setting-group={group.id}
      className={`flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors sm:flex-row sm:items-start sm:justify-between ${
        changed.length > 0
          ? 'border-primary/50 bg-primary/5'
          : 'border-transparent hover:border-border'
      }`}
    >
      <div className="min-w-0 flex-1 space-y-3 sm:pr-4">
        <div className="flex items-start justify-between gap-3">
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
          {aside}
        </div>
        {children}
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

/** A number or a choice with its own small caption, for use inside a grouped row. */
function InlineSetting({
  fieldKey,
  value,
  disabled,
  bounds,
  onChange,
}: {
  fieldKey: keyof Settings;
  value: SettingValue;
  disabled?: boolean;
  /** Tighter limits than the setting's own, such as a minimum that may not pass its maximum. */
  bounds?: { min?: number; max?: number };
  onChange: (value: SettingValue) => void;
}) {
  const meta = { ...getSettingsFieldMeta()[fieldKey], ...bounds };
  const controlId = getSettingControlId(fieldKey);
  const captionId = `${controlId}-label`;
  const choices = (meta.options ?? []).map((option) => ({
    value: String(option.value),
    label: option.label,
  }));
  return (
    <div data-setting={fieldKey} className="space-y-1">
      <span id={captionId} className="block text-xs font-medium text-muted-foreground">
        {meta.label}
      </span>
      {meta.type === 'select' && fitsSegmentedControl(choices) ? (
        <SegmentedControl
          id={controlId}
          aria-labelledby={captionId}
          value={String(value)}
          disabled={disabled}
          options={choices}
          onValueChange={(next) => {
            const coerced = coerceSelectValue(fieldKey, next);
            if (coerced !== undefined) onChange(coerced);
          }}
        />
      ) : meta.type === 'select' ? (
        <Select
          value={String(value)}
          disabled={disabled}
          onValueChange={(next) => {
            if (next === null) return;
            const coerced = coerceSelectValue(fieldKey, next);
            if (coerced !== undefined) onChange(coerced);
          }}
          items={choices}
        >
          <SelectTrigger id={controlId} aria-labelledby={captionId} className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(meta.options ?? []).map((option) => (
              <SelectItem key={String(option.value)} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <NumberStepper
          id={controlId}
          meta={meta}
          value={value as number}
          labelledBy={captionId}
          invalid={false}
          disabled={disabled}
          inline
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** Each setting's limits from the range it belongs to: a minimum stays at or below its maximum. */
function rangeBounds(fieldKey: keyof Settings, values: Settings): { min?: number; max?: number } {
  for (const range of SETTING_RANGES) {
    const max = values[range.max] as number;
    if (fieldKey === range.min && max !== -1) return { max };
    if (fieldKey === range.max) return { min: values[range.min] as number };
  }
  return {};
}

/** Two numbers side by side, such as width and height, each still its own setting. */
export function SettingsPairRow({ group, values, visible, onChange }: GroupRowProps) {
  const fields = group.fields.filter((fieldKey) => visible.has(fieldKey));
  return (
    <GroupRowFrame group={group} values={values} fields={fields} onChange={onChange}>
      <div className="flex flex-wrap gap-4">
        {fields.map((fieldKey) => (
          <InlineSetting
            key={fieldKey}
            fieldKey={fieldKey}
            value={values[fieldKey]}
            bounds={rangeBounds(fieldKey, values)}
            onChange={(value) => onChange(fieldKey, value)}
          />
        ))}
      </div>
    </GroupRowFrame>
  );
}

/**
 * An on/off setting with what it controls: numbers and choices beside it, on/off options below
 * it. They are disabled while it is off but keep their values.
 */
export function SettingsSwitchRow({ group, values, visible, onChange }: GroupRowProps) {
  const fields = group.fields.filter((fieldKey) => visible.has(fieldKey));
  const [lead, ...rest] = fields;
  const meta = getSettingsFieldMeta();
  const on = values[lead] === true;
  const inline = rest.filter((fieldKey) => meta[fieldKey].type !== 'switch');
  const options = rest.filter((fieldKey) => meta[fieldKey].type === 'switch');
  const labelId = `setting-group-${group.id}-label`;
  return (
    <GroupRowFrame
      group={group}
      values={values}
      fields={fields}
      onChange={onChange}
      aside={
        <span data-setting={lead} className="shrink-0">
          <Switch
            id={getSettingControlId(lead)}
            checked={on}
            onCheckedChange={(checked) => onChange(lead, checked)}
            aria-labelledby={labelId}
            aria-describedby={`${labelId}-description`}
          />
        </span>
      }
    >
      {inline.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {inline.map((fieldKey) => (
            <InlineSetting
              key={fieldKey}
              fieldKey={fieldKey}
              value={values[fieldKey]}
              disabled={!on}
              onChange={(value) => onChange(fieldKey, value)}
            />
          ))}
        </div>
      )}
      {options.map((fieldKey) => {
        const controlId = getSettingControlId(fieldKey);
        return (
          <label
            key={fieldKey}
            htmlFor={controlId}
            data-setting={fieldKey}
            className="flex cursor-pointer items-start gap-2.5 rounded-md border border-transparent px-2 py-1.5 hover:border-border hover:bg-muted/50 has-disabled:cursor-default has-disabled:opacity-60"
          >
            <Checkbox
              id={controlId}
              checked={values[fieldKey] as boolean}
              disabled={!on}
              onCheckedChange={(checked) => onChange(fieldKey, checked === true)}
              aria-describedby={`${controlId}-description`}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{meta[fieldKey].label}</span>
              <span id={`${controlId}-description`} className="block text-xs text-muted-foreground">
                {meta[fieldKey].description}
              </span>
            </span>
          </label>
        );
      })}
    </GroupRowFrame>
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
  // Remounts the list input on reset so unsaved, invalid text does not outlive the reset.
  const [resetCount, setResetCount] = useState(0);

  const renderControl = ({
    id: controlId,
    'aria-labelledby': labelId,
    'aria-describedby': describedBy,
    'aria-invalid': invalid,
  }: FieldControlProps) => {
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
              aria-invalid={Boolean(invalid)}
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
        const choices = options.map((option) => ({
          value: String(option.value),
          label: option.label,
        }));
        if (fitsSegmentedControl(choices)) {
          return (
            <SegmentedControl
              id={controlId}
              aria-labelledby={labelId}
              aria-describedby={describedBy}
              className="w-full sm:w-auto sm:min-w-[220px]"
              value={String(value)}
              options={choices}
              onValueChange={(next) => {
                const coerced = coerceSelectValue(fieldKey, next);
                if (coerced !== undefined) onChange(coerced);
              }}
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
            items={choices}
          >
            <SelectTrigger
              id={controlId}
              aria-labelledby={labelId}
              aria-describedby={describedBy}
              aria-invalid={Boolean(invalid)}
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
              invalid={Boolean(invalid)}
              onChange={onChange}
            />
          );
        }
        const position = meta.unlimited ? toUnlimitedSliderValue(numeric) : numeric;
        const display =
          meta.unlimited && numeric === -1
            ? t('settings_noLimit')
            : meta.percent
              ? formatPercent(numeric)
              : `${numeric}${meta.unit ?? ''}`;
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

      case 'folder':
        return (
          <FolderSettingSelect
            id={controlId}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            aria-invalid={Boolean(invalid)}
            value={String(value ?? '')}
            onChange={(folderId) => onChange(folderId)}
          />
        );

      case 'text':
        if (meta.list === 'number') {
          return (
            <StatusCodeEditor
              id={controlId}
              labelledBy={labelId}
              describedBy={describedBy}
              value={value as number[]}
              onChange={onChange}
            />
          );
        }
        if (meta.list && isTokenListSetting(fieldKey)) {
          return (
            <TokenListEditor
              id={controlId}
              fieldKey={fieldKey}
              labelledBy={labelId}
              describedBy={describedBy}
              value={value as string[]}
              onChange={onChange}
            />
          );
        }
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
              invalid={Boolean(invalid)}
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
            aria-invalid={Boolean(invalid)}
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
      <Field
        id={getSettingControlId(fieldKey)}
        // List editors need the row's full width, so their control goes under the label.
        layout={meta.list ? 'settingWide' : 'setting'}
        label={meta.label}
        description={meta.description}
        error={error}
        badge={isChanged && <ModifiedBadge />}
        actions={
          <ResetSlot
            visible={isChanged || Boolean(error)}
            label={t('settings_resetFieldToDefault', meta.label)}
            onReset={() => {
              onInputError(undefined);
              setResetCount((count) => count + 1);
              onChange(defaultValue);
            }}
          />
        }
      >
        {renderControl}
      </Field>
    </div>
  );
}

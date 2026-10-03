/**
 * Pure helpers that convert between Options form controls and typed settings values.
 */

/**
 * Convert a select's string value to the setting's type. Returns undefined for values that must be
 * ignored, such as an empty string while options are (re)mounting.
 */
export function coerceSelectValue(
  key: keyof Settings,
  value: string,
): Settings[keyof Settings] | undefined {
  if (value === '') return undefined;
  if (typeof defaultSettings[key] !== 'number') return value as Settings[keyof Settings];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? (numeric as Settings[keyof Settings]) : undefined;
}

export function formatListSetting(value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}

/**
 * Parse a committed comma-separated list. Number lists return null when any entry is not a valid
 * HTTP status code so the caller can show an error instead of saving a partial list.
 */
export function parseListSetting(raw: string, kind: 'string'): string[];
export function parseListSetting(raw: string, kind: 'number'): number[] | null;
export function parseListSetting(
  raw: string,
  kind: 'string' | 'number',
): string[] | number[] | null;
export function parseListSetting(
  raw: string,
  kind: 'string' | 'number',
): string[] | number[] | null {
  const items = [
    ...new Set(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (kind === 'string') return items;

  const codes = items.map((item) => (/^\d+$/.test(item) ? Number(item) : Number.NaN));
  if (codes.length === 0) return null;
  return codes.every((code) => httpStatusCodeSchema.safeParse(code).success) ? codes : null;
}

/** Slider position for settings where -1 means "no limit" (shown at position 0). */
export function toUnlimitedSliderValue(value: number): number {
  return value === -1 ? 0 : value;
}

export function fromUnlimitedSliderValue(position: number): number {
  return position <= 0 ? -1 : position;
}

/**
 * The value a number field commits: out-of-range numbers snap to the nearest bound. For "no
 * limit" settings, an empty field and -1 both mean no limit and commit -1, as the descriptions
 * say. Returns undefined when there is nothing to commit (an empty field without a no-limit value).
 */
export function commitNumberSetting(
  value: number | null,
  {
    min = -Infinity,
    max = Infinity,
    unlimited = false,
  }: Pick<SettingsFieldMeta, 'min' | 'max' | 'unlimited'>,
): number | undefined {
  if (value === null || Number.isNaN(value)) return unlimited ? -1 : undefined;
  if (unlimited && value === -1) return -1;
  return Math.min(max, Math.max(min, value));
}

/**
 * Save errors without the fields whose form value is back to the saved one, such as after a
 * reset or retyping the saved text: nothing is left unsaved there. Returns `errors` itself when
 * nothing changes.
 */
export function dropSettledErrors(
  errors: SettingsFieldErrors,
  saved: Settings,
  values: Settings,
): SettingsFieldErrors {
  const settled = (Object.keys(errors) as (keyof Settings)[]).filter((key) =>
    isSameJson(values[key], saved[key]),
  );
  if (settled.length === 0) return errors;
  const next = { ...errors };
  for (const key of settled) delete next[key];
  return next;
}

/** Keys that changed between the last persisted settings and the form values. */
export function getChangedSettings(saved: Settings, values: Settings): Partial<Settings> {
  return Object.fromEntries(
    (Object.keys(values) as (keyof Settings)[])
      .filter((key) => !isSameJson(values[key], saved[key]))
      .map((key) => [key, values[key]]),
  ) as Partial<Settings>;
}

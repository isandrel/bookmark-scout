/**
 * Pure helpers that convert between Options form controls and typed settings values.
 */

/**
 * Convert a select's string value to the setting's type. Returns undefined for values that must be
 * ignored, such as the empty string Radix emits while options are (re)mounting.
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

/** Keys that changed between the last persisted settings and the form values. */
export function getChangedSettings(saved: Settings, values: Settings): Partial<Settings> {
  return Object.fromEntries(
    (Object.keys(values) as (keyof Settings)[])
      .filter((key) => JSON.stringify(values[key]) !== JSON.stringify(saved[key]))
      .map((key) => [key, values[key]]),
  ) as Partial<Settings>;
}

import { afterEach, describe, expect, it } from 'vitest';
import {
  formatDateSample,
  formatDateTime,
  formatDay,
  formatTime,
  setDateTimeFormat,
  setLanguage,
} from '@/hooks/use-i18n';
import { DATE_FORMAT_IDS, dateTimeFormatOptions, TIME_FORMAT_IDS } from '@/lib/date-formats';
// Hands the default formats to the date formatter, as every page does by reading settings.
import '@/lib/settings-schema';
import { readConfigToml } from '../config-files';

const SAMPLE = new Date(2026, 8, 24, 15, 5, 49);

afterEach(() => setLanguage('auto'));

describe('formatDateTime', () => {
  it('formats dates in the selected extension language', () => {
    setLanguage('ja');
    expect(formatDateTime(SAMPLE)).toBe('2026/9/24 15:05:49');
    // "As in my language" follows the browser's own date data (ICU and CLDR), which changes
    // between versions: Korean numeric dates are "2026. 9. 24." with the Node on CI and "2026/9/24"
    // with CLDR 49 (Node 26.12, ICU 79), and Chrome and Firefox versions differ the same way.
    // So the expectation is built as the app builds it, and checked to be Korean, year first.
    setLanguage('ko');
    const korean = formatDateTime(SAMPLE.getTime());
    expect(korean).toBe(
      new Intl.DateTimeFormat('ko', dateTimeFormatOptions('dateTime').options).format(SAMPLE),
    );
    expect(korean).toMatch(/^2026\D+9\D+24\D.*오후 3:05:49$/);
    setLanguage('en');
    expect(formatDateTime(SAMPLE)).toBe('9/24/2026, 3:05:49 PM');
  });
});

describe('Dates and Times settings', () => {
  afterEach(() => setDateTimeFormat('auto', 'auto'));

  it('shows dates and times in the chosen formats, in every place at once', () => {
    setLanguage('en');
    setDateTimeFormat('iso', 'hours24');
    expect(formatDateTime(SAMPLE)).toBe('2026-09-24 15:05:49');
    // Before 10 in the morning too: the 24-hour clock writes two digits (CI failed at 05:51).
    expect(formatDateTime(new Date(2026, 8, 24, 5, 7, 9))).toBe('2026-09-24 05:07:09');
    expect(formatDay(SAMPLE)).toBe('2026-09-24');
    expect(formatTime(SAMPLE)).toBe('15:05');

    setDateTimeFormat('long', 'hours12');
    expect(formatDay(SAMPLE)).toBe('September 24, 2026');
    expect(formatTime(SAMPLE)).toBe('3:05 PM');

    setLanguage('ja');
    setDateTimeFormat('auto', 'hours12');
    expect(formatTime(SAMPLE)).toMatch(/午後3:05/);
  });

  it('labels each choice with a sample, and offers every format in the config', () => {
    setLanguage('en');
    expect(formatDateSample('date', 'iso')).toBe('2026-03-14');
    expect(formatDateSample('time', 'hours24')).toBe('15:09');
    expect(DATE_FORMAT_IDS).toEqual(
      Object.keys(readConfigToml('ui/date-formats.toml').date_formats),
    );
    expect(TIME_FORMAT_IDS).toEqual(
      Object.keys(readConfigToml('ui/date-formats.toml').time_formats),
    );
  });
});

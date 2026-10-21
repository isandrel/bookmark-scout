/** Unit conversions, named so `ms / MS_PER_SECOND` reads as what it means. */

export const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
export const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;
export const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR;
export const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY;

/** Kilobytes are binary here, matching how sizes are shown (`formatKilobytes`). */
export const BYTES_PER_KB = 1024;

/** A whole in percent: `fraction * PERCENT` is a percentage. */
export const PERCENT = 100;

/** Base 16, and the two hex digits that write one byte. */
export const HEX_RADIX = 16;
export const HEX_DIGITS_PER_BYTE = 2;

/** One byte as two hex digits, as in `%2F` or a hex token. */
export function byteToHex(byte: number): string {
  return byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, '0');
}

/** The highest Unicode code point. */
export const MAX_CODE_POINT = 0x10ffff;

/** The highest value one byte holds. */
export const BYTE_MAX = 0xff;

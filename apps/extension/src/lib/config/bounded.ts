/**
 * A tunable number and the range it must stay in, written together in TOML as
 * `{ value = 3, min = 0, max = 8 }`, so no bound is typed in code. Readers get the value.
 */
import { z } from 'zod';

export function boundedNumber({ integer }: { integer: boolean }) {
  const number = integer ? z.number().int() : z.number();
  return z
    .strictObject({ value: number, min: number, max: number })
    .refine(
      ({ value, min, max }) => min <= max && value >= min && value <= max,
      'value must be between min and max',
    )
    .transform(({ value }) => value);
}

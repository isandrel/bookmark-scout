import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { z } from 'zod';

const segmentedConfig = readConfig(
  'ui/segmented-settings',
  z.strictObject({
    max_options: z.number().int().min(2),
    max_label_width: z.number().int().positive(),
  }),
);

type SegmentOption = { value: string; label: string };

// Wide characters (CJK, full-width forms) take about two Latin characters of space.
const WIDE_CHARACTER = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

function labelWidth(label: string): number {
  let width = 0;
  for (const character of label) width += WIDE_CHARACTER.test(character) ? 2 : 1;
  return width;
}

/**
 * True when a choice reads better as segments than as a dropdown: few options whose labels fit
 * side by side. Decided per language, so a choice whose labels run long in one language stays a
 * dropdown there.
 */
export function fitsSegmentedControl(options: readonly SegmentOption[]): boolean {
  return (
    options.length >= 2 &&
    options.length <= segmentedConfig.max_options &&
    options.reduce((total, option) => total + labelWidth(option.label), 0) <=
      segmentedConfig.max_label_width
  );
}

/**
 * A one-click choice among a few options: a radio group drawn as joined segments. With `wrap`,
 * segments keep their own width and flow onto more lines from the start, for a list of tabs that
 * may not fit one line (stretching wrapped segments left each line spaced differently).
 */
export function SegmentedControl({
  id,
  value,
  options,
  disabled,
  wrap = false,
  className,
  onValueChange,
  ...aria
}: {
  id?: string;
  value: string;
  options: readonly SegmentOption[];
  disabled?: boolean;
  wrap?: boolean;
  className?: string;
  onValueChange: (value: string) => void;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}) {
  return (
    <RadioGroup
      id={id}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange(String(next))}
      data-slot="segmented-control"
      className={cn(
        'inline-flex items-stretch gap-0.5 rounded-md border border-input bg-muted p-0.5 data-disabled:opacity-50',
        wrap ? 'flex-wrap justify-start' : 'h-8',
        className,
      )}
      {...aria}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={cn(
            'flex cursor-pointer items-center justify-center rounded-[5px] px-2.5 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-checked:bg-card data-checked:font-medium data-checked:text-foreground data-checked:shadow-sm data-disabled:cursor-not-allowed',
            wrap ? 'h-7 flex-none' : 'flex-auto',
          )}
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

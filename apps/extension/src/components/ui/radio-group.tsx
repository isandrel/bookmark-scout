import { Radio } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';

/** A group of radio buttons; lay its items out with `className`. */
export function RadioGroup({
  className,
  ...props
}: Omit<RadioGroupPrimitive.Props, 'className'> & { className?: string }) {
  return <RadioGroupPrimitive data-slot="radio-group" className={className} {...props} />;
}

/** One 16px radio button, the same size and colors as `Checkbox`. */
export function RadioGroupItem({
  className,
  ...props
}: Omit<Radio.Root.Props, 'className'> & { className?: string }) {
  return (
    <Radio.Root
      data-slot="radio-group-item"
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <Radio.Indicator className="size-2 rounded-full bg-primary" />
    </Radio.Root>
  );
}

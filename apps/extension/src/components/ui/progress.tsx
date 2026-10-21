import { Progress as ProgressPrimitive } from '@base-ui/react/progress';

/**
 * A determinate progress bar (an ARIA progressbar) for work with a known total. Leave it out
 * while the total is unknown rather than showing a made-up share.
 */
export function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  /** The accessible name, such as the task it measures. */
  label: string;
  className?: string;
}) {
  return (
    <ProgressPrimitive.Root
      value={value}
      max={max}
      aria-label={label}
      data-slot="progress"
      className={cn('w-full', className)}
    >
      <ProgressPrimitive.Track className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <ProgressPrimitive.Indicator className="h-full bg-primary transition-[width] motion-reduce:transition-none" />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

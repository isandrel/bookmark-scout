import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

type RootProps = SliderPrimitive.Root.Props<readonly number[]>

// Array values only, like the Radix slider this wrapper replaced.
type SliderProps = Omit<RootProps, "className"> & {
  className?: string
}

/**
 * Base UI passes a single-thumb slider's value as a plain number when it changes by pointer
 * (drag or track click) but as an array when it changes by keyboard, so callers that read
 * `([next]) =>` threw on every drag. Callers always get an array.
 */
function asArray(value: number | readonly number[]): readonly number[] {
  return typeof value === "number" ? [value] : value
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-valuetext': ariaValueText, onValueChange, onValueCommitted, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    thumbAlignment="edge"
    className={className}
    {...props}
    onValueChange={
      onValueChange &&
      ((value, details) => onValueChange(asArray(value as number | readonly number[]), details))
    }
    onValueCommitted={
      onValueCommitted &&
      ((value, details) => onValueCommitted(asArray(value as number | readonly number[]), details))
    }
  >
    <SliderPrimitive.Control className="relative flex w-full touch-none select-none items-center">
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Indicator className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {/* The thumb's range input carries the slider role, so it needs the accessible name. */}
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-valuetext={ariaValueText}
        className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-disabled:pointer-events-none data-disabled:opacity-50" />
    </SliderPrimitive.Control>
  </SliderPrimitive.Root>
))
Slider.displayName = "Slider"

export { Slider }

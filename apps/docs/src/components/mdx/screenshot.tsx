import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import {
  SCREENSHOT_SIZE,
  SCREENSHOTS,
  type ScreenshotName,
} from "@/lib/screenshots";

/** A store screenshot that follows the docs theme and zooms on click. */
export function Screenshot({ name }: { name: ScreenshotName }) {
  const shot = SCREENSHOTS[name];

  return (
    <figure className="not-prose my-6 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <ImageZoom
        src={shot.light}
        alt={shot.alt}
        {...SCREENSHOT_SIZE}
        className="block h-auto w-full dark:hidden"
      />
      <ImageZoom
        src={shot.dark}
        alt={shot.alt}
        {...SCREENSHOT_SIZE}
        className="hidden h-auto w-full dark:block"
      />
    </figure>
  );
}

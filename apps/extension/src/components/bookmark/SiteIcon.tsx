import { Globe } from 'lucide-react';
import { useState } from 'react';

type SiteIconProps = {
  url: string;
  /** Displayed size in CSS pixels. */
  size?: number;
  className?: string;
};

/**
 * A bookmark's site icon: the icon saved by Refresh Site Icons, then the browser's icon cache,
 * then a generic globe (also used when an image fails to load). The image is requested at twice
 * the displayed size for high-density screens.
 */
export function SiteIcon({ url, size = 16, className }: SiteIconProps) {
  const src = useSiteIconUrl(url, size * 2);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <Globe
        aria-hidden="true"
        data-icon-source="fallback"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn('text-muted-foreground', className)}
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      data-icon-source={src.startsWith('data:') ? 'saved' : 'browser'}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}

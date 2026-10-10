import { ChevronRight } from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';

/**
 * A section's technical settings, closed by default. The button names what is inside, so
 * nothing is hidden without saying so. `forceOpen` (a search match, or a value already changed)
 * keeps it open.
 *
 * A button with `aria-expanded` rather than `<details>`: a controlled `<details>` froze Edge after
 * a setting inside it changed, and this needs no native toggle event to keep in step.
 */
export function SettingsAdvancedFold({
  labels,
  forceOpen,
  children,
}: {
  labels: readonly string[];
  forceOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(forceOpen);
  // Once opened for a search or a changed value, it stays open until closed: resetting the
  // value inside must not fold it away under the pointer.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  const isOpen = forceOpen || open;
  const regionId = useId();
  return (
    <div
      data-slot="settings-advanced"
      data-open={isOpen || undefined}
      className="rounded-lg border border-dashed"
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={regionId}
        onClick={() => setOpen(!isOpen)}
        className="flex w-full items-start gap-2 rounded-lg px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-90',
          )}
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {t('settings_advancedSettings', String(labels.length))}
          </span>
          {!isOpen && (
            <span className="block truncate text-xs text-muted-foreground">
              {formatList(labels)}
            </span>
          )}
        </span>
      </button>
      {isOpen && (
        <div id={regionId} className="space-y-3 px-2 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

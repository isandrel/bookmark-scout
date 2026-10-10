import { ChevronRight } from 'lucide-react';
import { type ReactNode, useState } from 'react';

/**
 * A section's technical settings, closed by default. The summary names what is inside, so
 * nothing is hidden without saying so. `forceOpen` (a search match, or a value already changed)
 * keeps it open.
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
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  return (
    <details
      data-slot="settings-advanced"
      open={isOpen}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group rounded-lg border border-dashed"
    >
      <summary className="flex cursor-pointer list-none items-start gap-2 rounded-lg px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
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
      </summary>
      <div className="space-y-3 px-2 pb-2">{children}</div>
    </details>
  );
}

/**
 * More about one setting, in a toggletip beside its label: a button that opens and closes it on
 * click, Enter, or Space, and closes on Escape or a click elsewhere, so it works by keyboard,
 * touch, and screen reader (WCAG 1.4.13), unlike a hover-only tooltip. Plain text only; what a
 * user must know stays in the description under the label.
 */
import { Info } from 'lucide-react';

export function SettingHelp({ label, help }: { label: string; help: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('settings_helpFor', label)}
            className="text-muted-foreground"
            data-testid="setting-help"
          />
        }
      >
        <Info className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent side="top" className="text-sm" data-testid="setting-help-text">
        {help}
      </PopoverContent>
    </Popover>
  );
}

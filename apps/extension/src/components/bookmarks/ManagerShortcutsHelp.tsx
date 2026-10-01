/**
 * Keyboard shortcuts help for the bookmark manager: a header button and the dialog it opens.
 * `?` opens the same dialog through `useManagerShortcuts`.
 */

import { Keyboard } from 'lucide-react';

type ManagerShortcutsHelpProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Key names are shown as printed on keyboards, so they are not translated.
const SHORTCUT_ROWS: { keys: string[][]; label: () => string }[] = [
  { keys: [['/']], label: () => t('shortcuts_focusFilter') },
  { keys: [['Alt', '↑'], ['Backspace']], label: () => t('shortcuts_parentFolder') },
  { keys: [['j'], ['k']], label: () => t('shortcuts_nextPreviousRow') },
  { keys: [['Enter']], label: () => t('shortcuts_openFolder') },
  { keys: [['?']], label: () => t('shortcuts_showHelp') },
  { keys: [['Esc']], label: () => t('shortcuts_closeDialog') },
];

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key, index) => (
        <span key={key} className="inline-flex items-center gap-1">
          {index > 0 && <span aria-hidden="true">+</span>}
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{key}</kbd>
        </span>
      ))}
    </span>
  );
}

export function ManagerShortcutsHelp({ open, onOpenChange }: ManagerShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto shrink-0"
            aria-label={t('shortcuts_title')}
            aria-keyshortcuts="?"
            title={t('shortcuts_buttonTitle')}
          />
        }
      >
        <Keyboard className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('shortcuts_title')}</DialogTitle>
          <DialogDescription>{t('shortcuts_pausedWhileTyping')}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 text-sm">
          {SHORTCUT_ROWS.map(({ keys, label }) => (
            <div key={label()} className="contents">
              <dt className="flex flex-wrap items-center gap-1.5">
                {keys.map((combo, index) => (
                  <span key={combo.join('+')} className="inline-flex items-center gap-1.5">
                    {index > 0 && (
                      <span className="text-xs text-muted-foreground">{t('shortcuts_or')}</span>
                    )}
                    <KeyCombo keys={combo} />
                  </span>
                ))}
              </dt>
              <dd>{label()}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Keyboard shortcuts help for the bookmark manager: a header button and the dialog it opens.
 * `?` opens the same dialog through `useManagerShortcuts`. Rows are drawn from the binding
 * tables, so the help always names the configured keys.
 */

import { Keyboard } from 'lucide-react';

type ManagerShortcutsHelpProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const { manager } = SHORTCUT_BINDINGS;

/** One row per action; a row lists each binding that triggers it. */
const SHORTCUT_ROWS: readonly { bindings: readonly ShortcutBinding[]; label: MessageKey }[] = [
  { bindings: manager.focusFilter, label: 'shortcuts_focusFilter' },
  { bindings: manager.parentFolder, label: 'shortcuts_parentFolder' },
  { bindings: [...manager.nextRow, ...manager.previousRow], label: 'shortcuts_nextPreviousRow' },
  // Folder rows open with Enter like any button, and Escape closes any dialog or menu; neither
  // is configurable.
  { bindings: [{ key: 'Enter' }], label: 'shortcuts_openFolder' },
  { bindings: manager.openSavedSearches, label: 'shortcuts_openSavedSearches' },
  { bindings: manager.showHelp, label: 'shortcuts_showHelp' },
  { bindings: [{ key: 'Escape' }], label: 'shortcuts_closeDialog' },
];

function KeyCombo({ binding }: { binding: ShortcutBinding }) {
  return (
    <span className="inline-flex items-center gap-1">
      {shortcutKeyCaps(binding).map((key, index) => (
        <span key={key} className="inline-flex items-center gap-1">
          {index > 0 && <span aria-hidden="true">+</span>}
          <Kbd>{key}</Kbd>
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
            aria-keyshortcuts={ariaKeyShortcuts(manager.showHelp)}
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
          {SHORTCUT_ROWS.map(({ bindings, label }) => (
            <div key={label} className="contents">
              <dt className="flex flex-wrap items-center gap-1.5">
                {bindings.map((binding, index) => (
                  <span
                    key={ariaKeyShortcuts([binding])}
                    className="inline-flex items-center gap-1.5"
                  >
                    {index > 0 && (
                      <span className="text-xs text-muted-foreground">{t('shortcuts_or')}</span>
                    )}
                    <KeyCombo binding={binding} />
                  </span>
                ))}
              </dt>
              <dd>{t(label)}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

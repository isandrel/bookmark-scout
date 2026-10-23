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
  { bindings: manager.focusFilter, label: 'managerDefaults_focusSearch' },
  { bindings: manager.parentFolder, label: 'shortcuts_parentFolder' },
  // The table's rows follow the grid keyboard pattern; these keys are not configurable.
  {
    bindings: [{ key: 'ArrowDown' }, { key: 'ArrowUp' }, { key: 'Home' }, { key: 'End' }],
    label: 'shortcuts_moveRowFocus',
  },
  { bindings: [...manager.nextRow, ...manager.previousRow], label: 'shortcuts_nextPreviousRow' },
  { bindings: [{ key: ' ' }], label: 'shortcuts_toggleRow' },
  { bindings: manager.preview, label: 'shortcuts_preview' },
  {
    bindings: [
      ...SHORTCUT_BINDINGS.managerPreview.previous,
      ...SHORTCUT_BINDINGS.managerPreview.next,
    ],
    label: 'shortcuts_previewPreviousNext',
  },
  { bindings: manager.selectAll, label: 'shortcuts_selectAll' },
  { bindings: manager.clearSelection, label: 'shortcuts_clearSelection' },
  { bindings: manager.open, label: 'shortcuts_open' },
  { bindings: manager.openInNewTabs, label: 'shortcuts_openInNewTabs' },
  { bindings: manager.openInNewWindow, label: 'shortcuts_openInNewWindow' },
  { bindings: manager.rename, label: 'shortcuts_rename' },
  { bindings: manager.delete, label: 'shortcuts_deleteSelection' },
  { bindings: manager.undo, label: 'shortcuts_undo' },
  { bindings: manager.redo, label: 'shortcuts_redo' },
  // The browser's own copy, cut, and paste keys, read from its clipboard events.
  { bindings: SHORTCUT_BINDINGS.managerClipboard.copy, label: 'shortcuts_copy' },
  { bindings: SHORTCUT_BINDINGS.managerClipboard.cut, label: 'shortcuts_cut' },
  { bindings: SHORTCUT_BINDINGS.managerClipboard.paste, label: 'shortcuts_paste' },
  { bindings: manager.openSavedSearches, label: 'shortcuts_openSavedSearches' },
  { bindings: manager.showHelp, label: 'shortcuts_showHelp' },
  // Escape closes any dialog or menu; not configurable.
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
            className="ml-auto hidden shrink-0 sm:inline-flex"
            aria-label={t('shortcuts_title')}
            aria-keyshortcuts={ariaKeyShortcuts(manager.showHelp)}
            title={t('shortcuts_buttonTitle')}
          />
        }
      >
        <Keyboard className="h-4 w-4" />
      </DialogTrigger>
      {/* Many rows: wider than other dialogs, and it scrolls on short windows. */}
      <DialogContent className="max-h-dialog-screen overflow-y-auto sm:max-w-xl">
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

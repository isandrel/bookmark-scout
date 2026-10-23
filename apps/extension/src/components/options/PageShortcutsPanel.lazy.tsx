/**
 * Options > Behavior > Manager and popup shortcuts: one row per in-page shortcut the user can
 * change (`REMAPPABLE_SHORTCUT_IDS`), by section, with its keys as key caps. **Change** turns the
 * row into a recorder: press the new keys and they are saved at once (`pageShortcutOverrides`),
 * unless `checkShortcutKeys` refuses them, which the row explains (another shortcut has them, the
 * browser keeps them, or the popup leaves Ctrl and Cmd to the browser). Esc cancels, and Tab moves
 * on as usual, so the recorder never traps the keyboard. Reset gives one shortcut its configured
 * keys back, and Reset all every shortcut. The browser's own command shortcuts are in
 * `ShortcutsPanel`, since the browser owns their keys.
 */
import { Keyboard, RotateCcw } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useId, useRef, useState } from 'react';

const PANEL_ID = 'page-shortcuts';

/** The heading of each section's list. */
const SECTION_LABEL_KEYS = {
  manager: 'settings_pageShortcutsManager',
  popup: 'settings_pageShortcutsPopup',
} as const satisfies Record<PageShortcutSection, MessageKey>;

const SECTIONS = Object.keys(SECTION_LABEL_KEYS) as PageShortcutSection[];

const shortcutLabel = (id: PageShortcutId) => t(PAGE_SHORTCUT_LABEL_KEYS[id]);

const keysText = (bindings: readonly ShortcutBinding[]) =>
  bindings.map((binding) => shortcutKeyCaps(binding).join('+')).join(` ${t('shortcuts_or')} `);

/** Why the keys were refused, in the reader's words. */
function describeProblem(problem: ShortcutKeysProblem, binding: ShortcutBinding | null): string {
  switch (problem.kind) {
    case 'noModifierHere':
      return t('settings_pageShortcutNoModifier', shortcutKeyCaps({ key: '', mod: true })[0]);
    case 'needsNamedKey':
      return t('settings_pageShortcutNeedsNamedKey');
    case 'reserved':
      return t('settings_pageShortcutReserved', binding ? keysText([binding]) : '');
    case 'inUse':
      return t('settings_shortcutInUse', shortcutLabel(problem.by));
  }
}

/** A key press the recorder cannot use, in the reader's words. */
function describeInvalid(problem: 'unsupportedKey' | 'otherModifier'): string {
  if (problem === 'unsupportedKey') return t('settings_shortcutUnsupportedKey');
  return t(
    isApplePlatform() ? 'settings_pageShortcutControlOnMac' : 'settings_pageShortcutMetaKey',
  );
}

/** A save that failed says so; settings save without a word otherwise. */
function notifyNotSaved(error: unknown): void {
  toast.error({
    title: tPlural('settings_statusNotSaved', 1),
    description: getErrorMessage(error),
  });
}

type RowProps = {
  id: PageShortcutId;
  overrides: PageShortcutOverrides;
  save: (next: PageShortcutOverrides) => Promise<void>;
};

function PageShortcutRow({ id, overrides, save }: RowProps) {
  const label = shortcutLabel(id);
  const errorId = useId();
  const changeRef = useRef<HTMLButtonElement>(null);
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<ShortcutBinding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const keys = getPageShortcutKeys(id, overrides);
  const changed = overrides[id] !== undefined;

  const stopRecording = () => {
    setRecording(false);
    setHeld(null);
  };

  const apply = (next: PageShortcutOverrides, shown: readonly ShortcutBinding[]) => {
    stopRecording();
    setError(null);
    setAnnouncement(t('settings_shortcutSet', [label, keysText(shown)]));
    changeRef.current?.focus();
    void save(next).catch(notifyNotSaved);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const { key, ctrlKey, altKey, metaKey, shiftKey } = event;
    if (key === 'Tab' && !ctrlKey && !altKey && !metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (key === 'Escape' && !ctrlKey && !altKey && !metaKey && !shiftKey) {
      stopRecording();
      setError(null);
      changeRef.current?.focus();
      return;
    }
    if (event.repeat) return;
    const reading = readShortcutKeys(event.nativeEvent);
    if (reading.status === 'pending') {
      setHeld({
        key: '…',
        ...(altKey ? { alt: true } : {}),
        ...(shiftKey ? { shift: true } : {}),
        ...((isApplePlatform() ? metaKey : ctrlKey) ? { mod: true } : {}),
      });
      return;
    }
    setHeld(null);
    if (reading.status === 'invalid') {
      setError(describeInvalid(reading.problem));
      return;
    }
    const problem = checkShortcutKeys(id, reading.binding, overrides);
    if (problem) {
      setError(describeProblem(problem, reading.binding));
      return;
    }
    apply(withPageShortcut(overrides, id, [reading.binding]), [reading.binding]);
  };

  const onKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    // Letting go of the modifiers without a key starts over.
    if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) setHeld(null);
  };

  const reset = () => {
    const problem = checkShortcutReset(id, overrides);
    if (problem) {
      setError(describeProblem(problem, null));
      return;
    }
    apply(withoutPageShortcut(overrides, id), getPageShortcutKeys(id, {}));
  };

  return (
    <li
      data-shortcut={id}
      data-changed={changed ? 'true' : undefined}
      className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm"
    >
      <span className="min-w-0 flex-1">{label}</span>
      <span className="flex shrink-0 items-start gap-1">
        <span className="flex flex-col items-end gap-1">
          {recording ? (
            <Input
              autoFocus
              type="text"
              readOnly
              data-slot="page-shortcut-recorder"
              aria-label={t('settings_shortcutFieldLabel', label)}
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              value={held ? shortcutKeyCaps(held).join('+') : ''}
              placeholder={t('settings_shortcutRecording')}
              onBlur={stopRecording}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              className="h-8 w-40 text-center font-mono text-xs caret-transparent border-primary"
            />
          ) : (
            <span className="flex min-h-8 items-center gap-1.5" data-slot="page-shortcut-keys">
              {keys.map((binding, index) => (
                <span key={bindingSignature(binding)} className="inline-flex items-center gap-1.5">
                  {index > 0 && (
                    <span className="text-xs text-muted-foreground">{t('shortcuts_or')}</span>
                  )}
                  <KeyCombo binding={binding} />
                </span>
              ))}
            </span>
          )}
          {error && (
            <span
              id={errorId}
              role="alert"
              className="max-w-64 text-right text-xs text-destructive-text"
            >
              {error}
            </span>
          )}
        </span>
        <Button
          ref={changeRef}
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          aria-label={t('settings_pageShortcutChangeLabel', label)}
          onClick={() => {
            setError(null);
            setRecording(true);
          }}
        >
          <Keyboard aria-hidden="true" className="h-4 w-4" />
          {t('settings_pageShortcutChange')}
        </Button>
        <ResetSlot
          visible={changed}
          label={t('settings_resetFieldToDefault', label)}
          onReset={reset}
        />
      </span>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </li>
  );
}

export function PageShortcutsPanelContent() {
  const { value: stored, setValue } = useSetting('pageShortcutOverrides');
  const overrides = parsePageShortcutOverrides(stored);
  const save = (next: PageShortcutOverrides) =>
    setValue(
      Object.fromEntries(Object.entries(next).map(([id, bindings]) => [id, [...(bindings ?? [])]])),
    );
  const changedCount = Object.keys(overrides).length;
  return (
    <OptionsPanel
      id={PANEL_ID}
      data-testid={PANEL_ID}
      title={t('settings_pageShortcuts')}
      description={t('settings_pageShortcutsDesc')}
      actionsLayout="wrap"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={changedCount === 0}
          onClick={() => void setValue({}).catch(notifyNotSaved)}
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          {t('settings_pageShortcutResetAll')}
        </Button>
      }
    >
      {SECTIONS.map((section) => {
        const headingId = `${PANEL_ID}-${section}`;
        return (
          <div key={section} className="space-y-1.5">
            <h4 id={headingId} className="text-sm font-medium">
              {t(SECTION_LABEL_KEYS[section])}
            </h4>
            <ul aria-labelledby={headingId} className="divide-y rounded-md border">
              {REMAPPABLE_SHORTCUT_IDS.filter((id) => pageShortcutSection(id) === section).map(
                (id) => (
                  <PageShortcutRow key={id} id={id} overrides={overrides} save={save} />
                ),
              )}
            </ul>
          </div>
        );
      })}
    </OptionsPanel>
  );
}

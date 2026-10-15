/**
 * A field that records a browser command shortcut, for browsers that let the extension set one
 * (Firefox's `commands.update`). Focus it and press keys: a valid combination is saved at once,
 * an invalid one is explained under the field. Esc cancels, and Tab or Shift+Tab without other
 * modifiers moves focus on as usual, so the field never traps the keyboard. A text input, so
 * screen readers pass key presses through instead of using them for navigation.
 */

import type { KeyboardEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

const PROBLEM_MESSAGES: Record<CommandShortcutProblem, (apple: boolean) => string> = {
  needsModifier: (apple) =>
    t(apple ? 'settings_shortcutNeedsModifierApple' : 'settings_shortcutNeedsModifier'),
  tooManyModifiers: () => t('settings_shortcutTooManyModifiers'),
  unsupportedKey: () => t('settings_shortcutUnsupportedKey'),
};

type ShortcutRecorderProps = {
  name: ExtensionCommand;
  /** The command's keys now, `''` when it has none. */
  shortcut: string;
  /** The other commands' keys, so one combination is not given to two commands. */
  otherShortcuts: Readonly<Partial<Record<ExtensionCommand, string>>>;
  /** Called after the browser saved a change, to read the keys again. */
  onChanged: () => void;
};

export function ShortcutRecorder({
  name,
  shortcut,
  otherShortcuts,
  onChanged,
}: ShortcutRecorderProps) {
  const apple = isApplePlatform();
  const label = t(EXTENSION_COMMANDS[name].descriptionKey);
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const isDefault = shortcut === COMMAND_SUGGESTED_KEYS[name];

  // An explanation is about the keys as they were when it was given. Once any command's keys
  // change (another row recorded new ones), it may no longer be true, so it goes.
  const keysNow = JSON.stringify([shortcut, otherShortcuts]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: clears when the keys change.
  useEffect(() => {
    setError(null);
  }, [keysNow]);

  const announceSaved = async (change: () => Promise<void>, saved: string) => {
    setError(null);
    try {
      await change();
      const keys = formatCommandShortcut(saved, { apple });
      setAnnouncement(t('settings_shortcutSet', [label, keys]));
      onChanged();
    } catch {
      setError(t('settings_shortcutRejected'));
    }
  };

  const save = (next: string) => {
    // Firefox lets the extension take its bookmark keys, but still bookmarks the page with them.
    if (isShortcutKeptByBrowser(next, apple)) {
      setError(t('settings_shortcutKeptByBrowser', formatCommandShortcut(next, { apple })));
      return;
    }
    const owner = (Object.keys(otherShortcuts) as ExtensionCommand[]).find(
      (other) => other !== name && otherShortcuts[other] === next,
    );
    if (owner) {
      setError(t('settings_shortcutInUse', t(EXTENSION_COMMANDS[owner].descriptionKey)));
      return;
    }
    if (next === shortcut) {
      setError(null);
      return;
    }
    void announceSaved(() => updateCommandShortcut(name, next), next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const { key, ctrlKey, altKey, metaKey, shiftKey } = event;
    if (key === 'Tab' && !ctrlKey && !altKey && !metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (key === 'Escape' && !ctrlKey && !altKey && !metaKey && !shiftKey) {
      setHeld(null);
      setError(null);
      inputRef.current?.blur();
      return;
    }
    if (event.repeat) return;
    setRecording(true);
    const reading = readCommandShortcut(event, { apple });
    if (reading.status === 'pending') {
      setHeld(reading.keys);
      return;
    }
    setHeld(null);
    if (reading.status === 'invalid') {
      setError(PROBLEM_MESSAGES[reading.problem](apple));
      return;
    }
    save(reading.shortcut);
  };

  const onKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    // Letting go of the modifiers without a key starts over.
    if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) setHeld(null);
  };

  // While only modifiers are held, show them with a placeholder for the key still to come.
  const shown = formatCommandShortcut(held ? [...held, '…'].join('+') : shortcut, { apple });

  return (
    <span className="flex shrink-0 items-start gap-1">
      <span className="flex flex-col items-end gap-1">
        <Input
          ref={inputRef}
          type="text"
          readOnly
          data-slot="shortcut-recorder"
          data-recording={recording ? 'true' : undefined}
          aria-label={t('settings_shortcutFieldLabel', label)}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          value={shown}
          placeholder={recording ? t('settings_shortcutRecording') : t('settings_shortcutNotSet')}
          onFocus={() => setRecording(true)}
          onBlur={() => {
            setRecording(false);
            setHeld(null);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          className="h-8 w-36 cursor-pointer text-center font-mono text-xs caret-transparent data-[recording=true]:border-primary"
        />
        {error && (
          <span id={errorId} className="max-w-56 text-right text-xs text-destructive-text">
            {error}
          </span>
        )}
      </span>
      <ResetSlot
        visible={!isDefault}
        label={t('settings_resetFieldToDefault', label)}
        onReset={() =>
          void announceSaved(() => resetCommandShortcut(name), COMMAND_SUGGESTED_KEYS[name])
        }
      />
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </span>
  );
}

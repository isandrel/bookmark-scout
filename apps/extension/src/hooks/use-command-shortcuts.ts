import { useCallback, useEffect, useState } from 'react';

/** The last keys this page read, so a component mounted after a read starts with them. */
let lastShortcuts: CommandShortcuts | null = null;

function readCommandShortcuts(): Promise<CommandShortcuts> {
  return getCommandShortcuts().then((shortcuts) => {
    lastShortcuts = shortcuts;
    return shortcuts;
  });
}

/**
 * Reads the command keys before a page's first render (`mountExtensionPage`'s `preload`), so a
 * notice that names them shows on the first frame instead of appearing a moment later.
 */
export function preloadCommandShortcuts(): Promise<void> {
  return readCommandShortcuts().then(
    () => undefined,
    () => undefined,
  );
}

/**
 * The keys bound to each extension command, read when the page opens and again whenever it comes
 * back into view or focus (the user may have just changed them on the browser's shortcut page),
 * and on `commands.onChanged` where the browser has it. `null` until the first read succeeds; a
 * failed read keeps what was shown, so nothing claims a shortcut is missing without knowing.
 */
export function useCommandShortcuts(): {
  shortcuts: CommandShortcuts | null;
  reload: () => void;
} {
  const [shortcuts, setShortcuts] = useState<CommandShortcuts | null>(() => lastShortcuts);

  const reload = useCallback(() => {
    readCommandShortcuts()
      .then(setShortcuts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', reload);
    const unwatch = watchCommandShortcuts(reload);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', reload);
      unwatch();
    };
  }, [reload]);

  return { shortcuts, reload };
}

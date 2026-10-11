import { useCallback, useEffect, useState } from 'react';

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
  const [shortcuts, setShortcuts] = useState<CommandShortcuts | null>(null);

  const reload = useCallback(() => {
    getCommandShortcuts()
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

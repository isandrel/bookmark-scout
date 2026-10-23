import { useEffect, useState } from 'react';

/**
 * Whether the browser lets the extension run in private windows (Chrome and Edge: Allow in
 * Incognito; Firefox: Run in Private Windows), read again when the page comes back into view,
 * since the user changes it on the browser's own extensions page. Null until read.
 */
export function usePrivateWindowAccess(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let stopped = false;
    const read = () => {
      void isAllowedInPrivateWindows().then((value) => {
        if (!stopped) setAllowed(value);
      });
    };
    read();
    const onVisible = () => {
      if (document.visibilityState === 'visible') read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return allowed;
}

import { useCallback, useEffect, useState } from 'react';

/** Tracks whether the optional web host permission is granted, following later grants/revokes. */
export function useWebHostAccess() {
  const [granted, setGranted] = useState<boolean | null>(null);

  const recheck = useCallback(async () => {
    setGranted(await hasWebHostAccess());
  }, []);

  useEffect(() => {
    void recheck();
    const listener = () => void recheck();
    const events = browser.permissions;
    events?.onAdded?.addListener(listener);
    events?.onRemoved?.addListener(listener);
    return () => {
      events?.onAdded?.removeListener(listener);
      events?.onRemoved?.removeListener(listener);
    };
  }, [recheck]);

  return { granted, recheck };
}

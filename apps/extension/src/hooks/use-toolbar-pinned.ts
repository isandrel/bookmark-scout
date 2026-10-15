import { useEffect, useState } from 'react';

type ActionUserSettings = { isOnToolbar?: boolean };
type ActionWithUserSettings = {
  getUserSettings?: () => Promise<ActionUserSettings>;
  onUserSettingsChanged?: {
    addListener: (callback: (change: ActionUserSettings) => void) => void;
    removeListener: (callback: (change: ActionUserSettings) => void) => void;
  };
};

/** The toolbar button API: `action` in Manifest V3, `browserAction` in Firefox's V2 build. */
function toolbarAction(): ActionWithUserSettings | undefined {
  const api = browser as unknown as {
    action?: ActionWithUserSettings;
    browserAction?: ActionWithUserSettings;
  };
  return api.action ?? api.browserAction;
}

/**
 * Whether Bookmark Scout's button is pinned to the toolbar (`action.getUserSettings`), following
 * changes where the browser reports them (`action.onUserSettingsChanged`). `null` while unknown,
 * and where the browser does not say.
 */
export function useToolbarPinned(): boolean | null {
  const [pinned, setPinned] = useState<boolean | null>(null);

  useEffect(() => {
    const action = toolbarAction();
    if (typeof action?.getUserSettings !== 'function') return undefined;
    let active = true;
    const apply = (settings: ActionUserSettings) => {
      if (active && typeof settings.isOnToolbar === 'boolean') setPinned(settings.isOnToolbar);
    };
    action
      .getUserSettings()
      .then(apply)
      .catch(() => undefined);
    action.onUserSettingsChanged?.addListener(apply);
    return () => {
      active = false;
      action.onUserSettingsChanged?.removeListener(apply);
    };
  }, []);

  return pinned;
}

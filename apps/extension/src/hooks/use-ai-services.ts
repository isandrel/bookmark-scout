/**
 * React hook over `lib/ai-services-storage.ts`, which stays free of React for the background.
 */

import { useEffect, useState } from 'react';

/**
 * Live services state for React, following changes from any page. Before the first save,
 * services derive from the synced provider and stored keys, so those are followed too. Only the
 * latest refresh is applied, so a slow earlier read never replaces a newer one.
 */
export function useAIServices(): { state: AIServicesState; isLoading: boolean } {
  const [state, setState] = useState<AIServicesState>({ services: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let latest = 0;
    let active = true;
    const refresh = () => {
      const request = ++latest;
      void getAIServicesState().then((next) => {
        if (!active || request !== latest) return;
        setState(next);
        setIsLoading(false);
      });
    };
    refresh();
    const unwatchers = [
      aiServicesValue.watch(refresh),
      subscribeToSettings(refresh),
      aiProviderConfigValue.watch(refresh),
    ];
    return () => {
      active = false;
      for (const unwatch of unwatchers) unwatch();
    };
  }, []);

  return { state, isLoading };
}

/**
 * React hook over `lib/prompt-library-storage.ts`, which stays free of React for the background.
 */

import { useEffect, useState } from 'react';

/** Live prompt library for React, following edits from any page or synced device. */
export function usePromptLibrary(): { library: PromptLibrary; isLoading: boolean } {
  const [library, setLibrary] = useState<PromptLibrary>({ prompts: [], active: {} });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(
    () =>
      watchPromptLibrary((next) => {
        setLibrary(next);
        setIsLoading(false);
      }),
    [],
  );

  return { library, isLoading };
}

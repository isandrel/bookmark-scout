import type { QuickSaveToastController } from '@/lib/quick-save-protocol';
import { createQuickSaveToast } from './toast';

/**
 * Injected by quick save (`browser.scripting.executeScript`, files) into the tab the shortcut was
 * pressed in, in the extension's isolated world. It installs `render` once per document; the
 * background then calls it with each view (`services/quick-save.ts`).
 */
export default defineUnlistedScript(() => {
  const scope = globalThis as typeof globalThis & {
    __bookmarkScoutQuickSave?: QuickSaveToastController;
  };
  if (scope.__bookmarkScoutQuickSave) return;
  scope.__bookmarkScoutQuickSave = createQuickSaveToast((message) =>
    browser.runtime.sendMessage(message),
  );
});

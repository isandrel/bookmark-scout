/**
 * The right-click menu's own recent folder count (October 2026). 0.3.4 listed as many recent
 * folders in the menu as the popup, Recent Folders Max (`recentFoldersMax`); the menu now has its
 * own setting, Recent Folders in Menu (`contextMenuRecentMax`). A user who changed the popup's
 * count in 0.3.4 keeps it for the menu too, until they change the menu's.
 *
 * While it is registered, the settings writer stores the menu's count even at its default for a
 * user whose settings hold the popup's (`keepsAtDefault`), so a device that runs this later never
 * replaces a menu count the user set back to the default with the popup's. Removing it
 * (`migration.ts remove 2026-10-context-menu-recent-max`) deletes this module, its table in
 * `config/data/migrations.toml`, and its test; nothing else names it.
 */
import type { MigrationModule } from './index';

export const migration: MigrationModule = {
  description: "The popup's Recent Folders Max (0.3.4) to the right-click menu's own count",
  recover(layers) {
    return 'recentFoldersMax' in layers.sync
      ? { found: { contextMenuRecentMax: layers.sync.recentFoldersMax } }
      : { found: {} };
  },
  keepsAtDefault: (key, settingsItem) =>
    key === 'contextMenuRecentMax' && 'recentFoldersMax' in settingsItem,
};

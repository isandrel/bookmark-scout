/**
 * The manager's platform-specific keys, as config/ui/shortcuts.toml binds them after Chrome's
 * manager: on a Mac, Enter renames and Cmd+O opens; elsewhere Enter opens and F2 renames. The
 * browser runs on the test machine, so its platform is Node's.
 */
export const isMacPlatform = process.platform === 'darwin';

/** Opens the focused folder in the manager, or the focused bookmark in a tab. */
export const OPEN_KEY = isMacPlatform ? 'Meta+o' : 'Enter';

/** Opens the edit dialog for the focused item. */
export const RENAME_KEY = isMacPlatform ? 'Enter' : 'F2';

/** Deletes the selection. */
export const DELETE_KEY = 'Delete';

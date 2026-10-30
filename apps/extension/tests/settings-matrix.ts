/**
 * Settings-to-behavior matrix. Every key in `src/lib/settings-schema.ts` needs an entry: the
 * runtime file that reads it and at least one test that changes it and asserts a different
 * result, or an explicit `unsupported` / `planned` status with the reason.
 * `tests/unit/settings-matrix.test.ts` enforces this; see `tests/settings-matrix.md`.
 */
import type { Settings } from '@/lib/settings-schema';

/** A test in `tests/<kind>/<file>` whose `test()` or `it()` title matches exactly. */
export type SettingTestRef = { kind: 'e2e' | 'unit'; file: string; title: string };

export type SettingCoverage =
  | {
      status: 'tested';
      /** Source file under `src/` that reads the setting and changes behavior with it. */
      consumer: string;
      tests: SettingTestRef[];
      note?: string;
    }
  | {
      status: 'unsupported' | 'planned';
      consumer?: string;
      reason: string;
      tests?: SettingTestRef[];
    };

const e2e = (file: string, title: string): SettingTestRef => ({ kind: 'e2e', file, title });
const unit = (file: string, title: string): SettingTestRef => ({ kind: 'unit', file, title });

const tested = (consumer: string, tests: SettingTestRef[], note?: string): SettingCoverage => ({
  status: 'tested',
  consumer,
  tests,
  ...(note ? { note } : {}),
});

const TOOL_TABLE = 'components/bookmarks/tools/tool-definitions.ts';
const TOOL_OPTIONS = 'services/tool-options.ts';
const DATA_TOOLS = 'components/bookmarks/tools/DataToolCards.tsx';
const TOOLS = 'components/bookmarks/ToolsSidebar.tsx';
const POPUP = 'components/page/PopupPage.tsx';
const MANAGER = 'components/page/BookmarksPage.tsx';
const MENUS = 'services/action-menus.ts';
const TABLE_DEFAULTS = 'hooks/use-bookmark-table-view-defaults.ts';
const MENUS_NOTE =
  'Edited in Options > Behavior > Bookmark manager menus (ManagerMenusPanel); each menu syncs.';
const POPUP_CUSTOMIZE = 'popup-customize.spec.ts';

// Shared test references.
const CUSTOMIZE_UNIT = 'manager-customize.test.ts';
const CUSTOMIZE_E2E = 'bookmark-manager-customize.spec.ts';
const menuSections = unit(
  'action-menus.test.ts',
  'moves actions between sections, hides and reorders them, in every menu',
);
const organizeMenu = e2e(
  CUSTOMIZE_E2E,
  'Options arranges the Organize menu: hides, reorders, moves between sections, and resets',
);
const startFolder = [
  unit(
    CUSTOMIZE_UNIT,
    'opens the bookmarks bar, the last folder, or a chosen one, and the bar when it is gone',
  ),
  e2e(CUSTOMIZE_E2E, 'the manager opens on the start folder: the last opened one, or a chosen one'),
];
const sidebars = e2e(
  CUSTOMIZE_E2E,
  'sidebars keep their dragged and keyed widths, and reopen as left when set to remember',
);
const tableDefaults = [
  unit(
    'bookmark-table-view-storage.test.ts',
    'builds a new view from Default Columns, Default Rows per Page, and Default Sort',
  ),
  unit(
    'bookmark-table-view-storage.test.ts',
    'shows the Options defaults for every part the manager has not changed',
  ),
  e2e(
    CUSTOMIZE_E2E,
    'default columns, rows per page, and sort apply to a new view and after Reset table view',
  ),
];
const cards = e2e(
  CUSTOMIZE_E2E,
  'cards show the details, size, and limits Options sets, and the preview its details',
);
const cardLimits = unit(
  CUSTOMIZE_UNIT,
  'cuts tags and the summary at the card limits, and names the folder',
);
const SETTINGS_E2E = 'settings-behavior.spec.ts';
const SETTINGS_UNIT = 'settings-behavior.test.ts';
const toolFlags = e2e(
  'tool-settings.spec.ts',
  'enabled flags hide all tool cards and live settings restore selected cards',
);
const fixedScopes = e2e(
  'tool-settings.spec.ts',
  'unsupported and malformed saved scopes fall back without resetting other tool settings',
);
const popupAi = e2e(
  SETTINGS_E2E,
  '[mocked provider contract] popup AI model, auto-trigger, suggestion count, and title truncation follow settings',
);
const popupDisplay = e2e(
  'popup-tree-actions.spec.ts',
  'popup applies favicon, new folder name, and popup size settings',
);
const contextPack = e2e(
  'additional-workflows.spec.ts',
  'AI context pack exports the selected folder with AI disabled',
);
const contextPackLimits = e2e(
  SETTINGS_E2E,
  'AI context pack item, depth, and excerpt limits change the exported file',
);
const contextPackOptions = unit(
  'ai-context-pack.test.ts',
  'omits stored metadata when its export options are disabled',
);
const reportSettings = e2e(
  SETTINGS_E2E,
  'statistics top-N and privacy title scanning follow their settings',
);
const duplicateSettings = e2e(
  SETTINGS_E2E,
  'duplicate matching, group limit, and reorganization scope follow their settings',
);
const privacyUnit = unit(
  SETTINGS_UNIT,
  'scans titles, query params, and fragments only when enabled',
);
const privacyDetectors = unit(
  SETTINGS_UNIT,
  'uses the saved sensitive parameter list and detector toggles',
);
const statisticsSections = e2e(
  'tool-reports.spec.ts',
  'statistics hide sections that are turned off instead of showing zeros',
);
const exportPreferences = e2e(
  'tool-data-io.spec.ts',
  'export uses the selected folder and saved preferences, and neutralizes CSV formulas',
);
const exportUnit = unit('bookmark-export.test.ts', 'honors date, URL, and indentation preferences');
const urlCleanerE2e = e2e(
  'additional-workflows.spec.ts',
  'URL cleaner honors preserved parameters and fragment settings',
);
const metadataMerge = unit(
  'bookmark-metadata-storage.test.ts',
  'persists reviewed stubbed suggestions using merge settings',
);
const aiPrompts = unit(
  'ai-prompt-settings.test.ts',
  'puts the saved tag count and tag style into the auto-tagging prompt',
);
const reorgSafety = unit(
  'ai-reorganization.test.ts',
  'batches synthetic provider requests, filters low-confidence moves, and never mutates during preview',
);
const reorgLimits = unit(
  'ai-reorganization-settings.test.ts',
  'sends the saved category and folder-size limits to the provider',
);
const unlimitedPromptVariables = unit(
  'prompt-library.test.ts',
  'fills unlimited folder limits with a phrase, never -1, even in a custom prompt',
);
const recentFoldersPopup = e2e(
  'popup-layout.spec.ts',
  'Recent Folders Max limits the popup chips, and Recent Folders hides them',
);
const CONTEXT_MENU = 'services/context-menu.ts';
const CONTEXT_MENU_UNIT = 'context-menu.test.ts';
const CONTEXT_MENU_E2E = 'context-menu-save.spec.ts';
const contextMenuOptions = e2e(
  CONTEXT_MENU_E2E,
  'Options sets Show Menu On and Menu Entries, and the menu follows',
);
const contextMenuArranged = e2e(
  CONTEXT_MENU_E2E,
  'Menu Entries orders and hides the entries, and Show Menu On sets where every item shows',
);
const toolsSidebarArranged = e2e(
  'tool-settings.spec.ts',
  'Sidebar Tools hides and reorders tools, and Start Tab picks the tab the sidebar opens on',
);
const networkRealServer = e2e(
  'tool-network.spec.ts',
  'dead-link checker reaches a real non-CORS server, falls back to GET, reports redirects, and skips bookmarklets',
);

const SITE_ICONS_UNIT = 'site-icons.test.ts';
const COVERS_UNIT = 'covers.test.ts';
const coversRun = e2e(
  'covers.spec.ts',
  'a fetched cover shows on its card after the review saves it, and Options deletes it, leaving bookmarks, tags, and the History unchanged (V32)',
);
const BROWSE_COVERS = 'services/browse-covers.ts';
const QUICK_SAVE_COVER = 'services/quick-save-cover.ts';
const QUICK_SAVE_COVER_UNIT = 'quick-save-cover.test.ts';
const QUICK_SAVE_COVER_E2E = 'quick-save-cover.spec.ts';
const quickSaveCoverRun = e2e(
  QUICK_SAVE_COVER_E2E,
  "quick save keeps the page's own image as the new bookmark's cover, and Remove cover in the notification deletes it",
);
const BROWSE_COVERS_UNIT = 'browse-covers.test.ts';
const OPTIONS_PAGE = 'components/page/OptionsPage.tsx';
const OPTIONS_SPEC = 'options-settings.spec.ts';
const SETTINGS_SEARCH_UNIT = 'settings-search.test.ts';
const SETTINGS_SEARCH_DISPLAY_TEST =
  'settings search settings turn off marks, notes, and tab counts, live';
const SETTINGS_SEARCH_IN_TEST =
  'settings search looks only in the texts Search In names, and matches an exact phrase';
const browseCaptureRun = e2e(
  'browse-covers.spec.ts',
  'a bookmarked page that loads in the active tab gets a cover captured while browsing once it settles',
);
const browseCaptureSkips = e2e(
  'browse-covers.spec.ts',
  'no picture in a private window, of a site never captured, of a page without a bookmark, or of one left before it settles',
);
const siteIconsRefresh = e2e(
  'tool-site-icons.spec.ts',
  'site icon refresh dedupes origins, rejects oversized and non-image icons, and renders saved icons',
);

export const settingsMatrix: Record<keyof Settings, SettingCoverage> = {
  // Appearance
  language: tested('lib/settings-storage.ts', [
    e2e('bookmark-workflows.spec.ts', 'popup uses selected Japanese and Korean language settings'),
    unit(
      'context-menu.test.ts',
      'localizes menu titles with the selected language on the first build',
    ),
  ]),
  theme: tested('components/theme-provider.tsx', [
    e2e('options-settings.spec.ts', 'theme is one synced setting applied live in every open page'),
  ]),
  showFavicons: tested(POPUP, [popupDisplay]),
  showTrailingSlash: tested('components/ui/url-link.tsx', [
    unit('display-url.test.ts', 'drops only the final slash, unless the setting shows it'),
  ]),
  dateFormat: tested('lib/settings-storage.ts', [
    unit(
      'i18n-date-format.test.ts',
      'shows dates and times in the chosen formats, in every place at once',
    ),
  ]),
  timeFormat: tested('lib/settings-storage.ts', [
    unit(
      'i18n-date-format.test.ts',
      'shows dates and times in the chosen formats, in every place at once',
    ),
  ]),
  browserIconCache: tested(
    'hooks/use-site-icon.ts',
    [
      e2e(
        'favicon-access.spec.ts',
        "Use the browser's icon cache shows cached icons only once it is on and allowed",
      ),
      unit(
        'site-icons.test.ts',
        'prefers a saved icon over the browser icon cache, which is used only when allowed',
      ),
    ],
    'Chrome and Edge only; Options hides it in Firefox, which has no icon cache.',
  ),
  faviconSize: tested(POPUP, [popupDisplay]),

  // Search
  searchDebounceMs: tested(POPUP, [
    e2e(SETTINGS_E2E, 'search delay setting controls when the popup filters results'),
  ]),
  maxSearchResults: tested(POPUP, [
    e2e('popup-tree.spec.ts', 'maxSearchResults limits visible matches and explains the limit'),
  ]),
  expandFoldersOnSearch: tested(POPUP, [
    e2e(
      'popup-tree.spec.ts',
      'expandFoldersOnSearch opens matching folders and ancestors only when enabled',
    ),
  ]),
  searchHistory: tested(POPUP, [
    e2e('popup-tree.spec.ts', 'search history records, reuses, clears, and respects the setting'),
  ]),
  folderMatchesEnabled: tested(POPUP, [
    e2e(
      'folder-match-save.spec.ts',
      'folder match settings hide the list, limit its length, and turn off typo matching',
    ),
  ]),
  folderMatchesMax: tested(POPUP, [
    e2e(
      'folder-match-save.spec.ts',
      'folder match settings hide the list, limit its length, and turn off typo matching',
    ),
  ]),
  folderMatchesTypos: tested(POPUP, [
    e2e(
      'folder-match-save.spec.ts',
      'folder match settings hide the list, limit its length, and turn off typo matching',
    ),
    unit('folder-match.test.ts', 'accepts one typo in longer words only'),
  ]),
  settingsSearchSources: tested(OPTIONS_PAGE, [
    e2e(OPTIONS_SPEC, SETTINGS_SEARCH_IN_TEST),
    unit(
      SETTINGS_SEARCH_UNIT,
      'searches only the sources Search In names, but counts what the row shows as visible',
    ),
    unit('ai-services.test.ts', 'looks in the names and descriptions Search In names'),
  ]),
  settingsSearchMatch: tested(OPTIONS_PAGE, [
    e2e(OPTIONS_SPEC, SETTINGS_SEARCH_IN_TEST),
    unit(SETTINGS_SEARCH_UNIT, 'matches an exact phrase only as typed'),
  ]),
  settingsSearchHighlight: tested(OPTIONS_PAGE, [e2e(OPTIONS_SPEC, SETTINGS_SEARCH_DISPLAY_TEST)]),
  settingsSearchNotes: tested(OPTIONS_PAGE, [e2e(OPTIONS_SPEC, SETTINGS_SEARCH_DISPLAY_TEST)]),
  settingsSearchTabCounts: tested(OPTIONS_PAGE, [e2e(OPTIONS_SPEC, SETTINGS_SEARCH_DISPLAY_TEST)]),

  // Behavior
  sortOrder: tested(POPUP, [
    e2e(
      'bookmark-workflows.spec.ts',
      'updates popup ordering from synced settings and creates a folder',
    ),
    e2e('sorting.spec.ts', 'applies an Options UI sorting change to an open bookmarks table'),
    e2e(
      'popup-tree.spec.ts',
      'lists each folder in the browser order by default, as the bookmarks bar does',
    ),
    e2e('manager-defaults.spec.ts', 'names another Sort Order beside the Browser order button'),
  ]),
  groupByFolders: tested(POPUP, [
    e2e(
      'popup-tree.spec.ts',
      'groupByFolders lists folders before links under date and alphabetical order',
    ),
  ]),
  treeDragAndDrop: tested(POPUP, [
    e2e(
      'tree-drag-drop.spec.ts',
      'with drag and drop turned off, rows cannot be dragged and links are not taken',
    ),
  ]),
  linkOpenTarget: tested(
    'components/ui/url-link.tsx',
    [
      e2e(
        'link-open-target.spec.ts',
        'linkOpenTarget opens a manager URL in a new tab, a background tab, or the current tab',
      ),
    ],
    'Popup rows, tool results, and dialogs share the same click handler.',
  ),
  showLinkTarget: tested(
    'components/ui/url-link.tsx',
    [
      e2e(
        'link-open-target.spec.ts',
        'the link target icon follows Open links in, hides with Show Where Links Open off, and leaves truncated addresses whole',
      ),
    ],
    'Links and popup rows share LinkTargetIcon.',
  ),
  historyRecordOutsideChanges: tested('services/bookmark-observer.ts', [
    unit(
      'bookmark-observer.test.ts',
      'records nothing while paused, then the difference once it is back on (X16)',
    ),
  ]),
  confirmBeforeDelete: tested('hooks/use-bookmark-deletion.tsx', [
    e2e(
      'bookmark-workflows.spec.ts',
      'confirms bookmark and folder deletion, and cancels without changing the tree',
    ),
    e2e(
      'bookmark-workflows.spec.ts',
      'deletes bookmarks and folders immediately when confirmation is disabled',
    ),
  ]),
  defaultNewFolderName: tested(POPUP, [popupDisplay]),
  recentFoldersMax: tested(POPUP, [recentFoldersPopup]),
  recentFoldersEnabled: tested(POPUP, [recentFoldersPopup]),

  // Advanced
  popupWidth: tested('hooks/use-popup-size.ts', [popupDisplay]),
  popupHeight: tested('hooks/use-popup-size.ts', [popupDisplay]),
  truncateLength: tested(
    POPUP,
    [
      popupAi,
      unit('bookmark-deletion-flow.test.ts', 'quotes titles cut at the truncateLength setting'),
    ],
    'Shortens the page title in the popup AI suggestions header and titles quoted in toasts.',
  ),
  showHoverDetails: tested('components/bookmark/PopupTree.tsx', [
    e2e(
      'bookmark-hover-card.spec.ts',
      'Show Details on Hover off shows no card and keeps the plain tooltip',
    ),
    e2e(
      'bookmark-hover-card.spec.ts',
      'popup: resting on a bookmark shows its details after the delay, Escape closes it in place, and the pointer can move onto it',
    ),
  ]),
  hoverCardOpenDelayMs: tested('hooks/use-hover-card.ts', [
    unit('hover-card.test.ts', 'reads the open delay each time a card is about to open'),
    e2e(POPUP_CUSTOMIZE, 'hover card delay and details follow their settings'),
  ]),
  hoverCardFields: tested(
    'components/bookmark/BookmarkHoverCard.lazy.tsx',
    [
      unit(
        'hover-card.test.ts',
        'follows the order set, hides what the setting leaves out, and skips unknown ids',
      ),
      e2e(POPUP_CUSTOMIZE, 'hover card delay and details follow their settings'),
    ],
    'Edited in Options > Appearance > Popup (PopupLayoutPanel); kept on this device.',
  ),
  treeDensity: tested(
    'components/bookmark/PopupTree.tsx',
    [e2e(POPUP_CUSTOMIZE, 'compact tree density makes popup rows shorter')],
    'Kept on this device.',
  ),
  popupSections: tested(
    POPUP,
    [
      unit(
        'popup-layout.test.ts',
        'follow the order set, hide what it leaves out, and always keep the bookmark tree',
      ),
      e2e(
        POPUP_CUSTOMIZE,
        'popup sections follow the order set in Options, in the popup and the side panel',
      ),
    ],
    'Edited in Options > Appearance > Popup (PopupLayoutPanel); kept on this device.',
  ),
  popupToolbarButtons: tested(
    'components/bookmark/BookmarkSearch.tsx',
    [
      unit(
        'popup-layout.test.ts',
        'hide the buttons the setting leaves out, the theme button included',
      ),
      e2e(POPUP_CUSTOMIZE, 'a toolbar button hidden in Options leaves the popup'),
    ],
    'Edited in Options > Appearance > Popup (PopupLayoutPanel); kept on this device.',
  ),
  tooltipDelayMs: tested('components/ui/tooltip.tsx', [
    e2e(SETTINGS_E2E, 'tooltip delay setting controls when a tooltip opens'),
  ]),
  toastDurationMs: tested(
    'components/ui/toaster.tsx',
    [e2e(SETTINGS_E2E, 'toast duration setting controls how long popup toasts stay open')],
    'Undo toasts keep their own fixed undo window.',
  ),
  toastPosition: tested('components/ui/toaster.tsx', [
    e2e(SETTINGS_E2E, 'toast position setting moves popup toasts to the chosen corner'),
    unit(
      'toast-stack.test.ts',
      'places and moves toasts for every Toast Position choice, swiped toward their side',
    ),
  ]),

  // AI
  aiEnabled: tested(POPUP, [
    e2e(
      'popup-search.spec.ts',
      'theme toggle follows the system theme and AI button hides when AI is off',
    ),
    e2e(
      'additional-workflows.spec.ts',
      '[mocked provider contract] provider-backed AI previews stop at opt-in without making external requests',
    ),
  ]),
  aiActivityRecording: tested(
    'services/ai-activity.ts',
    [
      unit('ai-activity.test.ts', 'records nothing while recording is off'),
      unit(
        'ai-activity.test.ts',
        'records the call with credentials redacted and leaves the response readable',
      ),
      e2e(
        'ai-activity.spec.ts',
        '[mocked provider contract] AI activity records a request with its key and extra headers redacted, only while on',
      ),
    ],
    'A device setting: it never syncs.',
  ),
  askAiDisabledActions: tested(
    'services/actions.ts',
    [
      unit('actions.test.ts', 'leaves out and refuses the actions the user turned off for Ask AI'),
      e2e(
        'ask-ai.spec.ts',
        '[mocked provider contract] Ask AI is not offered the actions turned off in Options',
      ),
    ],
    'Edited in Options > AI > What Ask AI may do (AskAIActionsPanel).',
  ),
  agentBridgeEnabled: tested(
    'services/agent-bridge.ts',
    [
      unit(
        'agent-bridge.test.ts',
        'answers a call through the action registry and refuses one while access is off',
      ),
      unit(
        'agent-bridge.test.ts',
        'connects through native messaging, announces the tools, and answers calls',
      ),
      e2e(
        'agent-bridge.spec.ts',
        'Options turns on access for local AI agents, which look up bookmarks through the bridge',
      ),
    ],
    'A device setting; turning it on asks for native messaging.',
  ),
  agentBridgeWrites: tested(
    'services/actions.ts',
    [
      unit(
        'agent-approvals.test.ts',
        'refuses changes without asking while changes are not allowed',
      ),
      unit(
        'agent-approvals.test.ts',
        'asks before a local agent saves a page, and saves nothing when declined',
      ),
      e2e(
        'agent-bridge.spec.ts',
        'a local agent saves a page only after the user approves it in the approval window',
      ),
    ],
    'A device setting; every change still waits for approval.',
  ),
  agentBridgeRedactUrls: tested('services/agent-bridge.ts', [
    unit('agent-bridge.test.ts', 'hides private values in the titles and URLs agents receive'),
    e2e(
      'agent-bridge.spec.ts',
      'Options turns on access for local AI agents, which look up bookmarks through the bridge',
    ),
  ]),
  agentBridgeDisabledActions: tested(
    'services/actions.ts',
    [
      unit(
        'agent-bridge.test.ts',
        'leaves out and refuses the actions the user turned off for local agents',
      ),
      e2e(
        'agent-bridge.spec.ts',
        'Options turns on access for local AI agents, which look up bookmarks through the bridge',
      ),
    ],
    'Edited in Options > AI > Local AI agents (AgentBridgeActionsPanel).',
  ),
  managerViewMode: tested('components/ui/table/data-table.tsx', [
    e2e(
      'bookmark-manager-cards.spec.ts',
      'cards show the folder as the list does, with selection, keys, and menus, and stay on reload',
    ),
  ]),
  toolsSidebarLayout: tested('components/bookmarks/ToolsSidebar.tsx', [
    e2e(
      'tool-settings.spec.ts',
      'the Tools sidebar shows one section a tab, and One list shows them all',
    ),
  ]),
  toolsSidebarDefaultTab: tested('components/bookmarks/ToolsSidebar.tsx', [toolsSidebarArranged]),
  toolsSidebarOrder: tested(
    TOOL_TABLE,
    [
      toolsSidebarArranged,
      unit(
        'tools-sidebar.test.ts',
        'shows the tools Sidebar Tools lists, in its order inside their own sections',
      ),
    ],
    'Edited in Options > Behavior > Tools Sidebar (ToolsSidebarOrderPanel).',
  ),
  managerMenuActions: tested(
    MENUS,
    [
      unit('action-menus.test.ts', 'hide and reorder item-menu actions as the user arranged them'),
      menuSections,
      e2e('bookmark-manager-menus.spec.ts', 'Options hides and reorders the manager menu items'),
    ],
    MENUS_NOTE,
  ),
  managerOrganizeMenu: tested(MENUS, [menuSections, organizeMenu], MENUS_NOTE),
  managerEmptySpaceMenu: tested(MENUS, [menuSections, organizeMenu], MENUS_NOTE),
  managerPreviewMenu: tested(MENUS, [menuSections, organizeMenu], MENUS_NOTE),
  managerSortOrder: tested(MANAGER, [
    unit(CUSTOMIZE_UNIT, 'follows Sort Order until set to an order of its own'),
    e2e(CUSTOMIZE_E2E, 'Manager Order sorts the manager without changing the popup'),
  ]),
  managerStartFolder: tested('services/manager-start-folder.ts', startFolder),
  managerStartFolderId: tested('services/manager-start-folder.ts', startFolder),
  managerSidebarsStart: tested('hooks/use-manager-sidebars.ts', [
    unit(CUSTOMIZE_UNIT, 'opens the sidebars as configured, or as left last when set to remember'),
    sidebars,
  ]),
  managerDefaultColumns: tested(TABLE_DEFAULTS, tableDefaults),
  managerDefaultPageSize: tested(TABLE_DEFAULTS, tableDefaults),
  managerDefaultSort: tested(TABLE_DEFAULTS, tableDefaults),
  managerTableDates: tested('components/ui/table/columns.tsx', [
    e2e(
      'manager-defaults.spec.ts',
      'the Dates and Times settings change how the manager shows dates',
    ),
  ]),
  managerCardFields: tested(MANAGER, [
    unit(
      CUSTOMIZE_UNIT,
      'shows the card details and preview details the settings list, in their order',
    ),
    cards,
  ]),
  managerCardSize: tested(MANAGER, [cards]),
  cardMaxTags: tested(MANAGER, [cardLimits, cards]),
  cardSummaryLines: tested(MANAGER, [cardLimits, cards]),
  previewFields: tested('components/bookmarks/BookmarkPreviewDialog.tsx', [
    unit(
      CUSTOMIZE_UNIT,
      'shows the card details and preview details the settings list, in their order',
    ),
    cards,
  ]),
  popupBookmarkMenu: tested(
    'services/popup-row-actions.ts',
    [
      unit(
        'popup-action-menus.test.ts',
        'hide and reorder actions as the user arranged them, the first ones as buttons',
      ),
      e2e(
        POPUP_CUSTOMIZE,
        'a popup row ⋯ menu lists the configured actions and hiding one in Options removes it',
      ),
    ],
    'Edited in Options > Behavior > Popup menus (PopupMenusPanel); synced, like every menu.',
  ),
  popupFolderMenu: tested(
    'services/popup-row-actions.ts',
    [
      unit(
        'popup-action-menus.test.ts',
        'leave out what does not apply without moving a later action onto the row',
      ),
      e2e(
        POPUP_CUSTOMIZE,
        'a popup row ⋯ menu lists the configured actions and hiding one in Options removes it',
      ),
    ],
    'Edited in Options > Behavior > Popup menus (PopupMenusPanel); synced, like every menu.',
  ),
  popupExpandOnOpen: tested(POPUP, [
    unit(
      'popup-layout.test.ts',
      'opens the bookmarks bar, or the remembered folders that still exist',
    ),
    e2e(
      POPUP_CUSTOMIZE,
      'Expand on Open opens the bookmarks bar, or the folders left open last time',
    ),
  ]),
  pageShortcutOverrides: tested(
    'hooks/use-page-shortcuts.ts',
    [
      unit(
        'shortcut-remap.test.ts',
        'puts the user keys in place of the configured ones, and only for that shortcut',
      ),
      e2e(
        'page-shortcut-remap.spec.ts',
        'a manager shortcut changed in Options works with its new key, the old one no longer does, and the help names it',
      ),
      e2e(
        'page-shortcut-remap.spec.ts',
        'a popup shortcut changed in Options focuses the search box with its new key',
      ),
    ],
    'Edited in Options > Behavior > Manager and popup shortcuts (PageShortcutsPanel).',
  ),
  askAiWebSearch: tested(
    'services/ai-agent.ts',
    [unit('ai-agent.test.ts', "adds the provider's web search only while the setting is on")],
    'A device setting, switched with the globe button in Ask AI.',
  ),
  askAiKeepChats: tested('components/ai/AskAIPanel.lazy.tsx', [
    e2e(
      'ask-ai.spec.ts',
      '[mocked provider contract] Ask AI keeps its chats: reopens the last one, lists the others, and deletes them',
    ),
  ]),
  askAiChatsMax: tested('components/ai/AskAIPanel.lazy.tsx', [
    unit(
      'ask-ai-chats.test.ts',
      'keeps chats newest first, named by the first question, at most the setting',
    ),
  ]),
  aiMaxRecommendations: tested(POPUP, [
    popupAi,
    unit(
      'ai-prompt-settings.test.ts',
      'asks for and returns at most the saved number of folder recommendations',
    ),
  ]),
  aiAutoTriggerOnOpen: tested(POPUP, [popupAi]),
  aiReadPageContent: tested(
    POPUP,
    [
      e2e(
        'ai-page-reading.spec.ts',
        '[mocked provider contract] Read page content sends the page text as untrusted data',
      ),
      e2e(
        'ai-page-reading.spec.ts',
        '[mocked provider contract] without Read page content only the title and URL are sent',
      ),
      e2e('ai-page-reading.spec.ts', 'Read page content turns on once website access is granted'),
      unit(
        'page-reader.test.ts',
        'leaves items unchanged when page reading is off or website access is missing',
      ),
    ],
    'Also read by Auto-Tagging and Content Summarizer in services/tool-options.ts.',
  ),
  aiOutputLanguage: tested(
    'services/prompt-config.ts',
    [
      unit(
        'prompt-library.test.ts',
        'names the chosen language whatever the extension language is',
      ),
      unit(
        'prompt-library.test.ts',
        'asks for each page language in page mode, with the extension language as the fallback',
      ),
      e2e(
        'prompt-library.spec.ts',
        '[mocked provider contract] auto-tagging asks for the AI output language: the extension language, then each page',
      ),
    ],
    'Prompt-level; provider compliance is checked only by the live AI suite.',
  ),
  aiMaxCategories: tested(
    'services/ai-reorganization.ts',
    [reorgLimits, unlimitedPromptVariables],
    'Prompt-level limit; provider compliance is not verified. Unlimited (-1) is left out of the rules and request, and its {{variable}} reads as a phrase.',
  ),
  aiMinItemsPerFolder: tested(
    'services/ai-reorganization.ts',
    [reorgLimits],
    'Prompt-level target; provider compliance is not verified.',
  ),
  aiMaxItemsPerFolder: tested(
    'services/ai-reorganization.ts',
    [reorgLimits, unlimitedPromptVariables],
    'Prompt-level limit; provider compliance is not verified. Unlimited (-1) is left out of the rules and request, and its {{variable}} reads as a phrase.',
  ),

  // Export
  exportFilenamePrefix: tested(DATA_TOOLS, [exportPreferences]),
  exportFilenameMaxLength: tested(DATA_TOOLS, [
    unit('bookmark-export.test.ts', 'names files with the saved prefix and the local date'),
  ]),
  exportJsonIndentSize: tested(DATA_TOOLS, [exportUnit]),
  exportHtmlIndentSpaces: tested(DATA_TOOLS, [exportUnit]),
  exportMarkdownIndentSpaces: tested(DATA_TOOLS, [exportUnit]),
  exportIncludeDates: tested(DATA_TOOLS, [exportPreferences, exportUnit]),
  exportIncludeUrls: tested(DATA_TOOLS, [exportPreferences]),
  backupExportCategories: tested('hooks/use-backup-flow.tsx', [
    unit('backup-categories.test.ts', 'start a new backup without device-specific or secret parts'),
    e2e(
      'backup.spec.ts',
      'Back up settings saves only the parts selected, remembers them on this device, and never the API keys',
    ),
    e2e(
      'backup-covers.spec.ts',
      'a backup without the Covers part has no covers, and restoring it offers none',
    ),
  ]),
  backupEncryptByDefault: tested('hooks/use-backup-flow.tsx', [
    e2e('backup.spec.ts', 'Protect New Backups With a Password starts every backup protected'),
  ]),
  backupEncryptSecrets: tested('hooks/use-backup-flow.tsx', [
    e2e(
      'backup.spec.ts',
      'the AI service keys need a confirm and start password-protected; the protected file round-trips, and a wrong password or changed file imports nothing',
    ),
  ]),

  // Context menu
  contextMenuEnabled: tested('services/context-menu.ts', [
    unit(
      'context-menu.test.ts',
      'removes the menu when disabled, rejects stale clicks, and restores it when enabled',
    ),
    unit(
      'context-menu.test.ts',
      'builds the menu only while its permission is granted and removes it on revoke',
    ),
    e2e(
      'permission-requests.spec.ts',
      'turning on Context Menu asks for the permission, builds the menu, and a revoke turns it off',
    ),
  ]),
  contextMenuContexts: tested(CONTEXT_MENU, [
    contextMenuOptions,
    unit(
      CONTEXT_MENU_UNIT,
      'shows every item on the contexts Show Menu On lists, links only by default',
    ),
    unit(
      CONTEXT_MENU_UNIT,
      'saves the page from a page or selection click, named after the selection',
    ),
    contextMenuArranged,
    e2e(
      CONTEXT_MENU_E2E,
      'on pages and selections the menu saves the page, named after the selection',
    ),
  ]),
  contextMenuEntries: tested(
    CONTEXT_MENU,
    [
      contextMenuOptions,
      unit(
        CONTEXT_MENU_UNIT,
        'shows the entries in the order Menu Entries lists them, and only those',
      ),
      unit(
        CONTEXT_MENU_UNIT,
        'hides recent folders when Menu Entries leaves them out and restores them live',
      ),
      contextMenuArranged,
    ],
    'Edited in Options > Saving & Search > Right-Click Menu (ContextMenuEntriesPanel).',
  ),
  contextMenuRecentMax: tested(CONTEXT_MENU, [
    unit(
      CONTEXT_MENU_UNIT,
      'shows recent folders limited by Recent Folders in Menu, not the popup max',
    ),
    e2e(CONTEXT_MENU_E2E, 'renaming, deleting, or hiding recent folders rebuilds the menu'),
  ]),
  contextMenuBookmarkNaming: tested('services/context-menu.ts', [
    unit(SETTINGS_UNIT, 'names bookmarks from the page title or the link URL when selected'),
    unit('context-menu.test.ts', 'prefers Firefox linkText, then selection, then page title'),
  ]),
  quickSaveFolderStrategy: tested('services/quick-save.ts', [
    unit(
      'quick-save.test.ts',
      'each strategy picks its own folder and offers ranked, then recent, alternatives',
    ),
    e2e(
      'quick-save.spec.ts',
      'the last used and chosen folder strategies decide where quick save goes',
    ),
  ]),
  quickSaveFixedFolder: tested('services/quick-save.ts', [
    unit('quick-save.test.ts', 'a chosen folder that no longer exists falls back and says so'),
    e2e(
      'quick-save.spec.ts',
      'the last used and chosen folder strategies decide where quick save goes',
    ),
  ]),
  quickSaveCover: tested(QUICK_SAVE_COVER, [
    unit(
      'quick-save.test.ts',
      'keeps none while Save a Cover With Quick Save or Fetch Covers is off',
    ),
    unit(QUICK_SAVE_COVER_UNIT, 'none while the setting or Fetch Covers is off'),
    quickSaveCoverRun,
    e2e(
      QUICK_SAVE_COVER_E2E,
      'quick save keeps no cover with Save a Cover With Quick Save off, Fetch Covers off, or a cover source it cannot meet',
    ),
  ]),
  quickSaveCoverSource: tested(QUICK_SAVE_COVER, [
    unit(
      QUICK_SAVE_COVER_UNIT,
      'Same as Cover Source follows Cover Source; any other choice is quick save only',
    ),
    unit(
      QUICK_SAVE_COVER_UNIT,
      'Screenshot first and Screenshot only keep the picture; Page image only takes none',
    ),
    e2e(
      QUICK_SAVE_COVER_E2E,
      'quick save keeps no cover with Save a Cover With Quick Save off, Fetch Covers off, or a cover source it cannot meet',
    ),
  ]),
  quickSaveCoverExisting: tested(QUICK_SAVE_COVER, [
    unit(
      QUICK_SAVE_COVER_UNIT,
      'keeps the cover the bookmark has, replaces it when told, and never one the user chose',
    ),
  ]),

  // AI context packer
  aiContextPackerEnabled: tested(TOOL_TABLE, [toolFlags]),
  aiContextPackerDefaultScope: tested(TOOL_TABLE, [toolFlags]),
  aiContextPackerOutputFormat: tested(TOOL_OPTIONS, [
    unit('ai-context-pack.test.ts', 'escapes stored metadata in XML and omits missing fields'),
    contextPack,
  ]),
  aiContextPackerIncludeFolderPath: tested(TOOL_OPTIONS, [contextPack]),
  aiContextPackerIncludeDates: tested(TOOL_OPTIONS, [contextPackOptions]),
  aiContextPackerIncludeTags: tested(TOOL_OPTIONS, [contextPack, contextPackOptions]),
  aiContextPackerIncludeSummaries: tested(TOOL_OPTIONS, [contextPack, contextPackOptions]),
  aiContextPackerMaxItems: tested(TOOL_OPTIONS, [contextPackLimits]),
  aiContextPackerMaxDepth: tested(TOOL_OPTIONS, [contextPackLimits]),
  aiContextPackerExcerptLength: tested(TOOL_OPTIONS, [contextPackLimits]),

  // Auto-tagging
  autoTaggingEnabled: tested(TOOL_TABLE, [toolFlags]),
  autoTaggingDefaultScope: {
    status: 'unsupported',
    consumer: TOOL_TABLE,
    reason: 'Auto-tagging only runs on the current folder; the setting is fixed to "folder".',
    tests: [toolFlags],
  },
  autoTaggingMinTags: tested(
    TOOL_OPTIONS,
    [aiPrompts],
    'Prompt-level; provider compliance is not verified.',
  ),
  autoTaggingMaxTags: tested(
    TOOL_OPTIONS,
    [aiPrompts],
    'Prompt-level; provider compliance is not verified.',
  ),
  autoTaggingTagStyle: tested(
    TOOL_OPTIONS,
    [aiPrompts],
    'Prompt-level; provider compliance is not verified.',
  ),
  autoTaggingMergeMode: tested(TOOL_TABLE, [
    metadataMerge,
    unit(
      'bookmark-metadata-storage.test.ts',
      'appends tags without dedupe and replaces tags when requested',
    ),
  ]),
  autoTaggingDedupeTags: tested(TOOL_TABLE, [
    unit(
      'bookmark-metadata-storage.test.ts',
      'appends tags without dedupe and replaces tags when requested',
    ),
  ]),
  autoTaggingSendExistingTags: tested(
    TOOL_OPTIONS,
    [
      unit(
        'prompt-library.test.ts',
        'sends the most used tags only while Send Existing Tags is on, within the configured caps',
      ),
      e2e(
        'prompt-library.spec.ts',
        '[mocked provider contract] auto-tagging sends existing tags and About me only when there is something to send',
      ),
    ],
    'Read by services/prompt-config.ts ({{existingTags}}).',
  ),

  // Summarizer
  summarizerEnabled: tested(TOOL_TABLE, [toolFlags]),
  summarizerDefaultScope: {
    status: 'unsupported',
    consumer: TOOL_TABLE,
    reason: 'The summarizer only runs on the current folder; the setting is fixed to "folder".',
  },
  summarizerSummaryLength: tested(
    TOOL_OPTIONS,
    [
      unit(
        'ai-prompt-settings.test.ts',
        'puts the saved summary length into the summarizer prompt',
      ),
    ],
    'Prompt-level; provider compliance is not verified.',
  ),
  summarizerIncludeDomainHint: tested(TOOL_OPTIONS, [
    unit(
      'ai-bookmark-workflows.test.ts',
      'includes optional domain context and filters unknown or duplicate summarizer results',
    ),
  ]),
  summarizerMergeMode: tested(TOOL_TABLE, [
    metadataMerge,
    unit(
      'bookmark-metadata-storage.test.ts',
      'appends or replaces summaries according to the merge mode',
    ),
  ]),

  // Reorganization
  reorganizationEnabled: tested(TOOL_TABLE, [toolFlags]),
  reorganizationDefaultScope: tested(TOOL_TABLE, [duplicateSettings]),
  reorganizationMinConfidence: tested(TOOL_OPTIONS, [reorgSafety]),
  reorganizationBatchSize: tested(TOOL_OPTIONS, [reorgSafety]),

  // Duplicates
  duplicatesEnabled: tested(TOOL_TABLE, [toolFlags]),
  duplicatesDefaultScope: {
    status: 'unsupported',
    consumer: TOOL_TABLE,
    reason: 'Duplicate scans always cover all bookmarks; the setting is fixed to "all".',
    tests: [fixedScopes],
  },
  duplicatesMatchStrategy: tested(TOOL_OPTIONS, [
    duplicateSettings,
    e2e(
      'tool-data-safety.spec.ts',
      'duplicate cleaner warns before title-only matching removes bookmarks with different URLs',
    ),
  ]),
  duplicatesNormalizeWww: tested(TOOL_OPTIONS, [duplicateSettings]),
  duplicatesIgnoreProtocol: tested(TOOL_OPTIONS, [
    unit(
      'bookmark-duplicates.test.ts',
      'normalizes scheme and host case, default ports, www, protocol, and trailing slash',
    ),
  ]),
  duplicatesIgnoreTrailingSlash: tested(TOOL_OPTIONS, [
    unit(
      'bookmark-duplicates.test.ts',
      'normalizes scheme and host case, default ports, www, protocol, and trailing slash',
    ),
  ]),
  duplicatesKeepRule: tested(TOOL_OPTIONS, [
    e2e(
      'tool-data-safety.spec.ts',
      'duplicate cleaner keeps the newest item it labels Keep and ignores case, port, and query-order lookalikes',
    ),
  ]),
  duplicatesMaxGroups: tested(TOOL_OPTIONS, [
    duplicateSettings,
    unit(SETTINGS_UNIT, 'duplicate scans return at most the saved number of groups'),
  ]),

  // URL cleaner
  urlCleanerEnabled: tested(TOOL_TABLE, [fixedScopes]),
  urlCleanerDefaultScope: tested(TOOL_TABLE, [
    e2e(
      'tool-settings.spec.ts',
      'tools sidebar headings, cards, scopes, and dialogs follow the selected language',
    ),
  ]),
  urlCleanerRemoveHash: tested(TOOL_OPTIONS, [urlCleanerE2e]),
  urlCleanerSortQueryParams: tested(TOOL_OPTIONS, [
    e2e(
      'tool-data-safety.spec.ts',
      'URL cleaner keeps URL encoding, ignores pure reordering, and skips bookmarks edited after the preview',
    ),
  ]),
  urlCleanerDedupeQueryParams: tested(TOOL_OPTIONS, [
    urlCleanerE2e,
    unit('url-cleaner.test.ts', 'dedupes identical key/value pairs only'),
  ]),
  urlCleanerPreserveParams: tested(TOOL_OPTIONS, [urlCleanerE2e]),
  urlCleanerRemoveParams: tested(TOOL_OPTIONS, [urlCleanerE2e]),

  // Dead links
  deadLinksEnabled: tested(TOOL_TABLE, [toolFlags]),
  deadLinksDefaultScope: tested(TOOL_TABLE, [networkRealServer]),
  deadLinksRequestTimeoutMs: tested(TOOL_OPTIONS, [
    unit(SETTINGS_UNIT, 'dead-link scans time out after the saved request timeout'),
  ]),
  deadLinksConcurrency: tested(TOOL_OPTIONS, [
    unit(SETTINGS_UNIT, 'dead-link scans never exceed the saved concurrency'),
  ]),
  deadLinksRetryCount: tested(TOOL_OPTIONS, [networkRealServer]),
  deadLinksFollowRedirects: tested(TOOL_OPTIONS, [networkRealServer]),
  ...Object.fromEntries(
    (['deadLinksOnDead', 'deadLinksOnCheck', 'deadLinksOnRedirect'] as const).map((key) => [
      key,
      tested('components/bookmarks/DeadLinkRepairDialog.lazy.tsx', [
        e2e(
          'tool-dead-link-repair.spec.ts',
          'each category starts on the action its setting names, and a link that cannot do it stays kept',
        ),
      ]),
    ]),
  ),
  deadLinksSuccessStatuses: tested(TOOL_OPTIONS, [
    unit(SETTINGS_UNIT, 'dead-link scans treat only the saved success statuses as reachable'),
  ]),

  // Background tasks
  jobsApplyInBackgroundAbove: tested('services/reviewed-apply.ts', [
    unit(
      'background-apply.test.ts',
      'applies above the Apply in the Background Above setting as a background task, one History record a part (J46)',
    ),
    e2e(
      'background-jobs.spec.ts',
      'reviewed changes above the Apply in the Background Above setting are applied as a background task, one History record a part (J46)',
    ),
  ]),

  // Metadata fetcher
  metadataFetcherEnabled: tested(TOOL_TABLE, [toolFlags]),
  metadataFetcherDefaultScope: tested(TOOL_TABLE, [
    e2e(
      'tool-network.spec.ts',
      'metadata fetcher decodes Shift_JIS, ignores error pages, and applies only reviewed titles',
    ),
  ]),
  metadataFetcherOverwriteTitles: tested(TOOL_OPTIONS, [
    e2e(
      'tool-network.spec.ts',
      'metadata fetcher decodes Shift_JIS, ignores error pages, and applies only reviewed titles',
    ),
  ]),
  metadataFetcherFetchDescriptions: tested(TOOL_OPTIONS, [
    e2e(
      'additional-workflows.spec.ts',
      'metadata fetcher previews mocked page metadata without changing bookmarks',
    ),
  ]),
  metadataFetcherRequestTimeoutMs: tested(TOOL_OPTIONS, [
    e2e(
      'tool-network.spec.ts',
      'metadata fetcher times out on a stalled body, skips non-HTML files, and leaves Running',
    ),
  ]),
  metadataFetcherConcurrency: tested(TOOL_OPTIONS, [
    unit(SETTINGS_UNIT, 'metadata fetches never exceed the saved concurrency'),
  ]),

  // Site icons (requests reuse the Metadata Fetcher's timeout and concurrency)
  siteIconsEnabled: tested(TOOL_TABLE, [toolFlags]),
  siteIconsDefaultScope: tested(TOOL_TABLE, [siteIconsRefresh]),
  siteIconsPreferredSize: tested(TOOL_OPTIONS, [
    unit(SITE_ICONS_UNIT, 'prefers the declared icon closest to the saved preferred size'),
  ]),
  siteIconsMaxIconKb: tested(TOOL_OPTIONS, [
    siteIconsRefresh,
    unit(
      SITE_ICONS_UNIT,
      'rejects icon files over the saved byte cap and files that are not images',
    ),
  ]),
  siteIconsMaxCacheKb: tested(TOOL_TABLE, [
    unit(SITE_ICONS_UNIT, 'evicts the oldest icons to stay within the saved cache limit'),
  ]),

  // Privacy scanner
  privacyScannerEnabled: tested(TOOL_TABLE, [toolFlags]),
  privacyScannerDefaultScope: {
    status: 'unsupported',
    consumer: TOOL_TABLE,
    reason: 'Privacy scans always cover all bookmarks; the setting is fixed to "all".',
  },
  privacyScannerScanTitles: tested(TOOL_OPTIONS, [reportSettings, privacyUnit]),
  privacyScannerScanQueryParams: tested(TOOL_OPTIONS, [privacyUnit]),
  privacyScannerScanFragments: tested(TOOL_OPTIONS, [privacyUnit]),
  privacyScannerSensitiveParams: tested(TOOL_OPTIONS, [
    privacyDetectors,
    unit(
      'page-text-quality.test.ts',
      'never requests an address with a password or a sensitive parameter, and says why',
    ),
  ]),
  privacyScannerEmailDetection: tested(TOOL_OPTIONS, [privacyDetectors]),
  privacyScannerUuidDetection: tested(TOOL_OPTIONS, [privacyDetectors]),

  // Smart Rules
  bookmarkRulesEnabled: tested(TOOL_TABLE, [toolFlags]),
  bookmarkRulesDefaultScope: tested(TOOL_TABLE, [
    e2e(
      'bookmark-rules.spec.ts',
      'a rule made in Settings tags and moves matching bookmarks after a review, and undo puts them back',
    ),
  ]),
  bookmarkRulesAutoTag: tested('services/rule-automation.ts', [
    unit(
      'rule-automation.test.ts',
      'runs each only while its own setting is on, and leaves large batches alone',
    ),
    e2e(
      'bookmark-rules.spec.ts',
      'with Tag New Bookmarks on and new bookmarks from anywhere, a bookmark added in the browser gets its rules tags and stays put, even when a rule may move new bookmarks',
    ),
  ]),
  bookmarkRulesAutoMove: tested('services/rule-automation.ts', [
    unit(
      'rule-automation.test.ts',
      'runs each only while its own setting is on, and leaves large batches alone',
    ),
    e2e(
      'bookmark-rules.spec.ts',
      'with Move New Bookmarks on, a rule set to move new bookmarks moves one added in the browser, logs it, and Undo puts it back',
    ),
  ]),
  bookmarkRulesNewFrom: tested('services/rule-automation.ts', [
    unit(
      'rule-automation.test.ts',
      'by default acts only on bookmarks saved through Bookmark Scout, never moving them',
    ),
    unit(
      'rule-automation.test.ts',
      'defaults to Bookmark Scout only, and in the background uses the stricter setting',
    ),
    e2e(
      'bookmark-rules.spec.ts',
      'with Tag New Bookmarks on and new bookmarks from anywhere, a bookmark added in the browser gets its rules tags and stays put, even when a rule may move new bookmarks',
    ),
  ]),

  // Index Page Text
  pageTextEnabled: tested(TOOL_TABLE, [
    toolFlags,
    e2e(
      'page-text.spec.ts',
      'indexed page text is searchable after the review saves it, sign-in pages are not saved, and Options deletes it, leaving bookmarks, tags, and the History unchanged (S12, S30, S48)',
    ),
    e2e(
      'page-text.spec.ts',
      "the popup indexes the current tab's text only after its preview is saved (S17)",
    ),
  ]),
  pageTextExcludedSites: tested(TOOL_OPTIONS, [
    unit(
      'background-job-adapters.test.ts',
      'never requests a page on a site never to read or its subdomains, and says why',
    ),
    unit('page-text.test.ts', 'never reads a page on a site in Never Read These Sites (S1)'),
    e2e(
      'page-text.spec.ts',
      'Never Read These Sites in Options deletes the text indexed from a site and keeps runs off it, and Refresh outdated reads only out-of-date pages (S1, S2.4)',
    ),
  ]),
  pageTextSkipSecretUrls: tested(TOOL_OPTIONS, [
    unit(
      'page-text-quality.test.ts',
      'reads those addresses like any other with Skip Addresses with Sign-in Details or Secrets off',
    ),
    unit(
      'background-job-adapters.test.ts',
      'freezes Skip Addresses with Sign-in Details or Secrets when the job starts',
    ),
    e2e(
      'page-text.spec.ts',
      'addresses with sign-in details or a token are skipped unrequested until Skip Addresses with Sign-in Details or Secrets is turned off in Options',
    ),
  ]),
  pageTextDefaultScope: tested(TOOL_TABLE, [
    e2e(
      'page-text.spec.ts',
      'indexed page text is searchable after the review saves it, sign-in pages are not saved, and Options deletes it, leaving bookmarks, tags, and the History unchanged (S12, S30, S48)',
    ),
  ]),

  // Fetch Covers
  coversEnabled: tested(TOOL_TABLE, [toolFlags, coversRun]),
  coversDefaultScope: tested(TOOL_TABLE, [coversRun]),
  coversWidthPx: tested(TOOL_OPTIONS, [coversRun]),
  coversMaxImageKb: tested(TOOL_OPTIONS, [coversRun]),
  coversQuality: tested(TOOL_OPTIONS, [
    unit(COVERS_UNIT, 'writes each cover at the Cover Image Quality'),
    unit(
      QUICK_SAVE_COVER_UNIT,
      "Page image first keeps the page's own image, at the cover quality",
    ),
  ]),
  coversMaxCacheMb: tested(TOOL_OPTIONS, [
    unit(COVERS_UNIT, 'remove the oldest past the storage limit'),
  ]),
  coversSourcePreference: tested(BROWSE_COVERS, [
    unit(
      BROWSE_COVERS_UNIT,
      'a fetched page image is kept unless Cover Source puts screenshots first',
    ),
    unit(
      BROWSE_COVERS_UNIT,
      'keeps a fetched page image unless Cover Source puts screenshots first, and takes none with Page image only',
    ),
    unit(
      COVERS_UNIT,
      'fetches over a picture of the tab only when Cover Source ranks the page image first',
    ),
    unit(
      COVERS_UNIT,
      'reads no page with Screenshot only, and the result says page images are off',
    ),
  ]),
  coversBrowseCapture: tested(BROWSE_COVERS, [
    unit(
      BROWSE_COVERS_UNIT,
      'is not taken while the setting is off, Fetch Covers is off, or the access is missing',
    ),
    e2e(
      'browse-covers.spec.ts',
      'Capture Covers While Browsing is off by default and pictures nothing',
    ),
    browseCaptureRun,
  ]),
  coversBrowseCapturePrivate: tested(BROWSE_COVERS, [
    unit(
      BROWSE_COVERS_UNIT,
      'takes a private window only with Also Capture in Private Windows on and the browser allowing the extension there',
    ),
  ]),
  coversBrowseSettleMs: tested(BROWSE_COVERS, [
    unit(
      BROWSE_COVERS_UNIT,
      'waits for the page to settle, and longer while the last picture is recent',
    ),
    browseCaptureRun,
  ]),
  coversBrowseIntervalMs: tested(BROWSE_COVERS, [
    unit(BROWSE_COVERS_UNIT, 'takes one picture at a time, with only the latest page waiting'),
    unit(
      BROWSE_COVERS_UNIT,
      'keeps the Time Between Pictures floor above the browser limit of two pictures a second',
    ),
  ]),
  coversBrowseMaxAgeDays: tested(BROWSE_COVERS, [
    unit(
      BROWSE_COVERS_UNIT,
      'never retakes a picture taken while browsing with Retake Screenshots Older Than at 0',
    ),
    unit(BROWSE_COVERS_UNIT, 'replaces a cover older than the maximum age'),
  ]),
  coversNeverCaptureSites: tested(BROWSE_COVERS, [
    unit(
      BROWSE_COVERS_UNIT,
      'is not taken of a site on Never Capture These Sites, or a page with no bookmark of its address',
    ),
    browseCaptureSkips,
  ]),

  // Statistics
  statisticsEnabled: tested(TOOL_TABLE, [toolFlags]),
  statisticsDefaultScope: tested(TOOL_TABLE, [toolFlags]),
  statisticsIncludeDomains: tested(TOOL_OPTIONS, [statisticsSections]),
  statisticsIncludeFolders: tested(TOOL_OPTIONS, [statisticsSections]),
  statisticsIncludeDuplicates: tested(TOOL_OPTIONS, [statisticsSections]),
  statisticsIncludeProtocols: tested(TOOL_OPTIONS, [statisticsSections]),
  statisticsIncludeDepthBreakdown: tested(TOOL_OPTIONS, [
    e2e(
      'tool-reports.spec.ts',
      'statistics count folders inside the scope and show the depth breakdown only when enabled',
    ),
  ]),
  statisticsTopN: tested(TOOL_OPTIONS, [
    reportSettings,
    unit(SETTINGS_UNIT, 'statistics top lists hold at most the saved top-N entries'),
  ]),

  // Data tools
  dataShowExport: tested(TOOLS, [
    e2e(
      'tool-data-io.spec.ts',
      'export and import cards follow their visibility settings without changing bookmarks',
    ),
  ]),
  dataShowImport: tested(TOOLS, [
    e2e(
      'tool-data-io.spec.ts',
      'export and import cards follow their visibility settings without changing bookmarks',
    ),
  ]),
  dataDefaultExportFormat: tested(DATA_TOOLS, [exportPreferences]),

  // Values that were config, now Settings
  openConfirmAbove: tested('hooks/use-bookmark-opener.ts', [
    e2e(
      'bookmark-manager-keyboard.spec.ts',
      'opening asks first above the Ask Before Opening More Than setting',
    ),
  ]),
  searchHistoryMax: tested('lib/search-history-storage.ts', [
    unit(
      'search-history-storage.test.ts',
      'keeps as many as the Recent Searches Kept setting says',
    ),
  ]),
  quickSaveAlternatives: tested('services/quick-save.ts', [
    unit(
      'quick-save.test.ts',
      'closes the notification and offers as many folders as the quick save settings say',
    ),
  ]),
  quickSaveNotificationMs: tested('services/quick-save.ts', [
    unit(
      'quick-save.test.ts',
      'closes the notification and offers as many folders as the quick save settings say',
    ),
  ]),
  askAiMaxSteps: tested('services/ai-agent.ts', [
    unit(
      'ai-agent.test.ts',
      'stops after as many model calls as the Most Steps per Answer setting',
    ),
  ]),
  readPageSkipPrivateHosts: tested('services/page-reader.ts', [
    unit('page-reader.test.ts', 'reads local network pages only with Skip Local Network Pages off'),
  ]),
};

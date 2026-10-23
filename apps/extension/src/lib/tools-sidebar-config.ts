/**
 * The manager's Tools sidebar layout (config/ui/tools-sidebar.toml): the sections and tools in
 * their default order and the scopes cards start on. Kept apart from the tool table
 * (`tool-definitions.ts`), which carries every tool's scan code, so Options can list the tools for
 * Sidebar Tools without loading them.
 */

import { z } from 'zod';

type SidebarToolId = keyof typeof TOOL_SCOPE_CAPABILITIES;

/** Lists every id of `ids` exactly once, in any order. */
const listsEachOnce = (ids: readonly string[]) => (list: readonly string[]) =>
  list.length === ids.length &&
  new Set(list).size === list.length &&
  ids.every((id) => list.includes(id));

/** Every tool id, from the one table that names each tool's scopes. */
const SIDEBAR_TOOL_IDS = Object.keys(TOOL_SCOPE_CAPABILITIES) as SidebarToolId[];

export const TOOLS_SIDEBAR_CONFIG = readConfig(
  'ui/tools-sidebar',
  z.strictObject({
    sections: z
      .array(z.enum(Object.keys(TOOL_SECTION_TITLES) as [ToolSectionId, ...ToolSectionId[]]))
      .refine(listsEachOnce(Object.keys(TOOL_SECTION_TITLES)), 'must list every section once'),
    tools: z
      .array(z.enum(SIDEBAR_TOOL_IDS as [SidebarToolId, ...SidebarToolId[]]))
      .refine(listsEachOnce(SIDEBAR_TOOL_IDS), 'must list every tool once'),
    top_level_scope: z.enum(['folder', 'all']),
    export_scope: z.enum(['folder', 'all']),
  }),
);

/** Every tool id in its default order. */
export const TOOL_ORDER_IDS: readonly SidebarToolId[] = TOOLS_SIDEBAR_CONFIG.tools;

/**
 * The tools the sidebar shows, in order, as stored in `toolsSidebarOrder`: every tool in its
 * default order while the list is empty, else the tools it names. Turned-off tools are left in.
 */
export function getToolsSidebarOrderIds(stored: readonly string[]): SidebarToolId[] {
  if (stored.length === 0) return [...TOOL_ORDER_IDS];
  return [...new Set(stored)].filter((id): id is SidebarToolId =>
    (SIDEBAR_TOOL_IDS as readonly string[]).includes(id),
  );
}

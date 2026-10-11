/**
 * What every bookmark action is built from: the definition shape, the context a call runs in,
 * the error an action returns instead of throwing, paging, and naming a folder by reference or
 * path. The actions themselves are tables (`read-actions.ts`, `item-actions.ts`); `actions.ts`
 * joins them into the one registry every surface uses: Ask AI's tools, the MCP bridge, and the
 * bookmark manager's menus.
 *
 * Text for the model (agent descriptions, errors, and hints) stays English, and the model answers
 * in the user's language. Everything the user sees (labels, chat steps) goes through `t()`.
 */
import { z } from 'zod';

export const actionLimits = readConfig(
  'ai/actions',
  z.strictObject({
    max_results: z.number().int().positive(),
    max_folders: z.number().int().positive(),
    default_folder_depth: z.number().int().positive(),
    max_folder_depth: z.number().int().positive(),
    max_refs: z.number().int().positive(),
    max_link_checks: z.number().int().positive(),
    max_suggestions: z.number().int().positive(),
    max_candidates: z.number().int().positive(),
    summary_chars: z.number().int().positive(),
    max_page_chars: z.number().int().positive(),
    max_result_chars: z.number().int().positive(),
    search_title_weight: z.number().nonnegative(),
    search_text_weight: z.number().nonnegative(),
  }),
);

/** Who is calling a tool: Ask AI, or a local agent through the MCP bridge, by the name it gave. */
export type ActionClient = { kind: 'askAI' } | { kind: 'external'; name: string };

export type ActionPage = { title: string; url: string };

/** What a tool call may use besides the bookmarks; each caller fills in what it can do. */
export type ActionContext = {
  client: ActionClient;
  settings: Settings;
  /** The page in the active tab, when this context can see it. */
  activeTab: () => Promise<ActionPage | undefined>;
  /** Reads a page's text; absent while Read page content is off or not allowed. */
  readPage?: (url: string) => Promise<{ title?: string; text: string } | undefined>;
};

export type ActionErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'ambiguous'
  | 'not_allowed'
  | 'unavailable'
  | 'too_large'
  | 'failed';

/** A tool's answer when it cannot do what was asked, saying why and what to try instead. */
export type ActionError = {
  error: {
    code: ActionErrorCode;
    message: string;
    hint?: string;
    candidates?: ActionFolder[];
  };
};

export function actionError(
  code: ActionErrorCode,
  message: string,
  extra: { hint?: string; candidates?: ActionFolder[] } = {},
): ActionError {
  return { error: { code, message, ...extra } };
}

export function isActionError(value: unknown): value is ActionError {
  return isPlainObject(value) && isPlainObject(value.error) && typeof value.error.code === 'string';
}

/**
 * How much an action can change: `read` only looks, `write` changes bookmarks and can be undone,
 * `destructive` removes something and always asks first. Approval rules follow from it.
 */
export type ActionRisk = 'read' | 'write' | 'destructive';

/** What an action acts on, so a surface offers it only where that is at hand. */
export type ActionTarget = 'library' | 'bookmark' | 'folder' | 'page' | 'url';

/** How an action is offered to AI agents (Ask AI and local agents through the MCP bridge). */
export type ActionAgentExposure = {
  /** For the model: what the action does and when to use it. */
  description: string;
  /**
   * Its results carry text from web pages or other sources nobody reviewed. Once such a result
   * is in a conversation, every write asks the user first.
   */
  untrusted?: boolean;
};

/** The icon an action shows in menus, by name; the menus map names to components. */
export type ActionIconName =
  | 'appWindow'
  | 'bookmarkPlus'
  | 'clipboardPaste'
  | 'copy'
  | 'externalLink'
  | 'folderPlus'
  | 'folderSearch'
  | 'hash'
  | 'info'
  | 'link'
  | 'pencil'
  | 'scissors'
  | 'sortAZ'
  | 'trash'
  | 'venetianMask';

/** Running an action with input, as AI agents, chat buttons, and the MCP bridge do. */
export type ActionCall<Input, Output> = {
  input: z.ZodType<Input>;
  output: z.ZodType<Output>;
  /** Why the action cannot run in this context, beyond its permission, or nothing. */
  unavailable?: (context: ActionContext) => Promise<ActionError | undefined>;
  /** What a call did, in the user's language, such as the chat's step text. */
  describe: (input: Partial<Input>) => string;
  execute: (input: Input, context: ActionContext) => Promise<Output | ActionError>;
};

/**
 * One bookmark action. Every surface takes what it needs from the same entry: a call for agents
 * and buttons, `itemMenu` and `folderMenu` for the manager's menus (`action-menus.ts`).
 */
export type ActionDefinition<Input = unknown, Output = unknown> = {
  risk: ActionRisk;
  targets: readonly ActionTarget[];
  /** An optional permission it needs; it is not offered, and refuses, while that is missing. */
  permission?: PermissionFeature;
  /** What menus and settings call it. */
  labelKey?: MessageKey;
  icon?: ActionIconName;
  /** Present when AI agents may call it. */
  agent?: ActionAgentExposure;
  itemMenu?: ActionItemMenu;
  folderMenu?: ActionFolderMenu;
} & (ActionCall<Input, Output> | { [Key in keyof ActionCall<Input, Output>]?: never });

/** What the model is told when an action's permission is missing, by permission feature. */
export const PERMISSION_HINTS: Partial<Record<PermissionFeature, string>> = {
  webAccess:
    'The user can allow website access by running Check Dead Links once in the Tools sidebar.',
  pageReading: 'The user can turn on Read page content in Bookmark Scout Options, AI.',
  currentTab: 'The user can let Bookmark Scout see the current tab from the side panel.',
};

/** Keeps a callable definition's input and output types tied together. */
export function defineAction<Input, Output>(
  definition: ActionDefinition<Input, Output> & ActionCall<Input, Output>,
): ActionDefinition<Input, Output> & ActionCall<Input, Output> {
  return definition;
}

/** An action only the menus offer, without a call. */
export function defineMenuAction(
  definition: ActionDefinition & { labelKey: MessageKey; icon: ActionIconName },
): ActionDefinition & { labelKey: MessageKey; icon: ActionIconName } {
  return definition;
}

/** A page of `items` from the opaque `cursor`, with the cursor for the next page. */
export function pageOf<T>(
  items: readonly T[],
  cursor: string | undefined,
  size: number,
): { items: T[]; total: number; nextCursor?: string } | ActionError {
  const offset = cursor === undefined ? 0 : Number(cursor);
  if (!Number.isInteger(offset) || offset < 0 || offset > items.length) {
    return actionError('invalid_input', `The cursor "${cursor}" is not valid.`, {
      hint: 'Pass nextCursor exactly as a previous result gave it, or leave it out to start over.',
    });
  }
  const end = offset + size;
  return {
    items: items.slice(offset, end),
    total: items.length,
    ...(end < items.length ? { nextCursor: String(end) } : {}),
  };
}

/** The folder a reference or path names, or an error with candidates to choose from. */
export function resolveActionFolder(
  library: ActionLibrary,
  spec: string,
): LibraryFolder | ActionError {
  const candidates = (folders: readonly LibraryFolder[]) =>
    folders
      .slice(0, actionLimits.max_candidates)
      .map((folder) => toActionFolder(folder, { counts: false }));
  const ref = parseActionRef(spec);
  if (ref) {
    if (ref.kind !== 'folder') {
      return actionError('invalid_input', `${spec} is a bookmark, not a folder.`, {
        hint: 'Pass its folderRef instead.',
      });
    }
    return (
      library.folderById.get(ref.id) ??
      actionError('not_found', `There is no folder ${spec}; it may have been deleted.`, {
        hint: 'Call listFolders for current folder references.',
      })
    );
  }
  const matches = findFoldersByPath(library, spec);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return actionError('ambiguous', `Several folders match "${spec}".`, {
      hint: 'Pass one of the candidates by its ref, or its full path.',
      candidates: candidates(matches),
    });
  }
  const similar = findSimilarFolders(library, spec);
  return actionError('not_found', `No folder matches "${spec}".`, {
    hint:
      similar.length > 0
        ? 'Did you mean one of the candidates? Pass its ref.'
        : 'Call listFolders to see the folder paths.',
    ...(similar.length > 0 ? { candidates: candidates(similar) } : {}),
  });
}

/** Maps a list result's paging fields onto the output the model reads, with a narrowing hint. */
export function pagingFields(
  page: { total: number; nextCursor?: string },
  shown: number,
  narrow: string,
): { total: number; nextCursor?: string; note?: string } {
  return {
    total: page.total,
    ...(page.nextCursor
      ? {
          nextCursor: page.nextCursor,
          note: `Showing ${shown} of ${page.total}. ${narrow} Or pass nextCursor for the next page.`,
        }
      : {}),
  };
}

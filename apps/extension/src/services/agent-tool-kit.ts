/**
 * What every agent tool is built from: the definition shape, the context a call runs in, the
 * error a tool returns instead of throwing, paging, and naming a folder by reference or path.
 * The tools themselves are tables in `agent-read-tools.ts`; `agent-tools.ts` joins them into the
 * one registry Ask AI and the MCP bridge use.
 *
 * Text here is for the model, not the user: tool descriptions, errors, and hints stay English,
 * and the model answers in the user's language. Steps the chat shows go through `t()`.
 */
import { z } from 'zod';

export const agentToolsConfig = readConfig(
  'ai/agent-tools',
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
export type AgentClient = { kind: 'askAI' } | { kind: 'external'; name: string };

export type AgentPage = { title: string; url: string };

/** What a tool call may use besides the bookmarks; each caller fills in what it can do. */
export type AgentToolContext = {
  client: AgentClient;
  settings: Settings;
  /** The page in the active tab, when this context can see it. */
  activeTab: () => Promise<AgentPage | undefined>;
  /** Reads a page's text; absent while Read page content is off or not allowed. */
  readPage?: (url: string) => Promise<{ title?: string; text: string } | undefined>;
};

export type AgentToolErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'ambiguous'
  | 'not_allowed'
  | 'unavailable'
  | 'too_large'
  | 'failed';

/** A tool's answer when it cannot do what was asked, saying why and what to try instead. */
export type AgentToolError = {
  error: {
    code: AgentToolErrorCode;
    message: string;
    hint?: string;
    candidates?: AgentFolder[];
  };
};

export function agentToolError(
  code: AgentToolErrorCode,
  message: string,
  extra: { hint?: string; candidates?: AgentFolder[] } = {},
): AgentToolError {
  return { error: { code, message, ...extra } };
}

export function isAgentToolError(value: unknown): value is AgentToolError {
  return isPlainObject(value) && isPlainObject(value.error) && typeof value.error.code === 'string';
}

/**
 * `read` tools only look; `write` tools change bookmarks and follow the approval rules in
 * `agent-tools.ts`.
 */
export type AgentToolKind = 'read' | 'write';

export type AgentToolDefinition<Input = unknown, Output = unknown> = {
  kind: AgentToolKind;
  /** For the model: what the tool does and when to use it. */
  description: string;
  input: z.ZodType<Input>;
  output: z.ZodType<Output>;
  /**
   * Its results carry text from web pages or other sources nobody reviewed. Once such a result
   * is in a conversation, every write asks the user first.
   */
  untrusted?: boolean;
  /** Why the tool cannot run in this context, or nothing when it can. */
  unavailable?: (context: AgentToolContext) => Promise<AgentToolError | undefined>;
  /** The step the chat shows for a call, in the user's language. */
  describe: (input: Partial<Input>) => string;
  execute: (input: Input, context: AgentToolContext) => Promise<Output | AgentToolError>;
};

/** Keeps each definition's input and output types tied together. */
export function defineAgentTool<Input, Output>(
  definition: AgentToolDefinition<Input, Output>,
): AgentToolDefinition<Input, Output> {
  return definition;
}

/** A page of `items` from the opaque `cursor`, with the cursor for the next page. */
export function pageOf<T>(
  items: readonly T[],
  cursor: string | undefined,
  size: number,
): { items: T[]; total: number; nextCursor?: string } | AgentToolError {
  const offset = cursor === undefined ? 0 : Number(cursor);
  if (!Number.isInteger(offset) || offset < 0 || offset > items.length) {
    return agentToolError('invalid_input', `The cursor "${cursor}" is not valid.`, {
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
export function resolveAgentFolder(
  library: AgentLibrary,
  spec: string,
): LibraryFolder | AgentToolError {
  const candidates = (folders: readonly LibraryFolder[]) =>
    folders
      .slice(0, agentToolsConfig.max_candidates)
      .map((folder) => toAgentFolder(folder, { counts: false }));
  const ref = parseAgentRef(spec);
  if (ref) {
    if (ref.kind !== 'folder') {
      return agentToolError('invalid_input', `${spec} is a bookmark, not a folder.`, {
        hint: 'Pass its folderRef instead.',
      });
    }
    return (
      library.folderById.get(ref.id) ??
      agentToolError('not_found', `There is no folder ${spec}; it may have been deleted.`, {
        hint: 'Call listFolders for current folder references.',
      })
    );
  }
  const matches = findFoldersByPath(library, spec);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return agentToolError('ambiguous', `Several folders match "${spec}".`, {
      hint: 'Pass one of the candidates by its ref, or its full path.',
      candidates: candidates(matches),
    });
  }
  const similar = findSimilarFolders(library, spec);
  return agentToolError('not_found', `No folder matches "${spec}".`, {
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

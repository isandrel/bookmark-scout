/**
 * Suggestion buttons under an Ask AI answer: next questions, saving a page to a folder, options to
 * choose from, and opening or showing a bookmark. The model calls `suggestActions` with a list;
 * this action only checks it against the library (no side effects) and returns the buttons as
 * they will work, and the chat draws them (`ChatSuggestions.lazy.tsx`). A click is the user's
 * choice: a question or option is sent as their next message, and a save runs the
 * `saveBookmark` action, with its undo, without another approval.
 *
 * Folders are named by ref or path and resolved against the real tree; a suggestion whose folder
 * or bookmark does not exist is left out and counted in `dropped`, so a button never points
 * somewhere else than it says. Button text from the model is plain text, cut to a configured
 * length (`config/ai/agent.toml`), and save, open, and show buttons are labeled by the extension.
 */
import { z } from 'zod';

const label = z.string().trim().min(1).describe("Short button text in the user's language");
const text = z.string().trim().min(1).describe('The message sent when the user clicks it');

const suggestionInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ask'), label, text }).describe('A next question the user may ask'),
  z
    .object({ kind: z.literal('option'), label, text })
    .describe('One of several ideas or choices; clicking sends `text` to act on or ask about it'),
  z
    .object({
      kind: z.literal('save'),
      url: z.string().optional().describe('The page to save; the current page when left out'),
      title: z.string().trim().optional(),
      folder: z.string().min(1).describe('An existing folder: its ref (f:<id>) or full path'),
      newFolder: z.string().trim().min(1).optional().describe('A new folder to create inside it'),
    })
    .describe('Save a page to a folder'),
  z.object({ kind: z.literal('open'), ref: z.string() }).describe('Open a bookmark (b:<id>)'),
  z
    .object({ kind: z.literal('show'), ref: z.string() })
    .describe('Show a bookmark or folder (b:<id> or f:<id>) in the bookmark manager'),
]);

const suggestionOutput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ask'), label: z.string(), text: z.string() }),
  z.object({ kind: z.literal('option'), label: z.string(), text: z.string() }),
  z.object({
    kind: z.literal('save'),
    url: z.string(),
    title: z.string(),
    folderRef: z.string(),
    folderPath: z.string(),
    newFolder: z.string().optional(),
  }),
  z.object({ kind: z.literal('open'), ref: z.string(), title: z.string(), url: z.string() }),
  z.object({
    kind: z.literal('show'),
    ref: z.string(),
    title: z.string(),
    /** The folder the manager opens: the folder itself, or the one holding the bookmark. */
    folderId: z.string(),
  }),
]);

export type ChatSuggestion = z.infer<typeof suggestionOutput>;

const cut = (value: string, max: number) => truncateText(value.replace(/\s+/g, ' '), max);

/** The button a suggestion becomes, or why it is left out. */
async function resolveSuggestion(
  suggestion: z.infer<typeof suggestionInput>,
  library: ActionLibrary,
  context: ActionContext,
): Promise<ChatSuggestion | string> {
  const { suggestion_label_chars: labelChars, suggestion_text_chars: textChars } = ASK_AI_CONFIG;
  switch (suggestion.kind) {
    case 'ask':
    case 'option':
      return {
        kind: suggestion.kind,
        label: cut(suggestion.label, labelChars),
        text: cut(suggestion.text, textChars),
      };
    case 'save': {
      const page = suggestion.url
        ? { url: suggestion.url, title: suggestion.title ?? '' }
        : await context.activeTab();
      if (!page || !isWebUrl(page.url)) return 'There is no web page to save.';
      const folder = resolveActionFolder(library, suggestion.folder);
      if (isActionError(folder)) return folder.error.message;
      if (folder.node.unmodifiable) return `${folder.path} is managed by the browser.`;
      return {
        kind: 'save',
        url: page.url,
        title: cut(suggestion.title || page.title || page.url, textChars),
        folderRef: toFolderRef(folder.node.id),
        folderPath: folder.path,
        ...(suggestion.newFolder ? { newFolder: cut(suggestion.newFolder, labelChars) } : {}),
      };
    }
    case 'open': {
      const ref = parseActionRef(suggestion.ref);
      const bookmark = ref?.kind === 'bookmark' ? library.bookmarkById.get(ref.id) : undefined;
      if (!bookmark?.node.url || !isWebUrl(bookmark.node.url)) {
        return `There is no bookmark ${suggestion.ref} to open.`;
      }
      return {
        kind: 'open',
        ref: suggestion.ref,
        title: cut(bookmark.node.title || bookmark.node.url, labelChars),
        url: bookmark.node.url,
      };
    }
    case 'show': {
      const ref = parseActionRef(suggestion.ref);
      const folder = ref?.kind === 'folder' ? library.folderById.get(ref.id) : undefined;
      const bookmark = ref?.kind === 'bookmark' ? library.bookmarkById.get(ref.id) : undefined;
      const target = folder ?? bookmark?.folder;
      if (!target) return `There is no bookmark or folder ${suggestion.ref}.`;
      const title = folder?.node.title ?? bookmark?.node.title ?? '';
      return {
        kind: 'show',
        ref: suggestion.ref,
        title: cut(getBookmarkDisplayTitle(title), labelChars),
        folderId: target.node.id,
      };
    }
  }
}

const suggestActions = defineAction({
  risk: 'read',
  labelKey: 'actionName_suggestActions',
  targets: ['library', 'page'],
  agent: {
    description:
      'Offer the user buttons under your answer, at most ' +
      `${ASK_AI_CONFIG.max_suggestions}: next questions they may ask, saving a page to a ` +
      'folder (the current page unless you give a URL), a few options or ideas to choose from, ' +
      'or opening or showing a bookmark. Nothing happens until the user clicks one. Call it ' +
      'once, at the end of an answer, only when the buttons help; label them in the language ' +
      'the user writes in.',
  },
  input: z.object({
    suggestions: z.array(suggestionInput).min(1).max(ASK_AI_CONFIG.max_suggestions),
  }),
  output: z.object({
    suggestions: z.array(suggestionOutput),
    dropped: z.array(z.string()).describe('Why suggestions were left out'),
  }),
  describe: () => t('askAI_toolSuggest'),
  async execute(input, context) {
    const library = await loadActionLibrary();
    const suggestions: ChatSuggestion[] = [];
    const dropped: string[] = [];
    for (const suggestion of input.suggestions) {
      const resolved = await resolveSuggestion(suggestion, library, context);
      if (typeof resolved === 'string') dropped.push(resolved);
      else suggestions.push(resolved);
    }
    return { suggestions, dropped };
  },
});

export const CHAT_ACTIONS = { suggestActions };

/** The name the suggestion action is registered under, which the chat draws as buttons. */
export const SUGGEST_ACTIONS_ID = 'suggestActions';

/** The buttons in a `suggestActions` result, or none when it is not one. */
export function readChatSuggestions(output: unknown): ChatSuggestion[] {
  const parsed = z.object({ suggestions: z.array(suggestionOutput) }).safeParse(output);
  return parsed.success ? parsed.data.suggestions : [];
}

/**
 * The suggestion buttons under an Ask AI answer (`suggestActions`, `services/chat-actions.ts`).
 * A question or option is sent as the user's next message; a save runs the `saveBookmark` action
 * with its undo, the click being the user's approval; open and show open a tab. Model text is
 * shown as plain text. Buttons wait while the chat answers and each works once. Loaded with the
 * chat, so it is left out of auto-imports like every `*.lazy.tsx` file.
 */
import {
  BookmarkPlus,
  ExternalLink,
  FolderSearch,
  Lightbulb,
  type LucideIcon,
  MessageCircleQuestion,
} from 'lucide-react';
import { useState } from 'react';

type ChatSuggestionsProps = {
  suggestions: ChatSuggestion[];
  /** The chat is answering; buttons wait. */
  busy: boolean;
  /** Sends `text` as the user's next message. */
  send: (text: string) => void;
};

const ICONS: Record<ChatSuggestion['kind'], LucideIcon> = {
  ask: MessageCircleQuestion,
  option: Lightbulb,
  save: BookmarkPlus,
  open: ExternalLink,
  show: FolderSearch,
};

/** What each kind of button says: the model's words for questions and options only. */
function buttonText(suggestion: ChatSuggestion): string {
  switch (suggestion.kind) {
    case 'ask':
    case 'option':
      return suggestion.label;
    case 'save':
      return suggestion.newFolder
        ? t('askAI_suggestSaveNew', [
            `${suggestion.folderPath}${AI_FOLDER_PATH_SEPARATOR}${suggestion.newFolder}`,
          ])
        : t('askAI_suggestSave', suggestion.folderPath);
    case 'open':
      return t('askAI_suggestOpen', suggestion.title);
    case 'show':
      return t('askAI_suggestShow', suggestion.title);
  }
}

async function saveSuggested(suggestion: Extract<ChatSuggestion, { kind: 'save' }>) {
  const settings = await getSettings();
  const result = await runAction(
    'saveBookmark',
    {
      url: suggestion.url,
      title: suggestion.title,
      folder: suggestion.folderRef,
      ...(suggestion.newFolder ? { newFolder: suggestion.newFolder } : {}),
    },
    await createAskAIToolContext(settings),
  );
  if (isActionError(result)) {
    toast.error({ title: t('askAI_saveFailed'), description: result.error.message });
    return;
  }
  const saved = result as { folder: string; created: boolean; change?: string };
  if (!saved.created) {
    toast({ title: t('askAI_alreadySaved', saved.folder) });
    return;
  }
  const change = saved.change;
  const title = t('askAI_savedTo', saved.folder);
  if (!change) {
    toast.success({ title });
    return;
  }
  toast.withUndo({
    title,
    onUndo: async () => {
      try {
        await undoBookmarkChange(change);
      } catch (error) {
        toast.error({ title: t('toast_undoChanged'), description: getErrorMessage(error) });
      }
    },
  });
}

async function runSuggestion(suggestion: ChatSuggestion, send: (text: string) => void) {
  switch (suggestion.kind) {
    case 'ask':
    case 'option':
      send(suggestion.text);
      return;
    case 'save':
      await saveSuggested(suggestion);
      return;
    case 'open':
      await openUrl(suggestion.url, (await getSettings()).linkOpenTarget);
      return;
    case 'show':
      await browser.tabs.create({
        url: browser.runtime.getURL(
          `${BOOKMARK_MANAGER_PATH}?${MANAGER_FOLDER_PARAM}=${encodeURIComponent(suggestion.folderId)}`,
        ),
      });
      return;
  }
}

export function ChatSuggestions({ suggestions, busy, send }: ChatSuggestionsProps) {
  const [used, setUsed] = useState<ReadonlySet<number>>(new Set());
  if (suggestions.length === 0) return null;
  return (
    <ul
      aria-label={t('askAI_suggestions')}
      data-testid="ask-ai-suggestions"
      className="flex flex-wrap gap-1.5"
    >
      {suggestions.map((suggestion, index) => {
        const Icon = ICONS[suggestion.kind];
        const text = buttonText(suggestion);
        return (
          <li key={`${suggestion.kind}:${text}`}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-kind={suggestion.kind}
              disabled={busy || used.has(index)}
              className="h-auto max-w-full whitespace-normal py-1 text-left [overflow-wrap:anywhere]"
              onClick={() => {
                setUsed((current) => new Set(current).add(index));
                void runSuggestion(suggestion, send).catch((error: unknown) =>
                  toast.error({ title: t('error_generic'), description: getErrorMessage(error) }),
                );
              }}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              {text}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

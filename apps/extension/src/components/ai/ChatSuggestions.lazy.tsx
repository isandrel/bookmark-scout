/**
 * The suggestion buttons under an Ask AI answer (`suggestActions`, `services/chat-actions.ts`).
 * A question or option is sent as the user's next message; a save runs the `saveBookmark` action
 * with its undo, the click being the user's approval, unless the suggestion asks for one
 * (`approval`, once the chat has read unreviewed text): then the click shows Ask AI's approval
 * card naming the page and folder, and the page is saved only once it is approved. Open and show
 * open a tab. A save button names the page by title and site, with the full URL in its tooltip.
 * Model text is shown as plain text. Buttons wait while the chat answers and each works once.
 * Loaded with the chat, so it is left out of auto-imports like every `*.lazy.tsx` file.
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
import { ActionApprovalRequest } from './ActionApproval.lazy';

type SaveSuggestion = Extract<ChatSuggestion, { kind: 'save' }>;

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
        ? t('askAI_suggestSaveNew', [saveFolderPath(suggestion)])
        : t('askAI_suggestSave', suggestion.folderPath);
    case 'open':
      return t('askAI_suggestOpen', suggestion.title);
    case 'show':
      return t('askAI_suggestShow', suggestion.title);
  }
}

function saveFolderPath(suggestion: SaveSuggestion): string {
  return suggestion.newFolder
    ? `${suggestion.folderPath}${AI_FOLDER_PATH_SEPARATOR}${suggestion.newFolder}`
    : suggestion.folderPath;
}

/** The page a save button saves: its title and site, or only the site when it has no title. */
function savePageLabel(suggestion: SaveSuggestion): string {
  const host = getUrlHostname(suggestion.url);
  return suggestion.title === suggestion.url
    ? host
    : t('askAI_savePage', [getBookmarkDisplayTitle(suggestion.title), host]);
}

async function saveSuggested(suggestion: SaveSuggestion) {
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
  const page = await quoteToastItemTitle(suggestion.title);
  if (!saved.created) {
    toast({ title: t('askAI_alreadySavedPage', [page, saved.folder]) });
    return;
  }
  const change = saved.change;
  const title = t('askAI_savedPageTo', [page, saved.folder]);
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

/** A stable ref callback, so the card scrolls into view once, when it opens. */
function bringIntoView(node: HTMLElement | null) {
  node?.scrollIntoView({ block: 'nearest' });
}

function reportFailure(error: unknown) {
  toast.error({ title: t('error_generic'), description: getErrorMessage(error) });
}

export function ChatSuggestions({ suggestions, busy, send }: ChatSuggestionsProps) {
  const [used, setUsed] = useState<ReadonlySet<number>>(new Set());
  // The save waiting for the user to confirm it, by its index.
  const [confirming, setConfirming] = useState<number | null>(null);
  if (suggestions.length === 0) return null;
  const pending = confirming === null ? undefined : suggestions[confirming];

  const markUsed = (index: number, isUsed: boolean) =>
    setUsed((current) => {
      const next = new Set(current);
      if (isUsed) next.add(index);
      else next.delete(index);
      return next;
    });

  return (
    <div className="space-y-2">
      <ul
        aria-label={t('askAI_suggestions')}
        data-testid="ask-ai-suggestions"
        className="flex flex-wrap gap-1.5"
      >
        {suggestions.map((suggestion, index) => {
          const Icon = ICONS[suggestion.kind];
          const text = buttonText(suggestion);
          const save = suggestion.kind === 'save' ? suggestion : undefined;
          return (
            <li key={`${suggestion.kind}:${text}:${save?.url ?? ''}`} className="max-w-full">
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-kind={suggestion.kind}
                title={save?.url}
                disabled={busy || used.has(index) || confirming !== null}
                className="h-auto max-w-full whitespace-normal py-1 text-left [overflow-wrap:anywhere]"
                onClick={() => {
                  markUsed(index, true);
                  if (save?.approval) {
                    setConfirming(index);
                    return;
                  }
                  void runSuggestion(suggestion, send).catch(reportFailure);
                }}
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                {save ? (
                  <span className="flex min-w-0 flex-col">
                    <span>{text}</span>
                    <span
                      data-slot="save-page"
                      className="truncate text-xs font-normal text-muted-foreground"
                    >
                      {savePageLabel(save)}
                    </span>
                  </span>
                ) : (
                  text
                )}
              </Button>
            </li>
          );
        })}
      </ul>
      {pending?.kind === 'save' && confirming !== null && (
        // Brought into view when it opens; the chat list scrolls only as messages grow.
        <div ref={bringIntoView}>
          <ActionApprovalRequest
            toolName="saveBookmark"
            input={{
              url: pending.url,
              title: pending.title,
              folder: pending.folderPath,
              ...(pending.newFolder ? { newFolder: pending.newFolder } : {}),
            }}
            reason={pending.approval}
            onRespond={(approved) => {
              const index = confirming;
              setConfirming(null);
              if (!approved) {
                markUsed(index, false);
                return;
              }
              void saveSuggested(pending).catch(reportFailure);
            }}
          />
        </div>
      )}
    </div>
  );
}

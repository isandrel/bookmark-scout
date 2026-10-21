/**
 * The suggestion buttons of the latest Ask AI answer (`suggestActions`,
 * `services/chat-actions.ts`), docked between the conversation and the message box once the
 * answer is complete (`AskAIPanel.lazy.tsx` mounts it per answer, with `latestChatSuggestions`).
 * Actions (save, open, show) come first as buttons; next questions and options follow as chips,
 * next to the box they fill. The dock hides while the user types and comes back when the box is
 * empty again.
 *
 * A question or option is sent as the user's next message; a save runs the `saveBookmark` action
 * with its undo, the click being the user's approval, unless the suggestion asks for one
 * (`approval`, once the chat has read unreviewed text): then the click shows Ask AI's approval
 * card naming the page and folder, and the page is saved only once it is approved. Open and show
 * open a tab. A save button names the page by title and site, with the full URL in its tooltip.
 * Model text is shown as plain text. Each button works once.
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
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ActionApprovalRequest } from './ActionApproval.lazy';

const dockConfig = readConfig(
  'ui/ask-ai-suggestions',
  z.strictObject({ max_height_fraction: z.number().gt(0).max(1) }),
);

type SaveSuggestion = Extract<ChatSuggestion, { kind: 'save' }>;

type ChatSuggestionsProps = {
  suggestions: ChatSuggestion[];
  /** Sends `text` as the user's next message. */
  send: (text: string) => void;
  /** The user is writing a message of their own; the dock steps aside unless a save waits. */
  typing: boolean;
};

/** Kinds sent as the user's next message, drawn as chips; the rest act and are buttons. */
const MESSAGE_KINDS: ReadonlySet<ChatSuggestion['kind']> = new Set(['ask', 'option']);

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

function reportFailure(error: unknown) {
  toast.error({ title: t('error_generic'), description: getErrorMessage(error) });
}

export function ChatSuggestions({ suggestions, send, typing }: ChatSuggestionsProps) {
  const [used, setUsed] = useState<ReadonlySet<number>>(new Set());
  // The save waiting for the user to confirm it, by its index.
  const [confirming, setConfirming] = useState<number | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  // Shows the approval card when it opens. The dock scrolls itself; scrollIntoView would also
  // scroll the popup.
  useEffect(() => {
    const dock = dockRef.current;
    if (dock && confirming !== null) dock.scrollTop = dock.scrollHeight;
  }, [confirming]);

  if (suggestions.length === 0) return null;
  const pending = confirming === null ? undefined : suggestions[confirming];

  const markUsed = (index: number, isUsed: boolean) =>
    setUsed((current) => {
      const next = new Set(current);
      if (isUsed) next.add(index);
      else next.delete(index);
      return next;
    });

  // Actions first, then the chips that fill the message box, nearest to it; each keeps the
  // model's order within its group.
  const indexed = suggestions.map((suggestion, index) => ({ suggestion, index }));
  const ordered = [
    ...indexed.filter(({ suggestion }) => !MESSAGE_KINDS.has(suggestion.kind)),
    ...indexed.filter(({ suggestion }) => MESSAGE_KINDS.has(suggestion.kind)),
  ];

  return (
    <div
      ref={dockRef}
      data-testid="ask-ai-suggestion-dock"
      // A save waiting for approval stays on screen while the user types.
      hidden={typing && confirming === null}
      className="shrink-0 space-y-2 overflow-y-auto px-2 pt-2"
      style={{ maxHeight: `${dockConfig.max_height_fraction * PERCENT}%` }}
    >
      <ul
        aria-label={t('askAI_suggestions')}
        data-testid="ask-ai-suggestions"
        className="flex flex-wrap gap-1.5"
      >
        {ordered.map(({ suggestion, index }) => {
          const Icon = ICONS[suggestion.kind];
          const text = buttonText(suggestion);
          const save = suggestion.kind === 'save' ? suggestion : undefined;
          const chip = MESSAGE_KINDS.has(suggestion.kind);
          return (
            <li key={`${suggestion.kind}:${text}:${save?.url ?? ''}`} className="max-w-full">
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-kind={suggestion.kind}
                title={save?.url}
                disabled={used.has(index) || confirming !== null}
                className={
                  chip
                    ? 'h-auto min-h-6 max-w-full gap-1.5 whitespace-normal rounded-full px-2.5 py-0.5 text-left text-xs font-normal [overflow-wrap:anywhere]'
                    : 'h-auto max-w-full whitespace-normal py-1 text-left [overflow-wrap:anywhere]'
                }
                onClick={() => {
                  markUsed(index, true);
                  if (save?.approval) {
                    setConfirming(index);
                    return;
                  }
                  void runSuggestion(suggestion, send).catch(reportFailure);
                }}
              >
                <Icon
                  aria-hidden="true"
                  className={chip ? 'size-3 shrink-0' : 'size-3.5 shrink-0'}
                />
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
      )}
    </div>
  );
}

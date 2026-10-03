/**
 * Ask AI in the popup and side panel. The chat (AskAIPanel.lazy.tsx) needs the AI SDK and the
 * Markdown renderer, so it loads when Ask AI first opens instead of with every page.
 */
import { Loader2 } from 'lucide-react';
import { lazy, Suspense } from 'react';

export type AskAIPanelProps = { onClose: () => void };

const AskAIChat = lazy(() =>
  import('./AskAIPanel.lazy').then((module) => ({ default: module.AskAIChat })),
);

export function AskAIPanel(props: AskAIPanelProps) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="flex h-full items-center justify-center">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AskAIChat {...props} />
    </Suspense>
  );
}

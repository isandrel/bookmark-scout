import { Sparkles } from 'lucide-react';

/**
 * One line above the popup and side panel footer while AI Features is on but the default service
 * is not set up (`useAISetup`), in place of the AI buttons, which would only fail. Its link opens
 * the AI settings. It takes the place of the quick save notices, so the footer shows one line.
 */
export function AISetupNotice() {
  const message = t('aiOnboard_setupNotice');
  return (
    <section
      aria-label={message}
      data-testid="ai-setup-notice"
      className="flex h-7 shrink-0 items-center gap-1.5 border-t pl-3 pr-1 text-xs text-muted-foreground"
    >
      <Sparkles aria-hidden="true" className="size-3.5 shrink-0 text-ai" />
      <span className="min-w-0 truncate" title={message}>
        {message}
      </span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        className="shrink-0 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => void openAISettings()}
      >
        {t('aiOnboard_finishSetup')}
      </button>
    </section>
  );
}

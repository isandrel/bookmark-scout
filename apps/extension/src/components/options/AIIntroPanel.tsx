/**
 * Options > AI, above the AI Features switch: what AI does here, what it needs (an account with an
 * AI company and its key, or a free model on this computer), what it may cost, and what is sent.
 * Options shows it until the default AI service is set up (`useAIServiceSetUp`). The same facts as the
 * AI Features description and the privacy policy, in plainer words.
 */

import type { LucideIcon } from 'lucide-react';
import { BookOpen, Coins, ExternalLink, KeyRound, Send, Sparkles } from 'lucide-react';
import { z } from 'zod';

const onboardingConfig = readConfig(
  'ai/onboarding',
  z.strictObject({ guide_path: z.string().regex(/^\/[\w\-/]*$/) }),
);

const AI_GUIDE_URL = `${import.meta.env.BOOKMARK_SCOUT_DOCS_URL}${onboardingConfig.guide_path}`;

/** The card's points, in reading order. */
const POINTS: readonly { id: string; icon: LucideIcon; key: MessageKey }[] = [
  { id: 'what', icon: Sparkles, key: 'aiOnboard_what' },
  { id: 'account', icon: KeyRound, key: 'aiOnboard_account' },
  { id: 'cost', icon: Coins, key: 'aiOnboard_cost' },
  { id: 'data', icon: Send, key: 'aiOnboard_data' },
];

export function AIIntroPanel() {
  return (
    <OptionsPanel
      id="ai-intro"
      data-testid="ai-intro"
      title={t('aiOnboard_title')}
      description={t('aiOnboard_steps')}
    >
      <ul className="space-y-2 text-sm">
        {POINTS.map(({ id, icon: Icon, key }) => (
          <li key={id} data-point={id} className="flex items-start gap-2">
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ai" />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
      <UrlLink
        href={AI_GUIDE_URL}
        data-testid="ai-intro-guide"
        className="inline-flex items-center gap-1 text-sm text-primary"
      >
        <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
        {t('aiOnboard_guide')}
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
      </UrlLink>
    </OptionsPanel>
  );
}

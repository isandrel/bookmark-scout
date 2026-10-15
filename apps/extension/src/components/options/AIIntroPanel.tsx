/**
 * Options > AI, above the AI Features switch: what AI does here, what it needs (an account with an
 * AI company and its key, or a free model on this computer), what it may cost, and what is sent.
 * Options shows it until the default AI service is set up (`useAIServiceSetUp`). The same facts as the
 * AI Features description and the privacy policy, in plainer words.
 *
 * Where Chrome can run its built-in model, the box starts with that free choice ("Free on this
 * computer"), until a built-in service exists. Adding it does not turn AI on: AI Features stays
 * the switch below.
 */

import type { LucideIcon } from 'lucide-react';
import { BookOpen, Coins, ExternalLink, KeyRound, Laptop, Send, Sparkles } from 'lucide-react';
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

/**
 * Makes the built-in service the default, so its editor opens with the download. There is only
 * ever one: when it already exists (another tab added it, or a second click), that one is chosen.
 */
async function addBuiltinService(provider: AIProvider) {
  const service = await addAIService(provider);
  await setDefaultAIService(service.id);
}

/** "Free on this computer": the built-in model, offered first where this computer can run it. */
function BuiltinAISuggestion() {
  const { state, isLoading } = useAIServices();
  const status = useBuiltinAIStatus(BUILTIN_AI_PROVIDER !== undefined);
  const provider = BUILTIN_AI_PROVIDER;
  const added = state.services.some((service) => isBuiltinProvider(service.provider));
  if (!provider || isLoading || added || !canOfferBuiltinAI(status)) return null;
  return (
    <div
      data-testid="builtin-ai-suggestion"
      className="flex flex-wrap items-start gap-3 rounded-md border border-primary/30 bg-accent px-3 py-3 text-sm"
    >
      <Laptop aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ai" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{t('builtinAi_suggestTitle')}</p>
        <p className="text-muted-foreground">{t('builtinAi_suggestDesc')}</p>
      </div>
      <Button type="button" size="sm" onClick={() => void addBuiltinService(provider)}>
        {t('builtinAi_suggestAction')}
      </Button>
    </div>
  );
}

export function AIIntroPanel() {
  return (
    <OptionsPanel
      id="ai-intro"
      data-testid="ai-intro"
      title={t('aiOnboard_title')}
      description={t('aiOnboard_steps')}
    >
      <BuiltinAISuggestion />
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

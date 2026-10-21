/**
 * The Ask AI chat's limits (`config/ai/agent.toml`), read once here because both the agent loop
 * (`services/ai-agent.ts`) and the suggestion buttons it offers (`services/chat-actions.ts`) use
 * them. Pure, so the action registry can load it in any context.
 */
import { z } from 'zod';

export const ASK_AI_CONFIG = readConfig(
  'ai/agent',
  z.strictObject({
    web_search_max_uses: z.number().int().positive(),
    max_suggestions: z.number().int().positive(),
    suggestion_label_chars: z.number().int().positive(),
    suggestion_text_chars: z.number().int().positive(),
  }),
);

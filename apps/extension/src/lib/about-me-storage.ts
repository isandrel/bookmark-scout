/**
 * "About me" (Options > AI): a few words about the user ("I'm a teacher; I save lesson
 * material") that AI prompts include as {{aboutMe}} (src/services/prompt-config.ts). One synced
 * item, written when the field loses focus, never per keystroke, which keeps clear of the sync
 * write limits.
 */
import { z } from 'zod';

const aboutMeConfig = readConfig(
  'ai/about-me',
  z.strictObject({ max_length: z.number().int().positive() }),
);

/** Longest "About me" text, in characters. */
export const ABOUT_ME_MAX_LENGTH = aboutMeConfig.max_length;

export const aboutMeValue = defineStoredValue<string>(STORAGE_ITEMS.aboutMe, {
  schema: z.string().max(ABOUT_ME_MAX_LENGTH),
  empty: '',
  isEmpty: (text) => text.trim() === '',
});

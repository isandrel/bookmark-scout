/**
 * Schemas for every message quick save receives (`quick-save-protocol.ts` has the shapes). Any
 * script that can reach the extension could send one, so each listener parses with these and
 * drops anything else.
 */

import { z } from 'zod';

const messageId = z.string().min(1).max(100);

export const quickSaveActionSchema = z.union([
  z.strictObject({
    type: z.literal(QUICK_SAVE_MESSAGE.action),
    id: messageId,
    action: z.enum(['undo', 'dismiss', 'openAISettings']),
  }),
  z.strictObject({
    type: z.literal(QUICK_SAVE_MESSAGE.action),
    id: messageId,
    action: z.literal('move'),
    index: z.number().int().min(0).max(50),
  }),
]) satisfies z.ZodType<QuickSaveActionMessage>;

export const quickSaveHostFetchSchema = z.strictObject({
  type: z.literal(QUICK_SAVE_MESSAGE.hostFetch),
  token: messageId,
  url: z.url({ protocol: /^https?$/ }),
  method: z.string().min(1).max(10),
  headers: z.array(z.tuple([z.string(), z.string()])).max(100),
  body: z.string().optional(),
}) satisfies z.ZodType<QuickSaveHostFetchMessage>;

export const quickSaveHostRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal(QUICK_SAVE_MESSAGE.hostGenerate),
    token: messageId,
    settings: z.record(z.string(), z.unknown()),
    source: z.string().min(1).max(50),
    locale: z.string().min(2).max(10),
    schema: z.literal('folderRecommendations'),
    system: z.string(),
    prompt: z.string(),
  }),
  z.strictObject({
    type: z.literal(QUICK_SAVE_MESSAGE.hostReadPage),
    token: messageId,
    url: z.url({ protocol: /^https?$/ }),
  }),
]) satisfies z.ZodType<QuickSaveHostRequest>;

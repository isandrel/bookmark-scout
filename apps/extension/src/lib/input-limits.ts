/** Limits on outside and stored input, and the length of made ids (config/limits/input.toml). */
import { z } from 'zod';

const positive = z.number().int().positive();

export const INPUT_LIMITS = readConfig(
  'limits/input',
  z.strictObject({
    chars: z.strictObject({
      bookmark_title: positive,
      plan_summary: positive,
      folder_id: positive,
      agent_bridge_status_detail: positive,
      audit_actor_label: positive,
      audit_error_code: positive,
      audit_reason: positive,
      message_id: positive,
      message_source: positive,
      document_token: positive,
      page_head: positive,
      page_html: positive,
      action_badge: positive,
      cover_meta: positive,
    }),
    counts: z.strictObject({
      audit_error_codes: positive,
      alternative_index: positive,
      request_headers: positive,
      cover_metas: positive,
    }),
    ids: z.strictObject({
      document_token_bytes: positive,
      service_suffix: positive,
      prompt: positive,
    }),
  }),
);

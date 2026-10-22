/**
 * The commands extension pages send the background to start and steer jobs
 * (`services/job-coordinator.ts`), validated on arrival. Only the extension's own pages may send
 * them: a content script runs with the same extension id, so the sender's page is checked too.
 * No React here.
 */
import { z } from 'zod';

/** The runtime message type that carries a job command. */
export const JOB_COMMAND_MESSAGE = 'bookmark-scout:job-command';

/** Command and job ids are made with `crypto.randomUUID()`. */
const id = z.uuid();
/** A browser bookmark id: digits in Chrome and Edge, a short GUID in Firefox. */
const bookmarkId = z.string().regex(/^[\w-]+$/);

export const jobCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('start'),
    /** Made once by the page before the first send, so a resend returns the same job. */
    commandId: id,
    kind: z.enum(SCAN_JOB_KINDS),
    source: z.enum(JOB_SOURCES),
    scope: z.discriminatedUnion('mode', [
      z.strictObject({ mode: z.literal('all') }),
      z.strictObject({ mode: z.literal('folder'), folderId: bookmarkId }),
    ]),
    /**
     * The sites the user chose to request (`getUrlSite`), for a kind that lets them choose
     * (Index Page Text); absent: every site of the scope. Each site has a bookmark, so there are
     * never more sites than items.
     */
    sites: z.array(urlSiteSchema).max(JOB_LIMITS.maxItems).optional(),
  }),
  z.strictObject({
    type: z.literal('apply'),
    /** Made once by the page when the user applies, so a resend returns the same job. */
    commandId: id,
    source: z.enum(JOB_SOURCES),
    /** Reviewed changes the user approved, applied in order and checked again before each. */
    tool: applyJobOptionsSchema.shape.tool,
    changes: z.array(storedBookmarkChangeSchema).min(1).max(JOB_LIMITS.maxItems),
  }),
  z.strictObject({ type: z.literal('pause'), jobId: id }),
  z.strictObject({ type: z.literal('resume'), jobId: id }),
  z.strictObject({ type: z.literal('cancel'), jobId: id }),
  z.strictObject({ type: z.literal('delete'), jobId: id }),
]);
export type JobCommand = z.infer<typeof jobCommandSchema>;

export type JobCommandResponse =
  | { ok: true; job: JobRecord | null }
  | { ok: false; error: 'invalid' | 'forbidden' | 'not-found' | 'store' };

/**
 * Whether a message comes from one of the extension's own pages (popup, side panel, manager,
 * options), not a content script in a web page, which shares the extension id.
 */
export function isExtensionPageSender(sender: Browser.runtime.MessageSender): boolean {
  if (sender.id !== browser.runtime.id) return false;
  const origin = browser.runtime.getURL('/');
  if (!sender.url?.startsWith(origin)) return false;
  return sender.tab?.url === undefined || sender.tab.url.startsWith(origin);
}

/** Sends a job command from a page; resolves with the background's answer. */
export async function sendJobCommand(command: JobCommand): Promise<JobCommandResponse> {
  const response: unknown = await browser.runtime.sendMessage({
    type: JOB_COMMAND_MESSAGE,
    command,
  });
  return (response as JobCommandResponse | undefined) ?? { ok: false, error: 'store' };
}

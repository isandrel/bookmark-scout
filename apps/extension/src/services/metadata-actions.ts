/**
 * Tags and summaries as actions, for agents and Bookmark Scout's own pages: the tags in use,
 * adding and removing tags on many bookmarks, and setting one bookmark's tags and summary (the
 * details dialog in the manager runs it). They write through `bookmark-metadata-storage.ts`, as
 * the rest of the extension does; tags and summaries are not in the bookmark undo history, so each
 * write returns what it replaced, for the caller to put back.
 *
 * Saved searches are not actions yet: their query parsing reads the manager table's columns, a
 * page module the background cannot load.
 */
import { z } from 'zod';

const tagInput = z.string().trim().min(1).max(actionLimits.max_tag_chars);
const tagList = (description: string) =>
  z.array(tagInput).max(actionLimits.max_tags_per_call).describe(description);

/** The bookmarks `refs` name, or an error naming the first that is not a bookmark. */
function bookmarksOf(library: ActionLibrary, refs: readonly string[]): string[] | ActionError {
  const ids: string[] = [];
  for (const ref of refs) {
    const parsed = parseActionRef(ref);
    if (parsed?.kind !== 'bookmark' || !library.bookmarkById.has(parsed.id)) {
      return refProblem(library, ref, ['bookmark']);
    }
    ids.push(parsed.id);
  }
  return ids;
}

/** `tags` without those `remove` names and with `add`, each once, ignoring case. */
function editedTags(tags: readonly string[], add: readonly string[], remove: readonly string[]) {
  const removed = new Set(remove.map(tagKey));
  return addTokens(
    tags.filter((tag) => !removed.has(tagKey(tag))),
    add,
    { keyOf: tagKey },
  );
}

const listTags = defineAction({
  risk: 'read',
  labelKey: 'actionName_listTags',
  targets: ['library'],
  agent: { description: agentText('list_tags.agent_description') },
  input: z.object({
    query: z.string().optional().describe(agentText('list_tags.query')),
    cursor: z.string().optional().describe(agentText('cursor_input.self')),
  }),
  output: z.object({
    tags: z.array(z.object({ tag: z.string(), bookmarks: z.number().int() })),
    total: z.number().int(),
    nextCursor: z.string().optional(),
  }),
  describe: () => t('askAI_toolListTags'),
  async execute(input) {
    const counts = new Map<string, { tag: string; bookmarks: number }>();
    for (const entry of Object.values(await bookmarkMetadataValue.get())) {
      for (const tag of entry.tags ?? []) {
        const key = tagKey(tag);
        const count = counts.get(key) ?? { tag, bookmarks: 0 };
        count.bookmarks += 1;
        counts.set(key, count);
      }
    }
    const query = input.query ? tagKey(input.query) : '';
    const tags = [...counts.entries()]
      .filter(([key]) => !query || key.includes(query))
      .map(([, count]) => count)
      .sort((a, b) => b.bookmarks - a.bookmarks || a.tag.localeCompare(b.tag));
    const page = pageOf(tags, input.cursor, actionLimits.max_tags);
    if (isActionError(page)) return page;
    return {
      tags: page.items,
      total: page.total,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  },
});

const editTags = defineAction({
  risk: 'write',
  labelKey: 'actionName_editTags',
  targets: ['bookmark'],
  agent: { description: agentText('edit_tags.agent_description') },
  input: z
    .object({
      refs: z
        .array(z.string())
        .min(1)
        .max(actionLimits.max_refs)
        .describe(agentText('edit_tags.refs')),
      add: tagList(agentText('edit_tags.add')).optional(),
      remove: tagList(agentText('edit_tags.remove')).optional(),
    })
    .refine((input) => (input.add?.length ?? 0) + (input.remove?.length ?? 0) > 0, {
      message: 'Name tags to add or remove.',
    }),
  output: z.object({
    items: z
      .array(z.object({ ref: z.string(), before: z.array(z.string()), tags: z.array(z.string()) }))
      .describe(agentText('edit_tags.items')),
  }),
  describe: (input) => t('askAI_toolEditTags', formatCount(input.refs?.length ?? 0)),
  approvalPreview: {
    lines: (input) => [
      ...(input.add?.length
        ? [t('askAI_approvalTagsAdd', [input.add.join(', '), formatCount(input.refs?.length ?? 0)])]
        : []),
      ...(input.remove?.length
        ? [
            t('askAI_approvalTagsRemove', [
              input.remove.join(', '),
              formatCount(input.refs?.length ?? 0),
            ]),
          ]
        : []),
    ],
  },
  async precheck(input) {
    const ids = bookmarksOf(await loadActionLibrary(), input.refs);
    return isActionError(ids) ? ids : undefined;
  },
  async execute(input) {
    const ids = bookmarksOf(await loadActionLibrary(), input.refs);
    if (isActionError(ids)) return ids;
    const stored = await bookmarkMetadataValue.get();
    const items = ids.map((id) => {
      const before = stored[id]?.tags ?? [];
      return { id, before, tags: editedTags(before, input.add ?? [], input.remove ?? []) };
    });
    await mergeStoredBookmarkMetadata(
      Object.fromEntries(items.map((item) => [item.id, { tags: item.tags }])),
      { tagMode: 'replace', summaryMode: 'replace', dedupeTags: true },
    );
    return {
      items: items.map((item) => ({
        ref: toBookmarkRef(item.id),
        before: item.before,
        tags: item.tags,
      })),
    };
  },
});

const setBookmarkDetails = defineAction({
  risk: 'write',
  labelKey: 'actionName_setBookmarkDetails',
  targets: ['bookmark'],
  agent: { description: agentText('set_bookmark_details.agent_description') },
  input: z
    .object({
      ref: z.string().describe(agentText('set_bookmark_details.ref')),
      tags: tagList(agentText('set_bookmark_details.tags')).optional(),
      summary: z
        .string()
        .max(actionLimits.max_summary_chars)
        .optional()
        .describe(agentText('set_bookmark_details.summary')),
    })
    .refine((input) => input.tags !== undefined || input.summary !== undefined, {
      message: 'Give tags, a summary, or both.',
    }),
  output: z.object({
    ref: z.string(),
    before: z.object({ tags: z.array(z.string()), summary: z.string() }),
    tags: z.array(z.string()),
    summary: z.string(),
  }),
  describe: () => t('askAI_toolSetDetails'),
  async precheck(input) {
    const ids = bookmarksOf(await loadActionLibrary(), [input.ref]);
    return isActionError(ids) ? ids : undefined;
  },
  async execute(input) {
    const ids = bookmarksOf(await loadActionLibrary(), [input.ref]);
    if (isActionError(ids)) return ids;
    const [id] = ids;
    const before = (await bookmarkMetadataValue.get())[id] ?? {};
    const after = await mergeStoredBookmarkMetadata(
      {
        [id]: {
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
        },
      },
      { tagMode: 'replace', summaryMode: 'replace', dedupeTags: true },
    );
    return {
      ref: toBookmarkRef(id),
      before: { tags: before.tags ?? [], summary: before.summary ?? '' },
      tags: after[id]?.tags ?? [],
      summary: after[id]?.summary ?? '',
    };
  },
});

export const METADATA_ACTIONS = { listTags, editTags, setBookmarkDetails };

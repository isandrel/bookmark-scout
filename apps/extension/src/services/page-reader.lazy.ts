/**
 * The page-reading libraries: Mozilla Readability keeps the article and Turndown converts it to
 * compact Markdown. They load on the first page read through `extractPageText` in
 * page-reader.ts; like every `*.lazy.ts` file this one is left out of auto-imports, so import it
 * only with `import()`.
 */
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import type { PageText } from './page-reader';

export type ReadableTextOptions = {
  maxChars: number;
  /** Elements left out of the Markdown, such as `nav` or `form`. */
  dropElements: readonly string[];
};

function createTurndown(dropElements: readonly string[]): TurndownService {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  // Keep link and image text only: addresses cost tokens and say little about the topic.
  turndown.addRule('linkText', { filter: 'a', replacement: (content) => content });
  turndown.remove(dropElements as TurndownService.Filter);
  return turndown;
}

function collapseText(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The readable text of a parsed page, or undefined when it has none. */
export function extractReadableText(
  doc: Document,
  { maxChars, dropElements }: ReadableTextOptions,
): PageText | undefined {
  const title = doc.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() || undefined;
  const description =
    doc
      .querySelector('meta[name="description"], meta[property="og:description"]')
      ?.getAttribute('content')
      ?.trim() ?? '';
  // Readability changes the document it reads, so it gets a copy.
  const article = new Readability(doc.cloneNode(true) as Document).parse();
  const body = article?.content
    ? createTurndown(dropElements).turndown(article.content)
    : (doc.body?.textContent ?? '');
  const text = collapseText([description, body].filter(Boolean).join('\n\n'));
  if (!text) return undefined;
  return { title: article?.title?.trim() || title, text: text.slice(0, maxChars) };
}

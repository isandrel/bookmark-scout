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

export type BlockTextOptions = {
  maxChars: number;
  /** Elements whose text is left out (a CSS selector list): scripts, templates, form fields. */
  dropSelector: string;
  /** Elements that start a new block of text: paragraphs, headings, list items, table rows. */
  blockSelector: string;
};

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const BLOCK_BREAK = '\n';

/**
 * The readable text of a parsed page as plain text, one block (a paragraph, heading, or list
 * item) per line, each block's whitespace collapsed to single spaces; undefined when it has none.
 * Blocks stay apart, so a phrase never reads as one across two of them. Readability keeps the
 * article where it finds one; otherwise the whole body is read the same way. Text inside dropped
 * elements, and attribute values such as a hidden field's, are never part of it.
 */
export function extractReadableBlocks(
  doc: Document,
  { maxChars, dropSelector, blockSelector }: BlockTextOptions,
): string | undefined {
  const description =
    doc
      .querySelector('meta[name="description"], meta[property="og:description"]')
      ?.getAttribute('content') ?? '';
  // Readability changes the document it reads, so it gets a copy; the element it keeps is read.
  const article = new Readability<Node>(doc.cloneNode(true) as Document, {
    serializer: (node) => node,
  }).parse();
  const root = article?.content ?? doc.body;
  const blocks: string[] = [];
  let line = '';
  const flush = () => {
    const text = line.replace(/\s+/gu, ' ').trim();
    if (text) blocks.push(text);
    line = '';
  };
  line = description;
  flush();
  const walk = (node: Node) => {
    if (node.nodeType === TEXT_NODE) {
      line += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;
    const element = node as Element;
    if (element.matches(dropSelector)) return;
    const block = element.matches(blockSelector);
    if (block) flush();
    for (const child of element.childNodes) walk(child);
    if (block) flush();
  };
  if (root) walk(root);
  flush();
  const text = blocks.join(BLOCK_BREAK).slice(0, maxChars).trim();
  return text || undefined;
}

/**
 * HTML from web pages (fetched for titles or page text, or dropped from another page), parsed
 * into an inert document for reading. Chrome checks scripts, preload links, and inline event
 * handlers in such a document against the extension page's Content Security Policy, even
 * though nothing in it ever loads or runs: each one is blocked and leaves an error in
 * chrome://extensions, one per bookmark scanned. They are removed first, which changes nothing
 * the extension reads (titles, meta descriptions, text, links).
 */

/** One attribute in a start tag: its name, then an optional quoted or bare value. */
const ATTRIBUTE = /(\s+)([^\s"'=<>/]+)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/g;

/** A start tag without its `on…` event handler attributes; values are never looked into. */
function withoutHandlers(tag: string): string {
  const match = /^<([a-z][^\s/>]*)([\s\S]*?)(\/?>)$/i.exec(tag);
  if (!match) return tag;
  const [, name, attributes, end] = match;
  const kept = attributes.replace(ATTRIBUTE, (whole, _space, attribute: string) =>
    /^on/i.test(attribute) ? '' : whole,
  );
  return `<${name}${kept}${end}`;
}

/** `html` without script elements, `<link>` tags, `http-equiv` meta tags, or `on…` attributes. */
export function stripActiveHtml(html: string): string {
  return (
    html
      // A script element with its content; an unclosed one runs to the end.
      .replace(/<script\b[\s\S]*?(?:<\/script\s*>|$)/gi, '')
      .replace(/<link\b[^>]*>/gi, '')
      .replace(/<meta\b[^>]*\bhttp-equiv\b[^>]*>/gi, '')
      // Start tags, quoted values kept whole so a ">" inside one does not end the tag.
      .replace(/<[a-z](?:"[^"]*"|'[^']*'|[^'">])*>/gi, withoutHandlers)
  );
}

/** Parses fetched or dropped HTML for reading, with active content removed first. */
export function parseFetchedHtml(html: string): Document {
  return new DOMParser().parseFromString(stripActiveHtml(html), 'text/html');
}

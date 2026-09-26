/**
 * Export privacy review: finds values in exported bookmarks that may be private (sensitive
 * query or fragment parameters, token-like values, email-like values, URL credentials) and
 * redacts them in a copy of the tree. Stored bookmarks are never changed.
 *
 * Detection reuses the Privacy Scanner rules in `bookmark-network-tools.ts`.
 */

import type { BookmarkTreeNode } from '@/types';

export const EXPORT_REDACTION_PLACEHOLDER = 'REDACTED';

export type ExportPrivacyField = {
  kind: 'queryParam' | 'fragmentParam' | 'fragment' | 'credentials' | 'email' | 'token';
  location: 'url' | 'title';
  /** The query or fragment parameter that holds the value, when there is one. */
  name?: string;
};

export type ExportPrivacyItem = {
  id: string;
  title: string;
  url: string;
  fields: ExportPrivacyField[];
};

export type ExportPrivacyOptions = {
  /** Parameter names treated as sensitive (the Privacy Scanner's list). */
  sensitiveParams: string[];
  emailDetection: boolean;
  /** False when the export format leaves URLs out, so only titles are reviewed. */
  includeUrls: boolean;
};

type Analysis = { title: string; url: string; fields: ExportPrivacyField[] };

const HIERARCHICAL_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const ORIGIN_PATTERN = /^([a-z][a-z0-9+.-]*:\/\/)([^/]*)(.*)$/i;

function decodeComponent(value: string, plusAsSpace: boolean): string {
  try {
    return decodeURIComponent(plusAsSpace ? value.replace(/\+/g, ' ') : value);
  } catch {
    return value;
  }
}

function replaceAll(text: string, values: string[]): string {
  return values.reduce(
    (result, value) => result.split(value).join(EXPORT_REDACTION_PLACEHOLDER),
    text,
  );
}

function sensitiveValues(text: string, options: ExportPrivacyOptions) {
  return {
    tokens: findTokenValues(text),
    emails: options.emailDetection ? findEmailValues(text) : [],
  };
}

/** Redacts the values of `a=1&b=2`-style parameters, keeping every other byte as written. */
function redactParams(
  raw: string,
  sensitiveNames: Set<string>,
  nameKind: 'queryParam' | 'fragmentParam',
  options: ExportPrivacyOptions,
  fields: ExportPrivacyField[],
): string {
  return raw
    .split('&')
    .map((pair) => {
      const separator = pair.indexOf('=');
      if (separator < 0) return pair;
      const rawName = pair.slice(0, separator);
      const value = decodeComponent(pair.slice(separator + 1), true);
      if (!value) return pair;
      const name = decodeComponent(rawName, true);
      const { tokens, emails } = sensitiveValues(value, options);
      let field: ExportPrivacyField | null = null;
      if (sensitiveNames.has(name.toLowerCase())) field = { kind: nameKind, location: 'url', name };
      else if (tokens.length) field = { kind: 'token', location: 'url', name };
      else if (emails.length) field = { kind: 'email', location: 'url', name };
      if (!field) return pair;
      fields.push(field);
      return `${rawName}=${EXPORT_REDACTION_PLACEHOLDER}`;
    })
    .join('&');
}

/** Redacts emails and tokens inside path segments; untouched segments keep their encoding. */
function redactPath(path: string, options: ExportPrivacyOptions, fields: ExportPrivacyField[]) {
  return path
    .split('/')
    .map((segment) => {
      const decoded = decodeComponent(segment, false);
      const { tokens, emails } = sensitiveValues(decoded, options);
      if (!tokens.length && !emails.length) return segment;
      if (tokens.length) fields.push({ kind: 'token', location: 'url' });
      if (emails.length) fields.push({ kind: 'email', location: 'url' });
      return encodeURIComponent(replaceAll(decoded, [...tokens, ...emails]));
    })
    .join('/');
}

function redactFragment(
  fragment: string,
  sensitiveNames: Set<string>,
  options: ExportPrivacyOptions,
  fields: ExportPrivacyField[],
): string {
  if (parseFragmentParams(`#${fragment}`)) {
    const queryStart = fragment.indexOf('?');
    const prefix = queryStart >= 0 ? fragment.slice(0, queryStart + 1) : '';
    const params = queryStart >= 0 ? fragment.slice(queryStart + 1) : fragment;
    return prefix + redactParams(params, sensitiveNames, 'fragmentParam', options, fields);
  }
  const { tokens, emails } = sensitiveValues(decodeComponent(fragment, false), options);
  if (!tokens.length && !emails.length) return fragment;
  fields.push({ kind: 'fragment', location: 'url' });
  return EXPORT_REDACTION_PLACEHOLDER;
}

function redactUrl(url: string, options: ExportPrivacyOptions, fields: ExportPrivacyField[]) {
  if (!HIERARCHICAL_URL_PATTERN.test(url)) {
    // mailto:, javascript:, and other opaque URLs are treated as text.
    const { tokens, emails } = sensitiveValues(decodeComponent(url, false), options);
    if (!tokens.length && !emails.length) return url;
    if (tokens.length) fields.push({ kind: 'token', location: 'url' });
    if (emails.length) fields.push({ kind: 'email', location: 'url' });
    const redacted = replaceAll(url, [...tokens, ...emails]);
    const remaining = sensitiveValues(decodeComponent(redacted, false), options);
    return remaining.tokens.length || remaining.emails.length
      ? `${url.slice(0, url.indexOf(':') + 1)}${EXPORT_REDACTION_PLACEHOLDER}`
      : redacted;
  }

  const sensitiveNames = new Set(options.sensitiveParams.map((name) => name.toLowerCase()));
  const fragmentNames = new Set([...sensitiveNames, ...FRAGMENT_TOKEN_PARAMS]);

  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  const base = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;

  const [, scheme = '', authority = '', path = ''] = ORIGIN_PATTERN.exec(base) ?? [];
  const userInfoEnd = authority.lastIndexOf('@');
  if (userInfoEnd >= 0) fields.push({ kind: 'credentials', location: 'url' });
  const host = userInfoEnd >= 0 ? authority.slice(userInfoEnd + 1) : authority;

  let result = `${scheme}${host}${redactPath(path, options, fields)}`;
  if (queryIndex >= 0) {
    const query = beforeHash.slice(queryIndex + 1);
    result += `?${redactParams(query, sensitiveNames, 'queryParam', options, fields)}`;
  }
  if (hashIndex >= 0) {
    result += `#${redactFragment(url.slice(hashIndex + 1), fragmentNames, options, fields)}`;
  }
  return result;
}

function redactTitle(title: string, options: ExportPrivacyOptions, fields: ExportPrivacyField[]) {
  const { tokens, emails } = sensitiveValues(title, options);
  if (tokens.length) fields.push({ kind: 'token', location: 'title' });
  if (emails.length) fields.push({ kind: 'email', location: 'title' });
  return replaceAll(title, [...tokens, ...emails]);
}

function uniqueFields(fields: ExportPrivacyField[]): ExportPrivacyField[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = `${field.kind}:${field.location}:${field.name ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function analyzeBookmark(node: BookmarkTreeNode, options: ExportPrivacyOptions): Analysis {
  const fields: ExportPrivacyField[] = [];
  const url = options.includeUrls && node.url ? redactUrl(node.url, options, fields) : node.url;
  const title = redactTitle(node.title, options, fields);
  return { title, url: url ?? '', fields: uniqueFields(fields) };
}

/** Lists the bookmarks under `nodes` whose exported title or URL holds a possibly private value. */
export function reviewExportPrivacy(
  nodes: BookmarkTreeNode[],
  options: ExportPrivacyOptions,
): ExportPrivacyItem[] {
  return nodes.flatMap((node) => {
    if (!node.url) return reviewExportPrivacy(node.children ?? [], options);
    const { fields } = analyzeBookmark(node, options);
    return fields.length ? [{ id: node.id, title: node.title, url: node.url, fields }] : [];
  });
}

/**
 * Returns a copy of `nodes` with every value {@link reviewExportPrivacy} reports replaced by
 * {@link EXPORT_REDACTION_PLACEHOLDER}. The input is not modified.
 */
export function redactBookmarkNodes(
  nodes: BookmarkTreeNode[],
  options: ExportPrivacyOptions,
): BookmarkTreeNode[] {
  return nodes.map((node) => {
    if (node.url) {
      const { title, url } = analyzeBookmark(node, options);
      return { ...node, title, url };
    }
    return node.children
      ? { ...node, children: redactBookmarkNodes(node.children, options) }
      : { ...node };
  });
}

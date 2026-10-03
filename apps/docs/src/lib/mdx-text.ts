import { site } from "@bookmark-scout/config";
import { copy } from "@/lib/copy";
import {
  type ContactRole,
  contactAddress,
  contactHref,
  license,
  privacyEffectiveDate,
  releasesUrl,
  repoHref,
  type SitePath,
  siteUrl,
  storeAvailability,
  storeListing,
} from "@/lib/links";
import { SCREENSHOTS, type ScreenshotName } from "@/lib/screenshots";

const DOCS_URL = site.docs.origin;

/**
 * The docs' own MDX components read links and addresses from config. The processed
 * Markdown used for llms.txt and the per-page Markdown copies still contains their
 * JSX tags, so replace each with the plain Markdown it renders.
 */
const replacements: [RegExp, (...groups: string[]) => string][] = [
  [
    /<Contact\s+role="(\w+)"\s*\/>/g,
    (role) =>
      `[${contactAddress(role as ContactRole)}](${contactHref(role as ContactRole)})`,
  ],
  [/<ReleaseLink\s*\/>/g, () => `[${copy.release.latest}](${releasesUrl})`],
  [
    /<ReleaseLink>([\s\S]*?)<\/ReleaseLink>/g,
    (text) => `[${text}](${releasesUrl})`,
  ],
  [
    /<SiteLink\s+to="(\w+)">([\s\S]*?)<\/SiteLink>/g,
    (to, text) => `[${text}](${siteUrl(to as SitePath)})`,
  ],
  [
    /<RepoLink((?:\s+(?:path|file|tree)="[^"]*")*)\s*>([\s\S]*?)<\/RepoLink>/g,
    (attributes, text) =>
      `[${text}](${repoHref({
        path: attribute(attributes, "path"),
        file: attribute(attributes, "file"),
        tree: attribute(attributes, "tree"),
      })})`,
  ],
  [
    /<StoreListing\s+browser="(\w+)"\s*\/>/g,
    (browser) => {
      const listing = storeListing(browser);
      return listing.live ? `${listing.text} (${listing.url})` : listing.text;
    },
  ],
  [
    /<Screenshot\s+name="([\w-]+)"\s*\/>/g,
    (name) => {
      const shot = SCREENSHOTS[name as ScreenshotName];
      return shot
        ? `![${shot.alt}](${new URL(shot.light, DOCS_URL).toString()})`
        : "";
    },
  ],
  [
    /<StoreAvailability\s*\/>/g,
    () => {
      const { text, links } = storeAvailability();
      return [
        text,
        ...links.map((link) => `- [${link.name}](${link.url})`),
      ].join("\n");
    },
  ],
  [/<License\s*\/>/g, () => `[${license.name}](${license.url})`],
  [/<PrivacyEffectiveDate\s*\/>/g, () => privacyEffectiveDate.text],
  [/<StartHere\s*\/>\n?/g, () => ""],
];

/** Remove the indentation shared by every non-blank line, and surrounding blank lines. */
function dedent(text: string): string {
  const lines = text
    .replace(/^\s*\n/, "")
    .trimEnd()
    .split("\n");
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => line.length - line.trimStart().length);
  const shared = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(shared)).join("\n");
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(attributes)?.[1];
}

/**
 * Fumadocs layout components (Tabs, Callout, Steps) stay as JSX in processed Markdown.
 * Rewrite them as plain Markdown, outermost first, so nested content is dedented once
 * and never turns into an indented code block.
 */
const layoutReplacements: [RegExp, (groups: string[]) => string][] = [
  [/<Tabs[^>]*>|<\/Tabs>/g, () => ""],
  [
    /^([ \t]*)<Tab\b([^>]*)>([\s\S]*?)<\/Tab>/gm,
    ([, attributes, body]) =>
      `**${attribute(attributes, "value") ?? ""}**\n\n${dedent(body)}\n`,
  ],
  [
    /^([ \t]*)<Callout\b([^>]*)>([\s\S]*?)<\/Callout>/gm,
    ([, attributes, body]) => {
      const title = attribute(attributes, "title");
      const lines = [
        ...(title ? [`**${title}**`, ""] : []),
        ...dedent(body).split("\n"),
      ];
      return lines.map((line) => (line ? `> ${line}` : ">")).join("\n");
    },
  ],
  [
    /^([ \t]*)<Steps>([\s\S]*?)<\/Steps>/gm,
    ([, body]) =>
      [...body.matchAll(/<Step>([\s\S]*?)<\/Step>/g)]
        .map(([, step], index) =>
          dedent(step)
            .split("\n")
            .map((line, lineIndex) => {
              if (lineIndex === 0) return `${index + 1}. ${line}`;
              return line ? `   ${line}` : "";
            })
            .join("\n"),
        )
        .join("\n"),
  ],
];

function resolveLayout(markdown: string): string {
  return layoutReplacements.reduce(
    (text, [pattern, render]) =>
      // replace() passes the match, then the groups, then the offset and the input.
      text.replace(pattern, (...args: unknown[]) =>
        render(
          args
            .slice(1, -2)
            .map((group) => (typeof group === "string" ? group : "")),
        ),
      ),
    markdown,
  );
}

/** Make root-relative links absolute, so the text works when read outside this site. */
export function absolutizeLinks(markdown: string): string {
  return markdown.replace(/\]\((\/[^)\s]*)\)/g, (_match, path: string) => {
    return `](${new URL(path, DOCS_URL).toString()})`;
  });
}

export function resolveMdxForText(markdown: string): string {
  const resolved = replacements.reduce(
    (text, [pattern, render]) =>
      text.replace(pattern, (_match, ...groups: unknown[]) =>
        render(
          ...groups.filter(
            (group): group is string => typeof group === "string",
          ),
        ),
      ),
    markdown,
  );
  return absolutizeLinks(resolveLayout(resolved))
    .replace(/^(#{1,6} .*?) \[#[\w-]+\]$/gm, "$1") // heading ids written by Fumadocs
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Cloudflare Pages `_redirects` rules: the shape `scripts/generate-public-files.ts` writes and
 * the subset of matching `scripts/serve-out.ts` applies, so browser tests exercise the same file
 * the host reads. Supported: exact paths and one trailing splat (`/en/*` to `/:splat`). Static
 * rules come before splat rules, and the first match wins, as on Cloudflare Pages.
 */

export type RedirectRule = {
    from: string;
    to: string;
    status: 301 | 302;
};

const SPLAT = "/*";

export function formatRedirects(rules: readonly RedirectRule[], header: readonly string[] = []): string {
    const width = Math.max(...rules.map((rule) => rule.from.length));
    return [
        ...header.map((line) => `# ${line}`),
        ...rules.map((rule) => `${rule.from.padEnd(width)}  ${rule.to}  ${rule.status}`),
        "",
    ].join("\n");
}

export function parseRedirects(text: string): RedirectRule[] {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#"))
        .map((line) => {
            const [from, to, status = "302"] = line.split(/\s+/);
            if (!from || !to || (status !== "301" && status !== "302")) throw new Error(`Bad redirect line: ${line}`);
            return { from, to, status: Number(status) as RedirectRule["status"] };
        });
}

/** The destination for `pathname`, or `undefined` when no rule matches. */
export function matchRedirect(
    rules: readonly RedirectRule[],
    pathname: string,
): { location: string; status: RedirectRule["status"] } | undefined {
    for (const rule of rules) {
        if (rule.from === pathname) return { location: rule.to, status: rule.status };
    }
    for (const rule of rules) {
        if (!rule.from.endsWith(SPLAT)) continue;
        const prefix = rule.from.slice(0, -1);
        if (pathname.startsWith(prefix)) {
            return { location: rule.to.replace(":splat", pathname.slice(prefix.length)), status: rule.status };
        }
    }
    return undefined;
}

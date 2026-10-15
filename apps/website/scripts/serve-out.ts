/// <reference types="bun" />
/**
 * Serves the static export in `out/` the way Cloudflare Pages does (the `_redirects` rules
 * first, then directory index.html, then the 404.html fallback), for browser tests.
 *
 *   bun scripts/serve-out.ts [port]
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { matchRedirect, parseRedirects } from "../lib/redirects";

const outDir = resolve(import.meta.dir, "..", "out");
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const redirectsPath = join(outDir, "_redirects");
const redirects = existsSync(redirectsPath) ? parseRedirects(readFileSync(redirectsPath, "utf8")) : [];

function resolveFile(pathname: string): string | undefined {
    const candidate = join(outDir, decodeURIComponent(pathname));
    if (!candidate.startsWith(outDir)) return undefined;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    const index = join(candidate, "index.html");
    return existsSync(index) ? index : undefined;
}

Bun.serve({
    port,
    fetch(request) {
        const url = new URL(request.url);
        const redirect = matchRedirect(redirects, url.pathname);
        if (redirect) {
            const location = new URL(redirect.location, url);
            location.search = url.search;
            return new Response(null, { status: redirect.status, headers: { Location: location.href } });
        }
        const file = resolveFile(url.pathname);
        if (file) return new Response(Bun.file(file));
        return new Response(Bun.file(join(outDir, "404.html")), { status: 404 });
    },
});

console.log(`Serving ${outDir} at http://localhost:${port} with ${redirects.length} redirects`);

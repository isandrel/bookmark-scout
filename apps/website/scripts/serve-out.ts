/// <reference types="bun" />
/**
 * Serves the static export in `out/` the way GitHub Pages does (directory
 * index.html, 404.html fallback), for browser tests.
 *
 *   bun scripts/serve-out.ts [port]
 */
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const outDir = resolve(import.meta.dir, "..", "out");
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);

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
        const file = resolveFile(new URL(request.url).pathname);
        if (file) return new Response(Bun.file(file));
        return new Response(Bun.file(join(outDir, "404.html")), { status: 404 });
    },
});

console.log(`Serving ${outDir} at http://localhost:${port}`);

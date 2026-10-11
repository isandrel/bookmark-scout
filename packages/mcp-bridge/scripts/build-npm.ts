/**
 * Builds dist/cli.js for the npm package: one Node-compatible file with every dependency and the
 * TOML config bundled in, started by Node through the package's bin link. The compiled binaries
 * (`bun run compile`, and the release workflow) need neither Node nor Bun.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const outfile = join(root, "dist", "cli.js");

const result = await Bun.build({
  entrypoints: [join(root, "src", "cli.ts")],
  outdir: join(root, "dist"),
  naming: "cli.js",
  target: "node",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// The source's own shebang starts Bun; the package is run by Node.
const code = readFileSync(outfile, "utf8").replace(/^#!.*\n(\/\/ @bun\n)?/, "");
writeFileSync(outfile, `#!/usr/bin/env node\n${code}`, { mode: 0o755 });
console.log(`Wrote ${outfile}`);

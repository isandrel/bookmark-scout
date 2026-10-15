/**
 * Different provider ids can have exactly the same models.dev logo. Keep the catalog and all
 * source SVGs intact, generate the runtime URL aliases, and remove only verified output copies.
 */
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { catalogIdSchema } from '../src/lib/config/provider-catalog-schema';

const VIRTUAL_MODULE_ID = 'virtual:provider-logo-aliases';
const RESOLVED_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const LOGO_DIRECTORY = 'provider-logos';

type LogoFile = { id: string; source: string; contents: Buffer };
type LogoIndex = { files: LogoFile[]; aliases: Readonly<Record<string, string>> };

async function indexProviderLogos(publicDir: string): Promise<LogoIndex> {
  const logosDir = path.join(publicDir, LOGO_DIRECTORY);
  const names = (await readdir(logosDir, { withFileTypes: true }))
    .filter((file) => file.isFile() && file.name.endsWith('.svg'))
    .map((file) => file.name)
    .sort();
  const files = await Promise.all(
    names.map(async (name) => {
      const id = catalogIdSchema.parse(name.slice(0, -'.svg'.length));
      const source = path.join(logosDir, name);
      return { id, source, contents: await readFile(source) };
    }),
  );
  const canonicalByContents = new Map<string, string>();
  const aliases: Record<string, string> = {};
  for (const file of files) {
    // Base64 is a lossless key, so only byte-identical SVGs share a canonical URL.
    const key = file.contents.toString('base64');
    const canonical = canonicalByContents.get(key);
    if (canonical !== undefined) aliases[file.id] = canonical;
    else canonicalByContents.set(key, file.id);
  }
  return { files, aliases: Object.freeze(aliases) };
}

/** One instance per WXT config: every entrypoint and the output cleanup share the same index. */
export function createProviderLogoAssets(publicDir: string) {
  const logosDir = path.resolve(publicDir, LOGO_DIRECTORY);
  let index: Promise<LogoIndex> | undefined;
  const getIndex = () => (index ??= indexProviderLogos(publicDir));

  const plugin: Plugin = {
    name: 'bookmark-scout-provider-logo-aliases',
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_MODULE_ID;
    },
    async load(id) {
      if (id !== RESOLVED_MODULE_ID) return;
      const result = await getIndex();
      this.addWatchFile(logosDir);
      for (const file of result.files) this.addWatchFile(file.source);
      return `export default ${JSON.stringify(result.aliases)};`;
    },
    watchChange(id) {
      if (path.dirname(id) === logosDir) index = undefined;
    },
    hotUpdate({ file }) {
      if (path.dirname(file) !== logosDir) return;
      index = undefined;
      const module = this.environment.moduleGraph.getModuleById(RESOLVED_MODULE_ID);
      if (!module) return;
      this.environment.moduleGraph.invalidateModule(module);
      return [module];
    },
  };

  return {
    plugin,
    async getAliases(): Promise<Readonly<Record<string, string>>> {
      return (await getIndex()).aliases;
    },
    /** Returns removed public-asset names so WXT's build summary can exclude those files. */
    async removeDuplicateOutputs(outDir: string): Promise<string[]> {
      if (path.resolve(outDir) === path.resolve(publicDir)) {
        throw new Error('Provider logo cleanup must not run on public source assets');
      }
      const result = await getIndex();
      const expected = new Map(result.files.map((file) => [file.id, file.contents]));
      const aliases = Object.entries(result.aliases);
      // Check every pair before deleting anything. A stale or changed copy fails the build.
      await Promise.all(
        aliases.map(async ([alias, canonical]) => {
          const [aliasContents, canonicalContents] = await Promise.all([
            readFile(path.join(outDir, LOGO_DIRECTORY, `${alias}.svg`)),
            readFile(path.join(outDir, LOGO_DIRECTORY, `${canonical}.svg`)),
          ]);
          const original = expected.get(alias);
          if (
            !original ||
            !aliasContents.equals(canonicalContents) ||
            !aliasContents.equals(original)
          ) {
            throw new Error(`Provider logo output changed: ${alias}.svg and ${canonical}.svg`);
          }
        }),
      );
      const removed = aliases.map(([alias]) => `${LOGO_DIRECTORY}/${alias}.svg`);
      await Promise.all(removed.map((file) => rm(path.join(outDir, file))));
      return removed;
    },
  };
}

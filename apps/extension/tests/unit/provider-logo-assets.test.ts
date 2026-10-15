import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, isRunnableDevEnvironment } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { createProviderLogoAssets } from '../../build/provider-logo-assets';
import { appRoot } from '../config-files';

const tempDirs: string[] = [];
const svg = '<svg viewBox="0 0 8 8"><path d="M0 0h8v8H0z"/></svg>';

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function logoFixture() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'bookmark-scout-provider-logos-'));
  tempDirs.push(tempDir);
  const publicDir = path.join(tempDir, 'public');
  const outDir = path.join(tempDir, 'dist');
  const logosDir = path.join(publicDir, 'provider-logos');
  await mkdir(logosDir, { recursive: true });
  // Created out of alphabetical order; a canonical id must not depend on directory order.
  await writeFile(path.join(logosDir, 'c.svg'), svg);
  await writeFile(path.join(logosDir, 'b.svg'), svg);
  await writeFile(path.join(logosDir, 'a.svg'), svg);
  await writeFile(path.join(logosDir, 'different.svg'), `${svg}\n`);
  await writeFile(path.join(publicDir, 'license.txt'), 'Keep the license\n');
  await cp(publicDir, outDir, { recursive: true });
  return { publicDir, outDir, assets: createProviderLogoAssets(publicDir) };
}

describe('provider logo distribution assets', () => {
  it('generates a deterministic virtual module only for exact byte duplicates', async () => {
    const { publicDir, assets } = await logoFixture();
    const server = await createServer({
      configFile: false,
      root: publicDir,
      plugins: [assets.plugin],
      server: { middlewareMode: true, hmr: false },
    });
    try {
      const environment = server.environments.ssr;
      if (!isRunnableDevEnvironment(environment)) {
        throw new Error('Expected a runnable Vite environment');
      }
      const module = await environment.runner.import('virtual:provider-logo-aliases');
      expect(module.default).toEqual({ b: 'a', c: 'a' });
      expect(await assets.getAliases()).toEqual(module.default);
    } finally {
      await server.close();
    }
  });

  it('removes only distribution alias copies and preserves source files and licenses', async () => {
    const { publicDir, outDir, assets } = await logoFixture();

    expect(await assets.removeDuplicateOutputs(outDir)).toEqual([
      'provider-logos/b.svg',
      'provider-logos/c.svg',
    ]);
    expect((await readdir(path.join(outDir, 'provider-logos'))).sort()).toEqual([
      'a.svg',
      'different.svg',
    ]);
    for (const id of ['a', 'b', 'c']) {
      expect(await readFile(path.join(publicDir, 'provider-logos', `${id}.svg`), 'utf8')).toBe(svg);
    }
    expect(await readFile(path.join(outDir, 'provider-logos/a.svg'), 'utf8')).toBe(svg);
    expect(await readFile(path.join(outDir, 'license.txt'), 'utf8')).toBe('Keep the license\n');
  });

  it('fails without deleting any alias if an output differs from the generated mapping', async () => {
    const { outDir, assets } = await logoFixture();
    await assets.getAliases();
    await writeFile(path.join(outDir, 'provider-logos/c.svg'), '<svg/>');

    await expect(assets.removeDuplicateOutputs(outDir)).rejects.toThrow(
      'Provider logo output changed',
    );
    expect((await readdir(path.join(outDir, 'provider-logos'))).sort()).toEqual([
      'a.svg',
      'b.svg',
      'c.svg',
      'different.svg',
    ]);
  });

  it('fails without deleting aliases if their canonical output is missing', async () => {
    const { outDir, assets } = await logoFixture();
    await rm(path.join(outDir, 'provider-logos/a.svg'));

    await expect(assets.removeDuplicateOutputs(outDir)).rejects.toThrow();
    expect((await readdir(path.join(outDir, 'provider-logos'))).sort()).toEqual([
      'b.svg',
      'c.svg',
      'different.svg',
    ]);
  });

  it('refuses to remove public source assets', async () => {
    const { publicDir, assets } = await logoFixture();

    await expect(assets.removeDuplicateOutputs(publicDir)).rejects.toThrow('public source assets');
    expect((await readdir(path.join(publicDir, 'provider-logos'))).sort()).toEqual([
      'a.svg',
      'b.svg',
      'c.svg',
      'different.svg',
    ]);
  });

  it('keeps every current catalog logo visually identical after canonical URL resolution', async () => {
    const publicDir = path.join(appRoot, 'public');
    const assets = createProviderLogoAssets(publicDir);
    const aliases = await assets.getAliases();
    for (const [alias, canonical] of Object.entries(aliases)) {
      const [original, resolved] = await Promise.all([
        readFile(path.join(publicDir, 'provider-logos', `${alias}.svg`)),
        readFile(path.join(publicDir, 'provider-logos', `${canonical}.svg`)),
      ]);
      expect(original.equals(resolved), `${alias} -> ${canonical}`).toBe(true);
      expect(Object.hasOwn(aliases, canonical), canonical).toBe(false);
    }
  });
});

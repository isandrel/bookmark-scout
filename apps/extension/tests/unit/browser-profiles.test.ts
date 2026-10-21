import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserProfile, currentBrowser } from '@/lib/browser-profiles';
import { SUPPORTED_BROWSERS } from '@/lib/supported-browsers';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

afterEach(() => vi.unstubAllEnvs());

/** Every source file under `src/`, relative to the app. */
function sourceFiles(dir = path.join(appRoot, 'src')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sourceFiles(file);
    return /\.(ts|tsx)$/.test(name) ? [path.relative(appRoot, file)] : [];
  });
}

describe('browser profiles', () => {
  it('cover the supported browsers of config/project.toml, in its order', () => {
    const project = parse(
      readFileSync(path.join(appRoot, '../../config/project.toml'), 'utf8'),
    ) as {
      browsers: { supported: string[] };
    };
    expect([...SUPPORTED_BROWSERS]).toEqual(project.browsers.supported);
    const profiles = parse(
      readFileSync(path.join(appRoot, 'config/browsers/profiles.toml'), 'utf8'),
    );
    expect(Object.keys(profiles)).toEqual(project.browsers.supported);
  });

  it('follow the build, and treat another Chromium build as Chrome', () => {
    vi.stubEnv('BROWSER', 'firefox');
    expect(currentBrowser()).toBe('firefox');
    expect(browserProfile()).toMatchObject({ separators: true, bookmarkManagerUrl: null });
    vi.stubEnv('BROWSER', 'opera');
    expect(currentBrowser()).toBe('chrome');
    expect(browserProfile('edge')).toMatchObject({
      privateWindow: 'in_private',
      bookmarkManagerUrl: 'edge://favorites/',
    });
  });

  it('are the only place that reads which browser the build is for', () => {
    // A capability belongs in config/browsers/profiles.toml, not in a check of the browser's name.
    const offenders = sourceFiles().filter((file) => {
      if (file === path.join('src', 'lib', 'browser-profiles.ts')) return false;
      const source = readFileSync(path.join(appRoot, file), 'utf8');
      return (
        source.includes('import.meta.env.BROWSER') ||
        /[!=]==\s*['"](chrome|edge|firefox)['"]/.test(source)
      );
    });
    expect(offenders).toEqual([]);
  });
});

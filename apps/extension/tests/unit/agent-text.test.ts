import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentText, agentTextKeys } from '@/lib/agent-text';

/** Every `agentText('<key>')` in the source names a text, and every text is used. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const used = new Set(
  sourceFiles(path.resolve(import.meta.dirname, '../../src')).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/agentText\('([\w.]+)'\)/g)].map((match) => match[1]),
  ),
);

describe('agent text', () => {
  it('has a text for every key the source asks for', () => {
    expect([...used].filter((key) => !agentTextKeys().includes(key))).toEqual([]);
  });

  it('uses every text in config/ai/agent-text.toml', () => {
    expect(agentTextKeys().filter((key) => !used.has(key))).toEqual([]);
  });

  it('refuses a key the file lacks', () => {
    expect(() => agentText('no_such.text')).toThrow(/agent-text\.toml/);
  });
});

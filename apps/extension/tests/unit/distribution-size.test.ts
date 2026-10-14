import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { parse } from 'smol-toml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertDistributionBudgets,
  assertDistributionManifest,
  DISTRIBUTION_CATEGORIES,
  measureDistribution,
  parseDistributionBudgets,
  parseDistributionTarget,
} from '../../build/distribution-size';

type FixtureFile = { name: string; content: Buffer; method: 0 | 8 };
const files: FixtureFile[] = [
  {
    name: 'manifest.json',
    content: Buffer.from('{"manifest_version":3,"version":"1.2.3"}'),
    method: 8,
  },
  {
    name: 'chunks/page.js',
    content: Buffer.from('const greeting = "hello";\n'.repeat(20)),
    method: 8,
  },
  { name: 'assets/page.css', content: Buffer.from('body{color:black}'), method: 8 },
  { name: 'assets/font.woff2', content: Buffer.from([0, 1, 2, 3, 4]), method: 0 },
  {
    name: '_locales/zh_CN/messages.json',
    content: Buffer.from('{"hello":{"message":"你好"}}'),
    method: 8,
  },
  { name: 'provider-logos/test.svg', content: Buffer.from('<svg/>'), method: 8 },
  { name: 'licenses/test.txt', content: Buffer.from('License text'), method: 8 },
  { name: 'empty.txt', content: Buffer.alloc(0), method: 8 },
];

/** A small ZIP32 fixture with stored and deflated entries and a comment, not a production packager. */
function fixtureZip(entries = files): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, content, method } of entries) {
    const nameBytes = Buffer.from(name);
    const data = method === 0 ? content : deflateRawSync(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(content), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(crc32(content), 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(content.length, 24);
    record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    central.push(record, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const comment = Buffer.from('fixture');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...locals, directory, end, comment]);
}

let distDir: string;
beforeEach(() => {
  distDir = mkdtempSync(path.join(os.tmpdir(), 'extension-distribution-size-'));
  for (const file of files) {
    const filePath = path.join(distDir, file.name);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, file.content);
  }
});
afterEach(() => rmSync(distDir, { recursive: true, force: true }));

describe('actual distribution ZIP measurement', () => {
  it('separates raw category bytes, compressed payload and ZIP overhead', () => {
    const archive = fixtureZip();
    const size = measureDistribution(archive, distDir);
    expect(size.zipBytes).toBe(archive.length);
    expect(size.files).toBe(8);
    expect(size.rawBytes).toBe(files.reduce((sum, file) => sum + file.content.length, 0));
    expect(size.zipPayloadBytes).toBeLessThan(size.rawBytes);
    expect(size.zipOverheadBytes).toBe(909);
    expect(size.zipPayloadBytes + size.zipOverheadBytes).toBe(size.zipBytes);
    expect(size.categories).toMatchObject({
      javascript: { files: 1, rawBytes: 520 },
      css: { files: 1, rawBytes: 17 },
      fonts: { files: 1, rawBytes: 5, zipPayloadBytes: 5 },
      locales: { files: 1, rawBytes: 30 },
      images: { files: 1, rawBytes: 6 },
      other: { files: 3, rawBytes: 52 },
    });
    expect(Object.values(size.categories).reduce((sum, group) => sum + group.rawBytes, 0)).toBe(
      size.rawBytes,
    );
    expect(
      Object.values(size.categories).reduce((sum, group) => sum + group.zipPayloadBytes, 0),
    ).toBe(size.zipPayloadBytes);
  });

  it.each([Buffer.alloc(0), Buffer.from('not a ZIP'), fixtureZip().subarray(0, -1)])(
    'rejects missing and truncated archives',
    (archive) =>
      expect(() => measureDistribution(archive, distDir)).toThrow(/Invalid distribution ZIP/),
  );

  it('rejects a central directory whose count does not match its records', () => {
    const archive = fixtureZip();
    const end = archive.length - 22 - 'fixture'.length;
    archive.writeUInt16LE(files.length + 1, end + 8);
    archive.writeUInt16LE(files.length + 1, end + 10);
    expect(() => measureDistribution(archive, distDir)).toThrow(/central entry/);
  });

  it.each([
    ['data descriptors', 0x0808],
    ['encryption', 0x0801],
  ])('rejects unsupported %s flags', (_, flags) => {
    const archive = fixtureZip();
    const end = archive.length - 22 - 'fixture'.length;
    archive.writeUInt16LE(flags, archive.readUInt32LE(end + 16) + 8);
    expect(() => measureDistribution(archive, distDir)).toThrow(/unsupported entry flags/);
  });

  it('rejects disagreeing local headers', () => {
    const archive = fixtureZip();
    archive.writeUInt32LE(0, 14);
    expect(() => measureDistribution(archive, distDir)).toThrow(/local header differs/);
  });

  it('rejects a corrupted checksum even when both ZIP headers agree', () => {
    const archive = fixtureZip();
    const end = archive.length - 22 - 'fixture'.length;
    archive.writeUInt32LE(0, archive.readUInt32LE(end + 16) + 16);
    archive.writeUInt32LE(0, 14);
    expect(() => measureDistribution(archive, distDir)).toThrow(
      /output content or checksum differs/,
    );
  });

  it('rejects unsafe names and duplicated archived files', () => {
    expect(() =>
      measureDistribution(fixtureZip([{ ...files[0], name: '../escape.js' }]), distDir),
    ).toThrow(/unsafe file name/);
    expect(() => measureDistribution(fixtureZip([...files, files[0]]), distDir)).toThrow(
      /duplicate file/,
    );
  });

  it('rejects a stale ZIP when output contents changed without changing file length', () => {
    writeFileSync(path.join(distDir, 'assets/font.woff2'), Buffer.from([4, 3, 2, 1, 0]));
    expect(() => measureDistribution(fixtureZip(), distDir)).toThrow(
      /output content or checksum differs/,
    );
  });

  it('rejects files missing from either side of the package comparison', () => {
    rmSync(path.join(distDir, 'assets/font.woff2'));
    expect(() => measureDistribution(fixtureZip(), distDir)).toThrow(/extra or duplicate file/);
    writeFileSync(path.join(distDir, 'assets/font.woff2'), files[3].content);
    writeFileSync(path.join(distDir, 'unexpected.txt'), 'unexpected');
    expect(() => measureDistribution(fixtureZip(), distDir)).toThrow(
      /missing output files: unexpected.txt/,
    );
  });
});

describe('distribution budgets and browser targets', () => {
  const configured = parseDistributionBudgets(
    parse(readFileSync(new URL('../../build/distribution-budgets.toml', import.meta.url), 'utf8')),
  );

  it('accepts supported targets and their manifest version and package version', () => {
    for (const [target, manifestVersion] of [
      ['chrome', 3],
      ['edge', 3],
      ['firefox', 2],
    ] as const) {
      expect(parseDistributionTarget(target)).toBe(target);
      expect(() =>
        assertDistributionManifest(
          { manifest_version: manifestVersion, version: '1.2.3' },
          target,
          '1.2.3',
        ),
      ).not.toThrow();
    }
  });

  it.each([undefined, 'safari', '__proto__', 'toString'])(
    'rejects unsupported target %s',
    (target) => {
      expect(() => parseDistributionTarget(target)).toThrow(/Expected distribution target/);
    },
  );

  it('rejects the wrong browser manifest or stale package version', () => {
    expect(() =>
      assertDistributionManifest({ manifest_version: 3, version: '1.2.3' }, 'firefox', '1.2.3'),
    ).toThrow(/firefox MV2/);
    expect(() =>
      assertDistributionManifest({ manifest_version: 3, version: '1.2.2' }, 'chrome', '1.2.3'),
    ).toThrow(/v1.2.3/);
  });

  it('fails strict validation for unknown, missing and noninteger byte limits', () => {
    expect(() => parseDistributionBudgets({ ...configured, typo: 1 })).toThrow(
      /root must contain only/,
    );
    expect(() =>
      parseDistributionBudgets({ ...configured, targets: { chrome: configured.targets.chrome } }),
    ).toThrow(/targets must contain only/);
    for (const invalid of [-1, 1.5, '100', Number.POSITIVE_INFINITY]) {
      expect(() =>
        parseDistributionBudgets({
          ...configured,
          categories: { ...configured.categories, css: invalid },
        }),
      ).toThrow(/nonnegative integer/);
    }
  });

  it('passes exact limits and fails target ZIP, raw total and category regressions together', () => {
    const size = measureDistribution(fixtureZip(), distDir);
    const exact = {
      targets: {
        chrome: { zip_bytes: size.zipBytes, raw_bytes: size.rawBytes },
        edge: { zip_bytes: size.zipBytes, raw_bytes: size.rawBytes },
        firefox: { zip_bytes: size.zipBytes, raw_bytes: size.rawBytes },
      },
      categories: Object.fromEntries(
        DISTRIBUTION_CATEGORIES.map((category) => [category, size.categories[category].rawBytes]),
      ),
    };
    const budgets = parseDistributionBudgets(exact);
    expect(() => assertDistributionBudgets(size, 'chrome', budgets)).not.toThrow();
    budgets.targets.chrome.zip_bytes--;
    budgets.targets.chrome.raw_bytes--;
    budgets.categories.javascript--;
    expect(() => assertDistributionBudgets(size, 'chrome', budgets)).toThrow(
      /ZIP:.*\n.*uncompressed:.*\n.*javascript raw:/,
    );
    expect(() =>
      assertDistributionBudgets(size, 'edge', { ...budgets, categories: configured.categories }),
    ).not.toThrow();
  });
});

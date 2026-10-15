/** Read the actual WXT archive, never recompress modules to estimate a distribution's size. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

export const DISTRIBUTION_TARGETS = { chrome: 3, edge: 3, firefox: 2 } as const;
export type DistributionTarget = keyof typeof DISTRIBUTION_TARGETS;
export const DISTRIBUTION_CATEGORIES = [
  'javascript',
  'css',
  'fonts',
  'locales',
  'images',
  'other',
] as const;
type DistributionCategory = (typeof DISTRIBUTION_CATEGORIES)[number];
type CategorySize = { files: number; rawBytes: number; zipPayloadBytes: number };
export type DistributionSize = {
  zipBytes: number;
  rawBytes: number;
  zipPayloadBytes: number;
  zipOverheadBytes: number;
  files: number;
  categories: Record<DistributionCategory, CategorySize>;
};
export type DistributionBudgets = {
  targets: Record<DistributionTarget, { zip_bytes: number; raw_bytes: number }>;
  categories: Record<DistributionCategory, number>;
};

const ZIP = {
  end: 0x06054b50,
  central: 0x02014b50,
  local: 0x04034b50,
  endLength: 22,
  centralLength: 46,
  localLength: 30,
  maxCommentLength: 0xffff,
  zip64Size: 0xffffffff,
} as const;

// Node's native crc32 requires 22.15+, while Vite 8 also supports Node 20.19 and 22.12.
// This build-only checksum keeps the ZIP guard portable without another dependency.
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, byte) => {
  let value = byte;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function invalidZip(reason: string): never {
  throw new Error(`Invalid distribution ZIP: ${reason}`);
}

function categoryOf(file: string): DistributionCategory {
  if (/^_locales\/[^/]+\/messages\.json$/.test(file)) return 'locales';
  if (/\.(?:js|mjs|cjs)$/i.test(file)) return 'javascript';
  if (/\.css$/i.test(file)) return 'css';
  if (/\.(?:woff2?|ttf|otf)$/i.test(file)) return 'fonts';
  if (/\.(?:svg|png|jpe?g|gif|webp|avif|ico)$/i.test(file)) return 'images';
  return 'other';
}

function distributionFiles(root: string, prefix = ''): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const name = prefix + entry.name;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      for (const [file, bytes] of distributionFiles(fullPath, `${name}/`)) files.set(file, bytes);
    } else if (entry.isFile()) {
      files.set(name, readFileSync(fullPath));
    } else {
      throw new Error(`Distribution contains a symlink or unsupported file: ${name}`);
    }
  }
  return files;
}

/**
 * Supports the single-disk ZIP32 archives WXT emits (stored or deflated, no encryption or data
 * descriptors). Reject unsupported formats rather than silently report incomplete measurements.
 * Every archived file must match the output directory byte for byte, including the manifest.
 */
export function measureDistribution(archive: Buffer, distDir: string): DistributionSize {
  if (archive.length < ZIP.endLength) invalidZip('missing end record');
  let end = archive.length - ZIP.endLength;
  const earliestEnd = Math.max(0, end - ZIP.maxCommentLength);
  while (
    end >= earliestEnd &&
    (archive.readUInt32LE(end) !== ZIP.end ||
      end + ZIP.endLength + archive.readUInt16LE(end + 20) !== archive.length)
  ) {
    end--;
  }
  if (end < earliestEnd) invalidZip('missing or truncated end record');
  const count = archive.readUInt16LE(end + 10);
  const centralSize = archive.readUInt32LE(end + 12);
  const centralStart = archive.readUInt32LE(end + 16);
  if (
    archive.readUInt16LE(end + 4) !== 0 ||
    archive.readUInt16LE(end + 6) !== 0 ||
    archive.readUInt16LE(end + 8) !== count ||
    count === ZIP.maxCommentLength ||
    centralSize === ZIP.zip64Size ||
    centralStart === ZIP.zip64Size
  ) {
    invalidZip('multi-disk and ZIP64 archives are unsupported');
  }
  if (!count || centralStart + centralSize !== end) invalidZip('incorrect central directory size');

  const remaining = distributionFiles(distDir);
  const size: DistributionSize = {
    zipBytes: archive.length,
    rawBytes: 0,
    zipPayloadBytes: 0,
    zipOverheadBytes: 0,
    files: count,
    categories: Object.fromEntries(
      DISTRIBUTION_CATEGORIES.map((category) => [
        category,
        { files: 0, rawBytes: 0, zipPayloadBytes: 0 },
      ]),
    ) as DistributionSize['categories'],
  };
  let cursor = centralStart;
  let nextLocal = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + ZIP.centralLength > end || archive.readUInt32LE(cursor) !== ZIP.central) {
      invalidZip('missing or truncated central entry');
    }
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const checksum = archive.readUInt32LE(cursor + 16);
    const zipBytes = archive.readUInt32LE(cursor + 20);
    const rawBytes = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const entryEnd =
      cursor +
      ZIP.centralLength +
      nameLength +
      archive.readUInt16LE(cursor + 30) +
      archive.readUInt16LE(cursor + 32);
    const local = archive.readUInt32LE(cursor + 42);
    if (entryEnd > end || !nameLength) invalidZip('truncated or empty entry name');
    if (
      (flags & ~0x0800) !== 0 ||
      (method !== 0 && method !== 8) ||
      archive.readUInt16LE(cursor + 34) !== 0 ||
      rawBytes === ZIP.zip64Size ||
      zipBytes === ZIP.zip64Size ||
      local === ZIP.zip64Size
    ) {
      invalidZip('unsupported entry flags, compression or ZIP64 entry');
    }
    const nameBytes = archive.subarray(
      cursor + ZIP.centralLength,
      cursor + ZIP.centralLength + nameLength,
    );
    const name = nameBytes.toString('utf8');
    if (
      !Buffer.from(name).equals(nameBytes) ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
      invalidZip(`unsafe file name: ${JSON.stringify(name)}`);
    }
    const expected = remaining.get(name);
    if (!expected) invalidZip(`extra or duplicate file: ${name}`);
    if (expected.length !== rawBytes) invalidZip(`output size differs: ${name}`);
    if (
      local !== nextLocal ||
      local + ZIP.localLength > centralStart ||
      archive.readUInt32LE(local) !== ZIP.local ||
      archive.readUInt16LE(local + 6) !== flags ||
      archive.readUInt16LE(local + 8) !== method ||
      archive.readUInt32LE(local + 14) !== checksum ||
      archive.readUInt32LE(local + 18) !== zipBytes ||
      archive.readUInt32LE(local + 22) !== rawBytes ||
      archive.readUInt16LE(local + 26) !== nameLength
    ) {
      invalidZip(`local header differs or overlaps: ${name}`);
    }
    const dataStart = local + ZIP.localLength + nameLength + archive.readUInt16LE(local + 28);
    if (
      dataStart + zipBytes > centralStart ||
      !archive
        .subarray(local + ZIP.localLength, local + ZIP.localLength + nameLength)
        .equals(nameBytes)
    ) {
      invalidZip(`truncated payload or mismatched local name: ${name}`);
    }
    const payload = archive.subarray(dataStart, dataStart + zipBytes);
    const content =
      method === 0 ? payload : inflateRawSync(payload, { maxOutputLength: Math.max(1, rawBytes) });
    if (!content.equals(expected) || crc32(content) !== checksum) {
      invalidZip(`output content or checksum differs: ${name}`);
    }
    remaining.delete(name);
    const category = size.categories[categoryOf(name)];
    category.files++;
    category.rawBytes += rawBytes;
    category.zipPayloadBytes += zipBytes;
    size.rawBytes += rawBytes;
    size.zipPayloadBytes += zipBytes;
    cursor = entryEnd;
    nextLocal = dataStart + zipBytes;
  }
  if (cursor !== end || nextLocal !== centralStart)
    invalidZip('unaccounted archive entries or bytes');
  if (remaining.size) invalidZip(`missing output files: ${[...remaining.keys()].join(', ')}`);
  size.zipOverheadBytes = size.zipBytes - size.zipPayloadBytes;
  return size;
}

function strictTable(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid distribution budgets: ${label} must be a table`);
  }
  const table = value as Record<string, unknown>;
  if (Object.keys(table).length !== keys.length || keys.some((key) => !Object.hasOwn(table, key))) {
    throw new Error(`Invalid distribution budgets: ${label} must contain only ${keys.join(', ')}`);
  }
  return table;
}

function byteLimit(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Invalid distribution budgets: ${label} must be a nonnegative integer in bytes`,
    );
  }
  return value;
}

/** Strict build-only schema; unknown, missing, fractional and negative limits fail the check. */
export function parseDistributionBudgets(value: unknown): DistributionBudgets {
  const root = strictTable(value, ['targets', 'categories'], 'root');
  const targets = strictTable(root.targets, Object.keys(DISTRIBUTION_TARGETS), 'targets');
  const categories = strictTable(root.categories, DISTRIBUTION_CATEGORIES, 'categories');
  return {
    targets: Object.fromEntries(
      Object.keys(DISTRIBUTION_TARGETS).map((target) => {
        const limits = strictTable(
          targets[target],
          ['zip_bytes', 'raw_bytes'],
          `targets.${target}`,
        );
        return [
          target,
          {
            zip_bytes: byteLimit(limits.zip_bytes, `targets.${target}.zip_bytes`),
            raw_bytes: byteLimit(limits.raw_bytes, `targets.${target}.raw_bytes`),
          },
        ];
      }),
    ) as DistributionBudgets['targets'],
    categories: Object.fromEntries(
      DISTRIBUTION_CATEGORIES.map((category) => [
        category,
        byteLimit(categories[category], `categories.${category}`),
      ]),
    ) as DistributionBudgets['categories'],
  };
}

export function parseDistributionTarget(value: string | undefined): DistributionTarget {
  if (!value || !Object.hasOwn(DISTRIBUTION_TARGETS, value)) {
    throw new Error(
      `Expected distribution target: ${Object.keys(DISTRIBUTION_TARGETS).join(', ')}`,
    );
  }
  return value as DistributionTarget;
}

export function assertDistributionManifest(
  manifest: unknown,
  target: DistributionTarget,
  version: string,
): void {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('manifest_version' in manifest) ||
    manifest.manifest_version !== DISTRIBUTION_TARGETS[target] ||
    !('version' in manifest) ||
    manifest.version !== version
  ) {
    throw new Error(
      `Distribution manifest must be ${target} MV${DISTRIBUTION_TARGETS[target]} v${version}`,
    );
  }
}

export function assertDistributionBudgets(
  size: DistributionSize,
  target: DistributionTarget,
  budgets: DistributionBudgets,
): void {
  const checks: [string, number, number][] = [
    ['ZIP', size.zipBytes, budgets.targets[target].zip_bytes],
    ['uncompressed', size.rawBytes, budgets.targets[target].raw_bytes],
    ...DISTRIBUTION_CATEGORIES.map<[string, number, number]>((category) => [
      `${category} raw`,
      size.categories[category].rawBytes,
      budgets.categories[category],
    ]),
  ];
  const failures = checks.flatMap(([label, actual, limit]) =>
    actual > limit ? [`${label}: ${actual} > ${limit} bytes (+${actual - limit})`] : [],
  );
  if (failures.length)
    throw new Error(`${target} distribution size budget exceeded:\n${failures.join('\n')}`);
}

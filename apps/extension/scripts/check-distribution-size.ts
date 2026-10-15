import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from '@bookmark-scout/config';
import { parse } from 'smol-toml';
import {
  assertDistributionBudgets,
  assertDistributionManifest,
  DISTRIBUTION_TARGETS,
  measureDistribution,
  parseDistributionBudgets,
  parseDistributionTarget,
} from '../build/distribution-size';

try {
  if (process.argv.length !== 3)
    throw new Error('Usage: bun scripts/check-distribution-size.ts <browser>');
  const target = parseDistributionTarget(process.argv[2]);
  const appRoot = fileURLToPath(new URL('../', import.meta.url));
  const { version } = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  const zipPath = path.join(appRoot, 'dist', `${site.slug}-v${version}-${target}.zip`);
  const distDir = path.join(appRoot, 'dist', `${target}-mv${DISTRIBUTION_TARGETS[target]}`);
  const archive = readFileSync(zipPath);
  if (statSync(zipPath).size !== archive.length)
    throw new Error('Distribution ZIP changed during read');
  const budgets = parseDistributionBudgets(
    parse(readFileSync(path.join(appRoot, 'build/distribution-budgets.toml'), 'utf8')),
  );
  assertDistributionManifest(
    JSON.parse(readFileSync(path.join(distDir, 'manifest.json'), 'utf8')),
    target,
    version,
  );
  const size = measureDistribution(archive, distDir);
  console.log(JSON.stringify({ target, version, zipPath, distDir, ...size }, null, 2));
  assertDistributionBudgets(size, target, budgets);
  console.log(`${target} distribution size budgets passed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

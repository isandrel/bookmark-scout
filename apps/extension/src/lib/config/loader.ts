/**
 * Raw TOML loader for Bun scripts and tests. Extension runtime code uses runtime.ts instead;
 * build/toml-config.ts parses its TOML modules before bundling, so the parser is not shipped.
 */
import { parse } from 'smol-toml';
import { assembleConfigTree, type ConfigTree } from './runtime';

// Keep the existing explicit-import API available to Bun scripts and tests.
export {
  type ConfigReader,
  type ConfigTree,
  configPathSegments,
  createConfigReader,
} from './runtime';

/** Raw TOML text keyed by its path relative to config/, e.g. `ai/agent.toml`. */
export type ConfigFiles = Readonly<Record<string, string>>;

/** Parses every file and assembles its frozen namespace, rejecting invalid or overlapping files. */
export function loadAppConfig(files: ConfigFiles): ConfigTree {
  return assembleConfigTree(files, (text, file) => {
    try {
      return parse(text);
    } catch (error) {
      throw new Error(`Config file ${file} is not valid TOML: ${(error as Error).message}`);
    }
  });
}

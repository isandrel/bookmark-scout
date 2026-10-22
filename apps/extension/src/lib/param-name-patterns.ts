/** Ends a pattern that matches every parameter name starting with what comes before it. */
const PREFIX_WILDCARD = '*';

/**
 * Finds the entry of a list the user edits that a query parameter name matches: each entry is a
 * whole name, or a prefix ending in `*` (`utm_*` matches `utm_source` and `utm_name`). Case is
 * ignored; a whole name wins over a prefix.
 */
export function createParamNamePatternFinder(
  patterns: readonly string[],
): (name: string) => string | undefined {
  const names = new Map<string, string>();
  const prefixes: [prefix: string, pattern: string][] = [];
  for (const pattern of patterns) {
    const lower = pattern.toLowerCase();
    if (lower.endsWith(PREFIX_WILDCARD)) {
      prefixes.push([lower.slice(0, -PREFIX_WILDCARD.length), pattern]);
    } else {
      names.set(lower, pattern);
    }
  }
  return (name) => {
    const lower = name.toLowerCase();
    return names.get(lower) ?? prefixes.find(([prefix]) => lower.startsWith(prefix))?.[1];
  };
}

/** Whether a query parameter name matches a list the user edits (`createParamNamePatternFinder`). */
export function createParamNameMatcher(patterns: readonly string[]): (name: string) => boolean {
  const find = createParamNamePatternFinder(patterns);
  return (name) => find(name) !== undefined;
}

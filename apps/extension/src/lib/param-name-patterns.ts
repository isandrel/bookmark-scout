/** Ends a pattern that matches every parameter name starting with what comes before it. */
const PREFIX_WILDCARD = '*';

/**
 * A test for query parameter names against a list the user edits: each entry is a whole name, or
 * a prefix ending in `*` (`utm_*` matches `utm_source` and `utm_name`). Case is ignored.
 */
export function createParamNameMatcher(patterns: readonly string[]): (name: string) => boolean {
  const names = new Set<string>();
  const prefixes: string[] = [];
  for (const pattern of patterns) {
    const lower = pattern.toLowerCase();
    if (lower.endsWith(PREFIX_WILDCARD)) prefixes.push(lower.slice(0, -PREFIX_WILDCARD.length));
    else names.add(lower);
  }
  return (name) => {
    const lower = name.toLowerCase();
    return names.has(lower) || prefixes.some((prefix) => lower.startsWith(prefix));
  };
}

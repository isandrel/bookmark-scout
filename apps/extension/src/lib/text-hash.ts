/**
 * FNV-1a (32-bit): a short, stable fingerprint of a text, so the text itself need not be kept
 * (the manager's clipboard) or compared in full (a Smart Rule's version), and the same on every
 * device and in every release (a card placeholder's color). Not for security.
 */

/** FNV-1a's 32-bit offset basis and prime. */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** The fingerprint as an unsigned 32-bit integer. */
export function hashText32(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** The fingerprint in hex. */
export function hashText(text: string): string {
  return hashText32(text).toString(HEX_RADIX);
}

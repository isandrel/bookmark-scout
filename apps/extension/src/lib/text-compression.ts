/**
 * Text compressed with gzip and written as base64, so a large value fits a storage quota measured
 * in bytes of JSON. Uses the browser's own `CompressionStream`, which every supported browser has
 * (and the background's service worker or event page too). Also the base64 conversions every
 * other binary value written as text uses (data URLs, covers in the backup file).
 */

// Large strings go to `String.fromCharCode` in slices; one call per byte would be slow, and one
// call for everything would exceed the argument limit.
const BASE64_CHUNK_BYTES = 0x8000;

async function pipeBytes(
  bytes: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Base64 writes each group of 3 bytes as 4 characters, padding the last group.
const BASE64_GROUP_BYTES = 3;
const BASE64_GROUP_CHARS = 4;

/** How many characters base64 writes for `bytes` bytes. */
export function base64Length(bytes: number): number {
  return Math.ceil(bytes / BASE64_GROUP_BYTES) * BASE64_GROUP_CHARS;
}

/** `bytes` as base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK_BYTES));
  }
  return btoa(binary);
}

/** The bytes `base64` holds. Throws when it is not base64. */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** `text` gzip-compressed, as base64. */
export async function gzipToBase64(text: string): Promise<string> {
  return bytesToBase64(
    await pipeBytes(new TextEncoder().encode(text), new CompressionStream('gzip')),
  );
}

/** The text `gzipToBase64` compressed. Rejects when `base64` is not gzip-compressed text. */
export async function gunzipFromBase64(base64: string): Promise<string> {
  const bytes = base64ToBytes(base64);
  return new TextDecoder().decode(await pipeBytes(bytes, new DecompressionStream('gzip')));
}

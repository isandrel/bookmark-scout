/**
 * Text compressed with gzip and written as base64, so a large value fits a storage quota measured
 * in bytes of JSON. Uses the browser's own `CompressionStream`, which every supported browser has
 * (and the background's service worker or event page too).
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

/** `text` gzip-compressed, as base64. */
export async function gzipToBase64(text: string): Promise<string> {
  const compressed = await pipeBytes(new TextEncoder().encode(text), new CompressionStream('gzip'));
  let binary = '';
  for (let start = 0; start < compressed.length; start += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...compressed.subarray(start, start + BASE64_CHUNK_BYTES));
  }
  return btoa(binary);
}

/** The text `gzipToBase64` compressed. Rejects when `base64` is not gzip-compressed text. */
export async function gunzipFromBase64(base64: string): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(await pipeBytes(bytes, new DecompressionStream('gzip')));
}

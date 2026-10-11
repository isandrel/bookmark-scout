/**
 * Native messaging framing: a 32-bit length in little-endian byte order (the native order on
 * every platform the browsers ship for), then that many bytes of UTF-8 JSON. The local socket
 * between `serve` and the native host uses the same framing.
 */

const HEADER_BYTES = 4;

export class FrameError extends Error {}

export function encodeFrame(message: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  const frame = new Uint8Array(HEADER_BYTES + body.length);
  new DataView(frame.buffer).setUint32(0, body.length, true);
  frame.set(body, HEADER_BYTES);
  return frame;
}

/** Collects bytes as they arrive and returns each complete message, parsed. */
export class FrameDecoder {
  private buffer = new Uint8Array(0);

  constructor(private readonly maxBytes: number) {}

  /** Throws FrameError for an oversized frame or one that is not JSON; the stream is then unusable. */
  push(chunk: Uint8Array): unknown[] {
    const joined = new Uint8Array(this.buffer.length + chunk.length);
    joined.set(this.buffer);
    joined.set(chunk, this.buffer.length);
    const messages: unknown[] = [];
    let offset = 0;
    while (joined.length - offset >= HEADER_BYTES) {
      const length = new DataView(joined.buffer, offset, HEADER_BYTES).getUint32(0, true);
      if (length > this.maxBytes) {
        throw new FrameError(
          `A message of ${length} bytes is over the ${this.maxBytes}-byte limit.`,
        );
      }
      if (joined.length - offset - HEADER_BYTES < length) break;
      const body = joined.subarray(offset + HEADER_BYTES, offset + HEADER_BYTES + length);
      try {
        messages.push(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)));
      } catch {
        throw new FrameError("A message is not valid UTF-8 JSON.");
      }
      offset += HEADER_BYTES + length;
    }
    this.buffer = joined.slice(offset);
    return messages;
  }
}

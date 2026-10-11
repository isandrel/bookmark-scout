import { describe, expect, test } from "bun:test";
import { encodeFrame, FrameDecoder, FrameError } from "./framing";

describe("framing", () => {
  test("round-trips a message with a little-endian length", () => {
    const frame = encodeFrame({ type: "hello", text: "Ünïcode ✓" });
    const length = new DataView(frame.buffer).getUint32(0, true);
    expect(length).toBe(frame.length - 4);
    expect(new FrameDecoder(1024).push(frame)).toEqual([{ type: "hello", text: "Ünïcode ✓" }]);
  });

  test("joins split chunks and splits joined frames", () => {
    const decoder = new FrameDecoder(1024);
    const both = new Uint8Array([...encodeFrame({ a: 1 }), ...encodeFrame({ b: 2 })]);
    expect(decoder.push(both.subarray(0, 3))).toEqual([]);
    expect(decoder.push(both.subarray(3, 10))).toEqual([]);
    expect(decoder.push(both.subarray(10))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("refuses a frame over the limit before reading its body", () => {
    const decoder = new FrameDecoder(8);
    expect(() => decoder.push(encodeFrame({ long: "0123456789" }).subarray(0, 4))).toThrow(
      FrameError,
    );
  });

  test("refuses a body that is not JSON", () => {
    const body = new TextEncoder().encode("{nope");
    const frame = new Uint8Array(4 + body.length);
    new DataView(frame.buffer).setUint32(0, body.length, true);
    frame.set(body, 4);
    expect(() => new FrameDecoder(1024).push(frame)).toThrow(FrameError);
  });
});

import { describe, expect, it } from 'vitest';
import { readImageSize } from '@/lib/image-size';
import { MIME } from '@/lib/mime-types';
import { solidPng } from '../solid-png';

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const le16 = (value: number) => [value & 0xff, value >>> 8];
const be16 = (value: number) => [value >>> 8, value & 0xff];
const le24 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, value >>> 16];
const le32 = (value: number) => [...le16(value & 0xffff), ...le16(value >>> 16)];
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

/** `RIFF`, a file size, `WEBP`, then one chunk of `name` holding `data`. */
const webp = (name: string, data: number[]) =>
  bytes(
    ascii('RIFF'),
    le32(4 + 8 + data.length),
    ascii('WEBP'),
    ascii(name),
    le32(data.length),
    data,
  );

describe('image sizes read from the header, without decoding (covers V2)', () => {
  it('reads a PNG from its IHDR chunk', () => {
    expect(readImageSize(new Uint8Array(solidPng(321, 123)), MIME.png)).toEqual({
      width: 321,
      height: 123,
    });
  });

  /** A GIF image descriptor: `2C`, left, top, width, height, and its flags. */
  const gifFrame = (left: number, top: number, width: number, height: number) => [
    0x2c,
    ...le16(left),
    ...le16(top),
    ...le16(width),
    ...le16(height),
    0,
  ];

  it('reads a GIF from its logical screen when its first frame fits in it', () => {
    const gif = bytes(ascii('GIF89a'), le16(640), le16(480), [0, 0, 0], gifFrame(0, 0, 640, 480));
    expect(readImageSize(gif, MIME.gif)).toEqual({ width: 640, height: 480 });
  });

  it('reads a GIF whose first frame is larger than its logical screen as the frame (covers V2)', () => {
    // A tiny stated screen with a huge frame: decoders draw the whole frame, so the size check
    // must see it. The frame comes after a global color table (flag 0x80, 2^(1+1) colors) and a
    // graphic control extension with its sub-blocks.
    const gif = bytes(
      ascii('GIF89a'),
      le16(1),
      le16(1),
      [0x81, 0, 0],
      new Array(3 * 4).fill(0),
      [0x21, 0xf9, 4, 0, 0, 0, 0, 0],
      [0x21, 0xfe, 2, 0x41, 0x42, 3, 0x43, 0x44, 0x45, 0],
      gifFrame(10, 20, 9000, 9000),
    );
    expect(readImageSize(gif, MIME.gif)).toEqual({ width: 9010, height: 9020 });
  });

  it('reads nothing from a GIF without a frame, or with an unknown block before it', () => {
    expect(readImageSize(bytes(ascii('GIF89a'), le16(640), le16(480), [0, 0, 0]), MIME.gif)).toBe(
      undefined,
    );
    const unknown = bytes(ascii('GIF89a'), le16(64), le16(64), [0, 0, 0], [0x99]);
    expect(readImageSize(unknown, MIME.gif)).toBeUndefined();
    // A frame descriptor cut short.
    const cut = bytes(ascii('GIF89a'), le16(64), le16(64), [0, 0, 0], [0x2c, 0, 0, 0]);
    expect(readImageSize(cut, MIME.gif)).toBeUndefined();
  });

  it('reads lossy, lossless, and extended WebP', () => {
    // The top two bits of each lossy side are a scale, not part of the size.
    const lossy = webp('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(0xc000 | 1200), ...le16(630)]);
    expect(readImageSize(lossy, MIME.webp)).toEqual({ width: 1200, height: 630 });
    const lossless = webp('VP8L', [0x2f, ...le32((1199 & 0x3fff) | ((629 & 0x3fff) << 14)), 0]);
    expect(readImageSize(lossless, MIME.webp)).toEqual({ width: 1200, height: 630 });
    const extended = webp('VP8X', [0x10, 0, 0, 0, ...le24(16_383), ...le24(9_999)]);
    expect(readImageSize(extended, MIME.webp)).toEqual({ width: 16_384, height: 10_000 });
  });

  it('reads a JPEG frame header after other segments and fill bytes, baseline or progressive', () => {
    const app0 = [0xff, 0xe0, ...be16(16), ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    const dht = [0xff, 0xc4, ...be16(4), 0, 0];
    for (const sof of [0xc0, 0xc2]) {
      const jpeg = bytes(
        [0xff, 0xd8],
        app0,
        dht,
        // Fill bytes before a marker are allowed.
        [0xff, 0xff, sof, ...be16(17), 8, ...be16(630), ...be16(1200), 3],
      );
      expect(readImageSize(jpeg, MIME.jpeg)).toEqual({ width: 1200, height: 630 });
    }
  });

  it('reads nothing from a cut-short, broken, empty, or other image', () => {
    const png = new Uint8Array(solidPng(321, 123));
    expect(readImageSize(png.subarray(0, 20), MIME.png)).toBeUndefined();
    // A PNG whose first chunk is not IHDR is broken.
    const noHeader = png.slice();
    noHeader.set(ascii('IDAT'), 12);
    expect(readImageSize(noHeader, MIME.png)).toBeUndefined();
    expect(readImageSize(bytes(ascii('GIF89a'), le16(0), le16(480)), MIME.gif)).toBeUndefined();
    // A scan before any frame header, and a segment that runs past the end.
    expect(readImageSize(bytes([0xff, 0xd8, 0xff, 0xda, 0, 2]), MIME.jpeg)).toBeUndefined();
    expect(readImageSize(bytes([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xf0]), MIME.jpeg)).toBeUndefined();
    expect(readImageSize(bytes([0xff, 0xd8, 0x00]), MIME.jpeg)).toBeUndefined();
    expect(readImageSize(webp('ALPH', [0, 0, 0, 0]), MIME.webp)).toBeUndefined();
    expect(readImageSize(png, MIME.bmp)).toBeUndefined();
    expect(readImageSize(new Uint8Array(), MIME.png)).toBeUndefined();
  });

  it('reads a subarray at its own offset', () => {
    const png = new Uint8Array(solidPng(99, 77));
    const padded = new Uint8Array(png.length + 5);
    padded.set(png, 5);
    expect(readImageSize(padded.subarray(5), MIME.png)).toEqual({ width: 99, height: 77 });
  });
});

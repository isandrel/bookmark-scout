/**
 * The pixel size an image file states in its header, read without decoding it, so a small file
 * that would decode to a huge picture is refused before the browser allocates it (Fetch Covers,
 * `covers.ts`). The browser's decoder takes the size from the same header. PNG, GIF, JPEG, and
 * WebP, the kept cover types; undefined for another type or a header that is cut short or broken.
 * The offsets below are facts of each file format.
 */

export type ImageSize = { width: number; height: number };

/** PNG: the signature, then the IHDR chunk's length and name, then width and height, big-endian. */
const PNG_IHDR_NAME_OFFSET = 12;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const PNG_IHDR = 'IHDR';

/** GIF: the six-byte signature, then the logical screen's width and height (little-endian). */
const GIF_WIDTH_OFFSET = 6;
const GIF_HEIGHT_OFFSET = 8;

/** WebP: `RIFF`, the file size, `WEBP`, then the first chunk's name, its size, and its data. */
const WEBP_CHUNK_NAME_OFFSET = 12;
const FOUR_CC_LENGTH = 4;
/** Lossy (`VP8 `): a 3-byte frame tag and a 3-byte start code, then 14-bit width and height. */
const VP8_WIDTH_OFFSET = 26;
const VP8_HEIGHT_OFFSET = 28;
const VP8_SIZE_MASK = 0x3fff;
/** Lossless (`VP8L`): a signature byte, then width - 1 and height - 1 as two 14-bit fields. */
const VP8L_BITS_OFFSET = 21;
const VP8L_SIZE_BITS = 14;
const VP8L_SIZE_MASK = 0x3fff;
/** Extended (`VP8X`): flags and reserved bytes, then canvas width - 1 and height - 1 (24-bit). */
const VP8X_WIDTH_OFFSET = 24;
const VP8X_HEIGHT_OFFSET = 27;
const UINT24_BYTES = 3;
const BITS_PER_BYTE = 8;

/** JPEG: segments of `FF`, a marker, and (for most) a big-endian length that counts itself. */
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_SOI_LENGTH = 2;
/** Start-of-frame markers, which hold the size: C0 to CF except DHT (C4), JPG (C8), DAC (CC). */
const JPEG_SOF_FIRST = 0xc0;
const JPEG_SOF_LAST = 0xcf;
const JPEG_DHT = 0xc4;
const JPEG_JPG = 0xc8;
const JPEG_DAC = 0xcc;
const JPEG_NOT_SOF = new Set([JPEG_DHT, JPEG_JPG, JPEG_DAC]);
/** Markers without a length: TEM and the restart markers. */
const JPEG_TEM = 0x01;
const JPEG_RST_FIRST = 0xd0;
const JPEG_RST_LAST = 0xd7;
/** Start of scan or end of image: no frame header came before them. */
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;
/** Inside a frame header: the marker and length, the sample precision, then height and width. */
const JPEG_SOF_HEIGHT_OFFSET = 5;
const JPEG_SOF_WIDTH_OFFSET = 7;

function fourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    ...Array.from({ length: FOUR_CC_LENGTH }, (_, index) => view.getUint8(offset + index)),
  );
}

function uint24(view: DataView, offset: number): number {
  let value = 0;
  for (let index = UINT24_BYTES - 1; index >= 0; index -= 1) {
    value = value * (1 << BITS_PER_BYTE) + view.getUint8(offset + index);
  }
  return value;
}

function pngSize(view: DataView): ImageSize | undefined {
  if (fourCC(view, PNG_IHDR_NAME_OFFSET) !== PNG_IHDR) return undefined;
  return { width: view.getUint32(PNG_WIDTH_OFFSET), height: view.getUint32(PNG_HEIGHT_OFFSET) };
}

function gifSize(view: DataView): ImageSize {
  return {
    width: view.getUint16(GIF_WIDTH_OFFSET, true),
    height: view.getUint16(GIF_HEIGHT_OFFSET, true),
  };
}

function webpSize(view: DataView): ImageSize | undefined {
  const chunk = fourCC(view, WEBP_CHUNK_NAME_OFFSET);
  if (chunk === 'VP8 ') {
    return {
      width: view.getUint16(VP8_WIDTH_OFFSET, true) & VP8_SIZE_MASK,
      height: view.getUint16(VP8_HEIGHT_OFFSET, true) & VP8_SIZE_MASK,
    };
  }
  if (chunk === 'VP8L') {
    const bits = view.getUint32(VP8L_BITS_OFFSET, true);
    return {
      width: (bits & VP8L_SIZE_MASK) + 1,
      height: ((bits >>> VP8L_SIZE_BITS) & VP8L_SIZE_MASK) + 1,
    };
  }
  if (chunk === 'VP8X') {
    return {
      width: uint24(view, VP8X_WIDTH_OFFSET) + 1,
      height: uint24(view, VP8X_HEIGHT_OFFSET) + 1,
    };
  }
  return undefined;
}

function jpegSize(view: DataView): ImageSize | undefined {
  let offset = JPEG_SOI_LENGTH;
  while (offset < view.byteLength) {
    if (view.getUint8(offset) !== JPEG_MARKER_PREFIX) return undefined;
    // Any number of FF bytes may pad the space before a marker.
    let markerOffset = offset + 1;
    while (view.getUint8(markerOffset) === JPEG_MARKER_PREFIX) markerOffset += 1;
    const marker = view.getUint8(markerOffset);
    const segment = markerOffset - 1;
    if (marker === JPEG_SOS || marker === JPEG_EOI) return undefined;
    if (marker === JPEG_TEM || (marker >= JPEG_RST_FIRST && marker <= JPEG_RST_LAST)) {
      offset = markerOffset + 1;
      continue;
    }
    if (marker >= JPEG_SOF_FIRST && marker <= JPEG_SOF_LAST && !JPEG_NOT_SOF.has(marker)) {
      return {
        width: view.getUint16(segment + JPEG_SOF_WIDTH_OFFSET),
        height: view.getUint16(segment + JPEG_SOF_HEIGHT_OFFSET),
      };
    }
    offset = markerOffset + 1 + view.getUint16(markerOffset + 1);
  }
  return undefined;
}

const READERS: Partial<Record<string, (view: DataView) => ImageSize | undefined>> = {
  [MIME.png]: pngSize,
  [MIME.gif]: gifSize,
  [MIME.webp]: webpSize,
  [MIME.jpeg]: jpegSize,
};

/**
 * The width and height `bytes` (an image of `type`, as `sniffImageType` read it) states, or
 * undefined when its header cannot be read; a zero side counts as unreadable.
 */
export function readImageSize(bytes: Uint8Array, type: string): ImageSize | undefined {
  const read = READERS[type];
  if (!read) return undefined;
  try {
    const size = read(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    return size && size.width > 0 && size.height > 0 ? size : undefined;
  } catch {
    // A header cut short: DataView throws a RangeError past the end.
    return undefined;
  }
}

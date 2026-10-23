export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The first bytes of a PNG: the signature and the IHDR chunk with the size, enough for the cover
 * type and size checks; tests stub the decoding.
 */
export const pngHeader = (width: number, height: number) => {
  const header = new Uint8Array(33);
  const view = new DataView(header.buffer);
  header.set(PNG_SIGNATURE);
  view.setUint32(8, 13);
  header.set(
    [...'IHDR'].map((char) => char.charCodeAt(0)),
    12,
  );
  view.setUint32(16, width);
  view.setUint32(20, height);
  return header;
};

/** `pngHeader` as the data URL `tabs.captureVisibleTab` resolves to. */
export const pngDataUrl = (width: number, height: number) =>
  `data:image/png;base64,${btoa(String.fromCharCode(...pngHeader(width, height)))}`;

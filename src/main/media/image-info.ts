// Erkennt Bildformat und Grösse direkt aus den Dateibytes («Magic Bytes»).
// Der Hauptprozess verlässt sich NICHT auf Dateiendung oder Angaben der
// Oberfläche: Nur echte PNG-, JPEG- und WebP-Dateien werden gespeichert.

export type ImageInfo = { mime: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number };

export function sniffImage(b: Uint8Array): ImageInfo | null {
  return png(b) ?? jpeg(b) ?? webp(b);
}

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32be = (b: Uint8Array, o: number) =>
  ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

// PNG: Signatur 89 50 4E 47 0D 0A 1A 0A, danach IHDR mit Breite/Höhe
function png(b: Uint8Array): ImageInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((v, i) => b[i] === v) || ascii(b, 12, 4) !== 'IHDR') return null;
  return valid({ mime: 'image/png', width: u32be(b, 16), height: u32be(b, 20) });
}

// JPEG: beginnt mit FF D8; Grösse steht im ersten SOF-Segment (FFC0–FFCF ausser C4, C8, CC)
function jpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    const len = u16be(b, o + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return valid({ mime: 'image/jpeg', height: u16be(b, o + 5), width: u16be(b, o + 7) });
    }
    if (len < 2) return null;
    o += 2 + len;
  }
  return null;
}

// WebP: RIFF....WEBP mit VP8 (verlustbehaftet), VP8L (verlustfrei) oder VP8X (erweitert)
function webp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ')
    return valid({ mime: 'image/webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff });
  if (chunk === 'VP8L') {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return valid({ mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 });
  }
  if (chunk === 'VP8X')
    return valid({ mime: 'image/webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 });
  return null;
}

function valid(i: ImageInfo): ImageInfo | null {
  return i.width > 0 && i.height > 0 && i.width <= 20000 && i.height <= 20000 ? i : null;
}

export const EXT: Record<ImageInfo['mime'], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

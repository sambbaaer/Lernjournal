// Windows-Symboldatei (.ico) schreiben und lesen – ohne Zusatzbibliothek.
// Verwendet von scripts/render-icon.mjs (npm run icon) und den Tests.
//
// Aufbau: Kopf, je Grösse ein Verzeichniseintrag, dann die Bilder. 256 px als
// PNG (so verlangt es Windows), kleinere als 32-Bit-Bitmap mit Alphakanal –
// das verstehen alle Windows-Versionen, der Explorer und NSIS.
//
// Nur «löschbare» TypeScript-Syntax: Node/Electron führen die Datei direkt aus.

export type IcoImage = { size: number; rgba: Uint8Array; png?: Uint8Array };
export type IcoEntry = {
  width: number;
  height: number;
  bitCount: number;
  format: 'png' | 'bmp';
  data: Buffer;
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// RGBA (Zeilen von oben nach unten) → Bitmap-Daten im ICO-Format
function bitmapData(size: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== size * size * 4) throw new Error(`RGBA-Daten passen nicht zu ${size} × ${size}`);
  const maskRow = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // Grösse des Kopfs
  header.writeInt32LE(size, 4); // Breite
  header.writeInt32LE(size * 2, 8); // Höhe: Farbbild + Maske
  header.writeUInt16LE(1, 12); // Ebenen
  header.writeUInt16LE(32, 14); // Bit pro Pixel
  header.writeUInt32LE(size * size * 4 + maskRow * size, 20);
  const pixels = Buffer.alloc(size * size * 4);
  const mask = Buffer.alloc(maskRow * size);
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y; // Bitmaps stehen auf dem Kopf
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = (row * size + x) * 4;
      pixels[dst] = rgba[src + 2]!; // B
      pixels[dst + 1] = rgba[src + 1]!; // G
      pixels[dst + 2] = rgba[src]!; // R
      pixels[dst + 3] = rgba[src + 3]!; // A
      // Maske für ältere Darstellung: 1 = durchsichtig
      const m = row * maskRow + (x >> 3);
      if (rgba[src + 3] === 0) mask[m] = (mask[m] ?? 0) | (0x80 >> (x & 7));
    }
  }
  return Buffer.concat([header, pixels, mask]);
}

export function encodeIco(images: readonly IcoImage[]): Buffer {
  const sorted = [...images].sort((a, b) => a.size - b.size);
  const datas = sorted.map((img) => {
    if (img.size < 1 || img.size > 256) throw new Error(`Ungültige Symbolgrösse ${img.size}`);
    return img.size === 256 && img.png ? Buffer.from(img.png) : bitmapData(img.size, img.rgba);
  });
  const head = Buffer.alloc(6 + 16 * sorted.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2); // 1 = Symbol
  head.writeUInt16LE(sorted.length, 4);
  let offset = head.length;
  sorted.forEach((img, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(img.size === 256 ? 0 : img.size, e); // 0 bedeutet 256
    head.writeUInt8(img.size === 256 ? 0 : img.size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(datas[i]!.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += datas[i]!.length;
  });
  return Buffer.concat([head, ...datas]);
}

export function parseIco(file: Uint8Array): IcoEntry[] {
  const buf = Buffer.from(file.buffer, file.byteOffset, file.byteLength);
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1)
    throw new Error('Keine ICO-Datei');
  const count = buf.readUInt16LE(4);
  const entries: IcoEntry[] = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + 16 * i;
    if (e + 16 > buf.length) throw new Error('ICO-Verzeichnis abgeschnitten');
    const length = buf.readUInt32LE(e + 8);
    const offset = buf.readUInt32LE(e + 12);
    if (offset + length > buf.length) throw new Error('ICO-Bild ausserhalb der Datei');
    const data = buf.subarray(offset, offset + length);
    entries.push({
      width: buf[e] || 256,
      height: buf[e + 1] || 256,
      bitCount: buf.readUInt16LE(e + 6),
      format: data.subarray(0, 8).equals(PNG_SIGNATURE) ? 'png' : 'bmp',
      data,
    });
  }
  return entries;
}

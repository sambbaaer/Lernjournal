// Bilder vor dem Speichern aufbereiten (SPEC «Bildformate»):
//  - nur JPEG, PNG, WebP (HEIC von iPhones: verständlicher Hinweis)
//  - Ausrichtung aus den EXIF-Daten übernehmen (Handyfotos stehen richtig)
//  - auf höchstens 2400 px Kantenlänge verkleinern
//  - neu kodieren → ALLE Metadaten fallen weg, auch der GPS-Aufnahmeort
// Läuft im Renderer mit Browser-Bordmitteln (createImageBitmap, OffscreenCanvas),
// ohne Zusatzbibliothek und ohne Dateisystemzugriff.

export const MAX_SIDE = 2400;
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const QUALITY = 0.85;

export class ImageError extends Error {}

const SUPPORTED: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

export function targetSize(w: number, h: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export async function processImage(file: File): Promise<{ data: Uint8Array<ArrayBuffer>; name: string }> {
  const type = SUPPORTED[file.type];
  if (!type) {
    if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
      throw new ImageError(
        'iPhone-Fotos im HEIC-Format bitte zuerst als JPEG speichern (z. B. «Als JPEG exportieren»).',
      );
    }
    throw new ImageError(`«${file.name}» ist kein unterstütztes Bild. Möglich sind JPEG, PNG und WebP.`);
  }
  if (file.size > MAX_INPUT_BYTES) throw new ImageError(`«${file.name}» ist zu gross (höchstens 40 MB).`);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError(`«${file.name}» konnte nicht gelesen werden. Ist die Datei beschädigt?`);
  }
  const { width, height } = targetSize(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Bild konnte nicht verarbeitet werden.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob(type === 'image/png' ? { type } : { type, quality: QUALITY });
  return { data: new Uint8Array(await blob.arrayBuffer()), name: file.name };
}

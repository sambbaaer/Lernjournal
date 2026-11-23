// Liefert Testbilder aus fixtures/ (in der App: Main-Prozess liest media/<uuid>.<ext>).
import fs from 'node:fs';
import path from 'node:path';
import type { MediaResolver } from './to-docx.ts';

const fixtures = path.resolve(import.meta.dirname, '..', 'fixtures');

// Bildgrösse aus dem PNG-Kopf lesen (Bytes 16–23: Breite/Höhe, big-endian).
// In der App stehen width/height bereits in der Tabelle `media`.
export const resolveMedia: MediaResolver = (mediaId) => {
  const file = path.join(fixtures, `${mediaId}.png`);
  if (!/^[a-z0-9-]+$/i.test(mediaId) || !fs.existsSync(file)) return undefined; // keine Pfadtricks
  const data = fs.readFileSync(file);
  return { data, type: 'png', widthPx: data.readUInt32BE(16), heightPx: data.readUInt32BE(20) };
};

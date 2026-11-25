// Schlüssel für ein beschriftetes Bild im Export (AJ-32): Dasselbe Foto kann
// mit unterschiedlichen Beschriftungen vorkommen. Der Schlüssel verbindet
// Foto-ID und Beschriftung; der Exportdienst legt darunter das
// zusammengerechnete Bild ab, Word- und PDF-Aufbau finden es so wieder.
import { parseAnnotations } from './annotations';

// FNV-1a (32 Bit): kurz, schnell, ohne Node-Abhängigkeit. Kein
// Sicherheitsmerkmal – nur zum Unterscheiden innerhalb eines Exports.
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// null = keine (gültige) Beschriftung → Originalfoto verwenden
export function annotatedMediaKey(mediaId: string, annotations: unknown): string | null {
  const list = parseAnnotations(annotations);
  return list.length ? `${mediaId}#${fnv1a(JSON.stringify(list))}` : null;
}

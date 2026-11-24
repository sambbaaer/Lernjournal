// Atomares Schreiben einer Datei: erst vollständig in eine Temp-Datei im
// Zielordner, dann umbenennen. So entsteht nie eine halbe Datei, und eine
// bestehende Datei (Überschreiben hat der Speichern-Dialog bestätigt) bleibt
// bei einem Fehler unverändert.
//
// Gemeinsamer Baustein für den Word-Export (AJ-12/13), die Projektübergabe
// .ajournal (AJ-14) und später die Sicherungen (AJ-15). Die Temp-Datei liegt
// bewusst im selben Ordner wie das Ziel: Nur dort ist das Umbenennen atomar
// (über Laufwerksgrenzen hinweg wäre es ein Kopieren).
import { randomUUID } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';

// produce schreibt den vollständigen Inhalt nach tmp (und schliesst die Datei).
// Wirft produce oder das Umbenennen, wird die Temp-Datei entfernt und der
// ursprüngliche Fehler weitergegeben (die Aufrufer übersetzen ihn in eine
// verständliche Meldung).
export async function writeAtomically(file: string, produce: (tmp: string) => Promise<void>): Promise<void> {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID().slice(0, 8)}.tmp`);
  try {
    await produce(tmp);
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

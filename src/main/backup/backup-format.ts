// Format und Ablage der Sicherungen (AJ-15, ADR 0006).
//
// Im Projektordner:
//
//   backups/
//     sicherung-2026-11-24T08-30-00-000Z.zip   eine Sicherung = ein ZIP mit
//         journal.sqlite   konsistente Kopie (SQLite-Backup-API, wie beim
//                          .ajournal-Export: nie die laufende WAL-Datei),
//                          ohne Suchindex-Inhalt, verdichtet, Journalmodus DELETE
//         manifest.json    Zeitpunkt, Anlass, Versionen, Anzahl, neueste
//                          Journaltitel, Prüfsumme der Datenbank, Liste der
//                          Bilder mit SHA-256, Inhalts-Fingerabdruck
//     media/<uuid>.<ext>                       Bildvorrat für alle Sicherungen
//
// Warum ein gemeinsamer Bildvorrat statt Bilder in jedem ZIP? Bilder sind
// unveränderlich (neue Bilder bekommen neue UUIDs, die Legende steht in der
// Datenbank) und per SHA-256 prüfbar. Jede Sicherung verweist darum nur auf
// die Bilder, die sie braucht; jedes Bild liegt genau einmal im Vorrat. Mit
// 10 + bis zu 48 Monatsständen wären vollständige Kopien sonst ein Vielfaches
// der Bilder des Projekts. Die Rotation entfernt Bilder aus dem Vorrat, auf
// die keine verbleibende Sicherung mehr verweist.
//
// Das ZIP nutzt den misstrauischen Leser und den Schreiber der
// Projektübergabe (src/main/archive/zip-*.ts) – eigene Kennung im Manifest,
// damit eine Sicherung nie mit einer .ajournal-Datei verwechselt wird.
import { z } from 'zod';
import { BACKUP_ID_PATTERN, BACKUP_REASONS } from '@shared/backup';
import { MEDIA_ENTRY } from '../archive/archive-format';

export const BACKUP_DIR = 'backups';
// Bildvorrat: backups/media/<uuid>.<ext> (gleiche Namen wie im Projekt)
export const BACKUP_MEDIA_DIR = 'media';
export const BACKUP_EXTENSION = 'zip';

// Kennung und Version des Manifests (unabhängig von Schema- und Paketformat)
export const BACKUP_FORMAT = 'lernjournal-sicherung';
export const BACKUP_FORMAT_VERSION = 1;

// Ordner und Dateien, die eine angefangene Sicherung/Wiederherstellung
// zurücklassen kann (Absturz, Abbruch beim Beenden). Beginnen mit «.» und
// werden beim nächsten Öffnen des Projekts entfernt.
export const STAGING_PREFIX = '.wiederherstellung-';
export const isLeftover = (name: string) =>
  (name.startsWith('.') && name.endsWith('.tmp')) || name.startsWith(STAGING_PREFIX);

// ID aus dem Zeitpunkt: UTC, damit die Namen auch über Sommer-/Winterzeit
// hinweg eindeutig und alphabetisch = chronologisch sortiert sind.
export function backupIdFor(date: Date, counter = 0): string {
  const stamp = date.toISOString().replace(/:/g, '-').replace('.', '-');
  return counter > 0 ? `sicherung-${stamp}-${counter}` : `sicherung-${stamp}`;
}

// Zeitpunkt aus der ID (für Sicherungen, deren Manifest nicht lesbar ist)
export function dateFromBackupId(id: string): Date | null {
  if (!BACKUP_ID_PATTERN.test(id)) return null;
  const m = /^sicherung-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(id)!;
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

// Erster Blick: Kennung und Version (neuere Versionen → «bitte aktualisieren»)
export const BackupManifestHeadSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().min(1),
});

export const BackupManifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  appVersion: z.string().min(1).max(50),
  schemaVersion: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  reason: z.enum(BACKUP_REASONS),
  project: z.object({ id: z.string().min(1).max(100), title: z.string().max(200) }),
  // Anzahl Journale und Bilder in der Datenbank der Sicherung
  counts: z.object({ journals: z.number().int().nonnegative(), media: z.number().int().nonnegative() }),
  // Zuletzt bearbeitete Journale (für die Vorschau, neueste zuerst)
  recentTitles: z.array(z.string().max(300)).max(10),
  // SHA-256 über den Inhalt aller Datentabellen (ohne Suchindex), siehe
  // contentFingerprint: gleich = nichts geändert, keine neue Sicherung nötig
  fingerprint: Sha256,
  database: z.object({ size: z.number().int().nonnegative(), sha256: Sha256 }),
  // Bilder im Vorrat, auf die diese Sicherung verweist (ohne missingMedia)
  media: z.array(z.object({ path: z.string().regex(MEDIA_ENTRY), sha256: Sha256 })).max(20_000),
  // Bilder, die schon beim Sichern fehlten oder beschädigt waren
  missingMedia: z.number().int().nonnegative(),
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;

// Fehler rund um Sicherungen. Meldung für Lernende formuliert, geht
// unverändert an die Oberfläche (ipc-handler.ts); code für Tests/Protokoll.
export type BackupErrorCode =
  | 'damaged' // Sicherung beschädigt (ZIP, Prüfsumme, Datenbank)
  | 'newer-version' // mit neuerer Lernjournal-Version erstellt
  | 'not-found' // ID nicht (mehr) in der Liste
  | 'source' // aktuelles Projekt kann nicht gesichert werden
  | 'target' // Zielordner nicht verwendbar
  | 'busy' // es läuft bereits eine Sicherung/Wiederherstellung
  | 'io'; // Datenträger

export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupError'; // Meldung geht an die Oberfläche (ipc-handler.ts)
  }
}

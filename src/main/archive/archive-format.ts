// Format der Projektübergabe «.ajournal» (AJ-14, ADR 0005).
//
// Eine .ajournal-Datei ist ein gewöhnliches ZIP-Archiv mit genau diesen
// Einträgen – nichts anderem:
//
//   journal.sqlite        konsistente Kopie der Datenbank (SQLite-Backup-API,
//                         danach VACUUM, Journalmodus DELETE: ohne -wal/-shm)
//   media/<uuid>.<ext>    alle Bilder (png, jpg, webp), unverändert
//   manifest.json         Beschreibung + SHA-256 und Grösse jeder Datei
//
// Das Manifest steht am Schluss, weil die Prüfsummen beim Schreiben in einem
// Durchgang entstehen. Gefunden wird es über das zentrale Verzeichnis des ZIP
// (Position egal).
//
// Alle Grenzen (Limits) stehen hier an EINER Stelle. Es sind technische
// Schutzgrenzen gegen kaputte oder bösartige Dateien (Zip-Bombe), keine Zahlen
// aus offiziellen Vorgaben. Sie sind grosszügig für vier Lehrjahre bemessen:
// typisch sind einige hundert Journale und wenige tausend Bilder à 0,2–2 MB.
import { z } from 'zod';
import { MAX_IMAGE_BYTES } from '../media/media-service';

// Kennung im Manifest; schützt davor, ein fremdes ZIP als Projekt zu lesen
export const ARCHIVE_FORMAT = 'lernjournal-projekt';

// Version des Paketformats (Aufbau des ZIP und des Manifests) – unabhängig
// von der Datenbank-Schemaversion. Neuere Versionen werden beim Import mit
// verständlicher Meldung abgelehnt; ältere werden (sobald es sie gibt) beim
// Import umgewandelt. Erhöhen, wenn sich Einträge oder Manifest-Felder ändern.
export const ARCHIVE_FORMAT_VERSION = 1;

export const ARCHIVE_EXTENSION = 'ajournal';
export const MANIFEST_ENTRY = 'manifest.json';
export const DATABASE_ENTRY = 'journal.sqlite';
// Bilder heissen im Projekt immer media/<uuid>.<ext> (MediaService.add)
export const MEDIA_ENTRY =
  /^media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

export const ARCHIVE_LIMITS = {
  // Grösse der .ajournal-Datei. Unter 4 GiB, weil das Format bewusst ohne
  // ZIP64 auskommt (einfacher, weniger Angriffsfläche).
  maxArchiveBytes: 3 * GiB,
  // Summe aller entpackten Dateien (Schutz der Festplatte vor Zip-Bomben)
  maxTotalBytes: 3 * GiB,
  // Anzahl Einträge im ZIP (Datenbank + Manifest + Bilder)
  maxEntries: 20_000,
  // Zentrales Verzeichnis des ZIP (20 000 Einträge à ~100 Bytes ≈ 2 MB)
  maxCentralDirectoryBytes: 8 * MiB,
  // Einzeldateien
  maxManifestBytes: 4 * MiB,
  maxDatabaseBytes: 1 * GiB,
  maxMediaBytes: MAX_IMAGE_BYTES,
  // Kompressionsverhältnis entpackt/gepackt je Eintrag. Echte Datenbanken
  // packen etwa 3–10 : 1, Bilder (schon komprimiert) etwa 1 : 1. Eine
  // Zip-Bombe liegt bei 1000 : 1 und mehr. Geprüft erst ab minRatioCheckBytes,
  // damit winzige Dateien (z. B. fast leeres Manifest) nicht auffallen.
  maxCompressionRatio: 200,
  minRatioCheckBytes: 1 * MiB,
} as const;

export type ArchiveLimits = { [K in keyof typeof ARCHIVE_LIMITS]: number };

// Höchstgrösse eines Eintrags nach seinem Namen (null = Name nicht erlaubt)
export function maxEntryBytes(name: string, limits: ArchiveLimits = ARCHIVE_LIMITS): number | null {
  if (name === MANIFEST_ENTRY) return limits.maxManifestBytes;
  if (name === DATABASE_ENTRY) return limits.maxDatabaseBytes;
  if (MEDIA_ENTRY.test(name)) return limits.maxMediaBytes;
  return null;
}

// Fehler beim Lesen oder Schreiben einer .ajournal-Datei. Die Meldung ist für
// Lernende formuliert und geht unverändert an die Oberfläche (ipc-handler.ts);
// `code` ist für Tests und das Protokoll.
export type ArchiveErrorCode =
  | 'not-zip' // keine ZIP-Datei oder abgeschnitten
  | 'unsupported' // ZIP-Funktion, die das Format nicht nutzt (ZIP64, Verschlüsselung …)
  | 'unsafe-name' // Pfad-Traversal, absolute Pfade, Laufwerke, Backslashes …
  | 'unexpected-entry' // Datei, die nicht ins Format gehört / nicht im Manifest steht
  | 'duplicate' // doppelter Eintrag
  | 'symlink' // symbolischer Link
  | 'too-large' // Grenze überschritten (Anzahl, Grösse, Verhältnis)
  | 'corrupt' // Daten passen nicht zu ihren Angaben (CRC, Länge, Überlappung)
  | 'checksum' // SHA-256 oder Grösse passt nicht zum Manifest
  | 'manifest' // Manifest fehlt oder ist ungültig
  | 'newer-version' // mit neuerer Lernjournal-Version erstellt
  | 'database' // Datenbank beschädigt oder manipuliert
  | 'target' // Zielordner nicht verwendbar
  | 'io'; // Lesen/Schreiben auf dem Datenträger fehlgeschlagen

export class ArchiveError extends Error {
  constructor(
    readonly code: ArchiveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ArchiveError'; // Meldung geht an die Oberfläche (ipc-handler.ts)
  }
}

// Gemeinsamer Anfang vieler Meldungen: Lernende sollen wissen, dass ihr
// eigenes Projekt nicht betroffen ist und was sie tun können.
export const DAMAGED =
  'Die Datei ist beschädigt oder wurde verändert und kann nicht importiert werden. Erstelle die .ajournal-Datei auf dem ursprünglichen Computer neu.';

// --- Manifest ---------------------------------------------------------------

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const ManifestFileSchema = z.strictObject({
  path: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
  sha256: Sha256,
});

// Erster Blick ins Manifest: nur Kennung und Version. Erst wenn die Version
// bekannt ist, wird der Rest streng geprüft (neuere Versionen dürfen anders
// aufgebaut sein und sollen «bitte aktualisieren» melden, nicht «ungültig»).
export const ManifestHeadSchema = z.object({
  format: z.literal(ARCHIVE_FORMAT),
  formatVersion: z.number().int().min(1),
});

export const ManifestSchema = z.object({
  format: z.literal(ARCHIVE_FORMAT),
  formatVersion: z.literal(ARCHIVE_FORMAT_VERSION),
  // Lernjournal-Version, die exportiert hat (nur zur Anzeige und im Protokoll)
  appVersion: z.string().min(1).max(50),
  // PRAGMA user_version der Datenbank im Archiv (wird beim Import verglichen)
  schemaVersion: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  project: z.object({ id: z.string().min(1).max(100), title: z.string().max(200) }),
  // Zur Anzeige vor dem Import; massgebend ist danach die Datenbank selbst
  counts: z.object({ journals: z.number().int().nonnegative(), media: z.number().int().nonnegative() }),
  // Alle Dateien ausser dem Manifest selbst
  files: z.array(ManifestFileSchema).max(ARCHIVE_LIMITS.maxEntries),
});
export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestFile = z.infer<typeof ManifestFileSchema>;

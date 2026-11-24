// .ajournal lesen (AJ-14): Vorschau, vollständige Prüfung und Import in ein
// NEUES Projekt.
//
// Reihenfolge beim Import – jede Stufe muss bestehen, sonst wird der
// Zielordner wieder aufgeräumt und nichts bleibt zurück:
//   1. Zielordner ist neu oder leer (nie ein bestehendes Projekt überschreiben)
//   2. ZIP-Aufbau, Namen, Grenzen (ZipReader.open)
//   3. Manifest: Kennung, Formatversion (neuere → «bitte aktualisieren»),
//      Schemaversion, Dateiliste = Inhalt des ZIP (nichts fehlt, nichts extra)
//   4. Entpacken mit Prüfung von Länge, CRC-32 und SHA-256 jeder Datei;
//      Bilder müssen echte PNG/JPEG/WebP sein (Bytes, nicht Endung)
//   5. Datenbank: Version, Schema, Integrität, Inhalte (archive-db.ts)
//   6. ältere Schemaversionen per Migration hochziehen, Suchindex neu
//      aufbauen, nochmals integrity_check
// Danach öffnet der Aufrufer das Projekt ganz normal (Sperre, Prüfungen).
import { mkdirSync, readdirSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { FolderKind } from '@shared/ipc';
import type { ArchiveSummary } from '@shared/archive';
import { checkIntegrity, openDatabase, type Db } from '../db/connection';
import { LATEST_VERSION, migrate } from '../db/migrations';
import { EXT, sniffImage } from '../media/image-info';
import { MAX_IMAGE_SIDE } from '../media/media-service';
import { DB_FILE, PROJECT_DIRS } from '../project/project-service';
import { SearchIndex } from '../search/search-index';
import {
  ARCHIVE_FORMAT_VERSION,
  ARCHIVE_LIMITS,
  ArchiveError,
  DAMAGED,
  DATABASE_ENTRY,
  MANIFEST_ENTRY,
  ManifestHeadSchema,
  ManifestSchema,
  maxEntryBytes,
  MEDIA_ENTRY,
  type ArchiveLimits,
  type Manifest,
} from './archive-format';
import { verifyImportedDatabase } from './archive-db';
import { ZipReader, type ZipEntry } from './zip-reader';

export type Progress = (step: string, done: number, total: number) => void;

// Manifest lesen und gegen den Inhalt des ZIP prüfen
export async function readManifest(reader: ZipReader): Promise<Manifest> {
  const entry = reader.entry(MANIFEST_ENTRY);
  if (!entry)
    throw new ArchiveError('manifest', 'Die Datei ist keine Lernjournal-Projektdatei (manifest.json fehlt).');
  const { data } = await reader.readBuffer(entry);
  let json: unknown;
  try {
    json = JSON.parse(data.toString('utf8'));
  } catch {
    throw new ArchiveError('manifest', `${DAMAGED} (manifest.json ist kein gültiges JSON.)`);
  }
  const head = ManifestHeadSchema.safeParse(json);
  if (!head.success)
    throw new ArchiveError('manifest', 'Die Datei ist keine Lernjournal-Projektdatei (unbekannte Kennung).');
  // Wie beim Öffnen einer Projektdatenbank (AJ-04): neuere Formate nie
  // «irgendwie» lesen, sondern verständlich ablehnen
  if (head.data.formatVersion > ARCHIVE_FORMAT_VERSION) {
    throw new ArchiveError(
      'newer-version',
      `Diese Datei wurde mit einer neueren Version von Lernjournal erstellt (Paketformat ${head.data.formatVersion}, dieses Programm kennt bis ${ARCHIVE_FORMAT_VERSION}). Bitte Lernjournal aktualisieren.`,
    );
  }
  // Ältere Paketformate gibt es noch nicht. Kommt Version 2, wird hier ein
  // Manifest der Version 1 in die neue Form umgewandelt, bevor es geprüft wird.
  const parsed = ManifestSchema.safeParse(json);
  if (!parsed.success) throw new ArchiveError('manifest', `${DAMAGED} (manifest.json ist unvollständig.)`);
  const manifest = parsed.data;
  if (manifest.schemaVersion > LATEST_VERSION) {
    throw new ArchiveError(
      'newer-version',
      `Diese Datei wurde mit einer neueren Version von Lernjournal erstellt (Datenformat ${manifest.schemaVersion}, dieses Programm kennt bis ${LATEST_VERSION}). Bitte Lernjournal aktualisieren.`,
    );
  }
  checkManifestAgainstZip(manifest, reader.entries);
  return manifest;
}

// Dateiliste des Manifests = Inhalt des ZIP (ohne das Manifest selbst)
function checkManifestAgainstZip(manifest: Manifest, entries: readonly ZipEntry[]): void {
  const listed = new Map<string, Manifest['files'][number]>();
  for (const f of manifest.files) {
    if (listed.has(f.path))
      throw new ArchiveError('duplicate', `${DAMAGED} («${f.path}» doppelt im Manifest.)`);
    if (f.path === MANIFEST_ENTRY || maxEntryBytes(f.path) === null)
      throw new ArchiveError('manifest', `${DAMAGED} (unerwarteter Eintrag im Manifest.)`);
    listed.set(f.path, f);
  }
  if (!listed.has(DATABASE_ENTRY)) throw new ArchiveError('manifest', `${DAMAGED} (Die Datenbank fehlt.)`);
  const present = new Set<string>();
  for (const e of entries) {
    if (e.name === MANIFEST_ENTRY) continue;
    const f = listed.get(e.name);
    if (!f)
      throw new ArchiveError(
        'unexpected-entry',
        `Die Datei enthält «${e.name}», das nicht im Verzeichnis (manifest.json) steht, und wird nicht importiert.`,
      );
    if (f.size !== e.size)
      throw new ArchiveError('checksum', `${DAMAGED} (Grösse von «${e.name}» passt nicht zum Manifest.)`);
    present.add(e.name);
  }
  for (const f of manifest.files)
    if (!present.has(f.path)) throw new ArchiveError('checksum', `${DAMAGED} («${f.path}» fehlt.)`);
}

function summaryOf(manifest: Manifest, reader: ZipReader): ArchiveSummary {
  return {
    title: manifest.project.title,
    journals: manifest.counts.journals,
    media: manifest.counts.media,
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
    archiveBytes: reader.archiveBytes,
    unpackedBytes: reader.entries.reduce((s, e) => s + e.size, 0),
  };
}

// Vorschau vor dem Import: Aufbau und Manifest prüfen (schnell, ohne zu
// entpacken). Die Prüfsummen prüft erst der Import selbst.
export async function inspectArchive(
  file: string,
  limits: ArchiveLimits = ARCHIVE_LIMITS,
): Promise<ArchiveSummary> {
  const reader = await ZipReader.open(file, limits);
  try {
    return summaryOf(await readManifest(reader), reader);
  } finally {
    await reader.close();
  }
}

// Vollständige Prüfung ohne zu entpacken: jede Datei lesen, Länge, CRC-32 und
// SHA-256 vergleichen. Nach dem Export (bevor die Datei ihren Namen bekommt);
// später auch für «Sicherung prüfen» (AJ-15).
export async function verifyArchive(file: string, limits: ArchiveLimits = ARCHIVE_LIMITS): Promise<Manifest> {
  const reader = await ZipReader.open(file, limits);
  try {
    const manifest = await readManifest(reader);
    for (const f of manifest.files) {
      const { sha256 } = await reader.hash(reader.entry(f.path)!);
      if (sha256 !== f.sha256) throw checksumError(f.path);
    }
    return manifest;
  } finally {
    await reader.close();
  }
}

const checksumError = (name: string) =>
  new ArchiveError('checksum', `${DAMAGED} (Prüfsumme von «${name}» stimmt nicht.)`);

export type ImportOutcome = { journals: number; media: number; warnings: string[]; manifest: Manifest };

export async function importArchive(input: {
  file: string;
  targetDir: string;
  inspectFolder: (dir: string) => { kind: FolderKind };
  onProgress?: Progress;
  limits?: ArchiveLimits;
  now?: Date;
}): Promise<ImportOutcome> {
  const progress: Progress = input.onProgress ?? (() => {});
  const target = input.targetDir;

  // 1) Zielordner: nur neu oder leer. Was vorher drin lag (desktop.ini …),
  //    bleibt beim Aufräumen liegen.
  const { kind } = input.inspectFolder(target);
  if (kind !== 'new' && kind !== 'empty') {
    throw new ArchiveError(
      'target',
      'Der Zielordner ist nicht leer. Ein Import legt immer ein neues Projekt an und überschreibt nie bestehende Daten – bitte einen leeren oder neuen Ordner wählen.',
    );
  }
  const createdDir = kind === 'new';
  let before: Set<string>;
  try {
    mkdirSync(target, { recursive: true });
    before = new Set(readdirSync(target));
  } catch (err) {
    throw ioError(err);
  }

  let reader: ZipReader | null = null;
  try {
    progress('Datei wird geprüft …', 0, 1);
    reader = await ZipReader.open(input.file, input.limits ?? ARCHIVE_LIMITS);
    const manifest = await readManifest(reader);
    const total = manifest.files.reduce((s, f) => s + f.size, 0) || 1;
    let done = 0;

    // 4) Entpacken: Datenbank zuerst, dann die Bilder
    const hashes = new Map<string, string>();
    const extract = async (name: string, dest: string) => {
      const f = manifest.files.find((x) => x.path === name)!;
      const { sha256 } = await reader!.extractTo(reader!.entry(name)!, dest);
      if (sha256 !== f.sha256) throw checksumError(name);
      hashes.set(name, sha256);
      done += f.size;
    };
    progress('Datenbank wird entpackt …', done, total);
    await extract(DATABASE_ENTRY, path.join(target, DB_FILE));
    const mediaFiles = manifest.files.filter((f) => MEDIA_ENTRY.test(f.path));
    mkdirSync(path.join(target, 'media'), { recursive: true });
    for (const [i, f] of mediaFiles.entries()) {
      progress(`Bilder werden entpackt (${i + 1} von ${mediaFiles.length}) …`, done, total);
      const dest = path.join(target, ...f.path.split('/'));
      await extract(f.path, dest);
      await checkImage(f.path, dest);
    }
    await reader.close();
    reader = null;

    // 5) Datenbank prüfen, Bilder abgleichen
    progress('Datenbank wird geprüft …', total, total);
    const dbFile = path.join(target, DB_FILE);
    const verified = verifyImportedDatabase(dbFile, manifest.schemaVersion);
    const warnings: string[] = [];
    const rows = new Set(verified.media.map((m) => m.relativePath));
    for (const f of mediaFiles)
      if (!rows.has(f.path))
        throw new ArchiveError('unexpected-entry', `${DAMAGED} (Bild ohne Eintrag in der Datenbank.)`);
    const missing = verified.media.filter((m) => !hashes.has(m.relativePath)).length;
    const changed = verified.media.filter(
      (m) => hashes.has(m.relativePath) && hashes.get(m.relativePath) !== m.sha256,
    ).length;
    if (missing > 0)
      warnings.push(
        missing === 1
          ? '1 Bild fehlte schon beim Export und wird im Journal als fehlend angezeigt.'
          : `${missing} Bilder fehlten schon beim Export und werden in den Journalen als fehlend angezeigt.`,
      );
    if (changed > 0)
      warnings.push(
        changed === 1
          ? '1 Bild weicht von seiner gespeicherten Prüfsumme ab (war vermutlich schon vor dem Export beschädigt).'
          : `${changed} Bilder weichen von ihrer gespeicherten Prüfsumme ab (waren vermutlich schon vor dem Export beschädigt).`,
      );

    // 6) Auf den Stand dieses Programms bringen und Suchindex neu aufbauen.
    //    Kein Backup vor der Migration nötig: Die .ajournal-Datei IST die Sicherung.
    //    Die Datei auf dem Datenträger ist jetzt eine Kopie des Projekts →
    //    zählt als letzte Übergabe (Erinnerung nach 30 Tagen, AJ-15).
    progress('Suchindex wird aufgebaut …', total, total);
    const importedAt = (input.now ?? new Date()).toISOString();
    await finishImportedDatabase(dbFile, (db) => recordExport(db, importedAt));
    for (const d of PROJECT_DIRS) mkdirSync(path.join(target, d), { recursive: true });
    return { journals: verified.journals, media: mediaFiles.length, warnings, manifest };
  } catch (err) {
    await reader?.close();
    // Aufräumen: alles weg, was der Import angelegt hat
    try {
      if (createdDir) await rm(target, { recursive: true, force: true });
      else
        for (const name of readdirSync(target))
          if (!before.has(name)) await rm(path.join(target, name), { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error('[archiv] Aufräumen nach fehlgeschlagenem Import:', cleanupErr);
    }
    if (err instanceof ArchiveError) throw err;
    throw ioError(err);
  }
}

// Letzte Schritte für eine geprüfte Datenbank (verifyImportedDatabase), die
// als Projekt geöffnet werden soll – gemeinsam für den Import und die
// Wiederherstellung einer Sicherung (AJ-15): auf das aktuelle Schema
// migrieren, Suchindex neu aufbauen (abgeleitet, ADR 0004), optionale
// Anpassung (adjust, z. B. Zeitpunkt der letzten Übergabe), nochmals
// integrity_check, WAL zurückschreiben. Wirft ArchiveError, wenn etwas nicht stimmt.
export async function finishImportedDatabase(dbFile: string, adjust?: (db: Db) => void): Promise<void> {
  const db = openDatabase(dbFile);
  try {
    await migrate(db);
    new SearchIndex(() => db).rebuild();
    adjust?.(db);
    const problems = checkIntegrity(db);
    if (problems.length > 0) {
      console.error('[archiv] integrity_check nach Import:', problems.slice(0, 5));
      throw new ArchiveError('database', `${DAMAGED} (Datenbank nach dem Umwandeln fehlerhaft.)`);
    }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
}

// Zeitpunkt der letzten Projektübergabe speichern (Schema v3) und ein
// «Später erinnern» aufheben – die Erinnerung beginnt von vorn
export function recordExport(db: Db, at: string): void {
  db.prepare('UPDATE project SET last_export_at = ?, export_reminder_snoozed_until = NULL').run(at);
}

// Bild muss nach seinen Bytes das sein, was die Endung sagt, und in die
// Grenzen passen, die auch beim Einfügen gelten (AJ-07)
async function checkImage(name: string, file: string): Promise<void> {
  const info = sniffImage(new Uint8Array(await readFile(file)));
  const ext = name.slice(name.lastIndexOf('.') + 1);
  if (!info || EXT[info.mime] !== ext || info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE)
    throw new ArchiveError('unexpected-entry', `${DAMAGED} («${name}» ist kein gültiges Bild.)`);
}

// Dateisystem-Fehler verständlich machen; Unbekanntes geht als interner
// Fehler ins Protokoll (ipc-handler.ts)
function ioError(err: unknown): Error {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'ENOSPC')
    return new ArchiveError(
      'io',
      'Nicht genug Speicherplatz im Zielordner. Bitte Platz schaffen oder einen anderen Ordner wählen.',
    );
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS')
    return new ArchiveError(
      'io',
      'In den Zielordner kann nicht geschrieben werden. Bitte einen anderen Ordner wählen.',
    );
  if (code === 'ENOENT')
    return new ArchiveError(
      'io',
      'Datei oder Ordner nicht mehr erreichbar. Ist der Datenträger (z. B. USB-Stick) noch angeschlossen?',
    );
  return err instanceof Error ? err : new Error(String(err));
}

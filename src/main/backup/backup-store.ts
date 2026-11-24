// Sicherungen im Projektordner anlegen, auflisten, prüfen und rotieren
// (AJ-15, Format: backup-format.ts, ADR 0006).
//
// Kennt kein Electron und keinen Projektdienst: Jede Funktion bekommt die
// Datenbank und den Projektordner ausdrücklich. So nutzen sie auch die
// Sicherung vor einer Migration (ProjectService.open, Projekt noch nicht
// «geöffnet») und die Tests.
//
// Ablauf einer Sicherung (createBackup):
//   1. optional: Fingerabdruck des aktuellen Inhalts mit der neuesten
//      Sicherung vergleichen – gleich → nichts zu tun («unverändert»)
//   2. konsistente Kopie der Datenbank in einen Temp-Ordner (snapshotDatabase,
//      SQLite-Backup-API – nie die laufende Datei samt WAL kopieren)
//   3. fehlende Bilder in den Vorrat backups/media/ kopieren – nur, wenn ihr
//      Inhalt zur gespeicherten Prüfsumme passt (der Vorrat enthält nur
//      unversehrte Bilder); jedes Bild atomar (fs-atomic.ts)
//   4. ZIP in eine Temp-Datei neben dem Ziel, zurücklesen und die Prüfsumme
//      der Datenbank kontrollieren, dann atomar umbenennen
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BACKUP_POLICY, BACKUP_TEXTS, type BackupEntry, type BackupReason } from '@shared/backup';
import { openDatabase, type Db } from '../db/connection';
import { LATEST_VERSION } from '../db/migrations';
import {
  ARCHIVE_LIMITS,
  ArchiveError,
  DATABASE_ENTRY,
  MANIFEST_ENTRY,
  type ArchiveLimits,
} from '../archive/archive-format';
import { snapshotDatabase, type MediaRow } from '../archive/archive-db';
import { ZipReader } from '../archive/zip-reader';
import { ZipWriter } from '../archive/zip-writer';
import { writeAtomically } from '../fs-atomic';
import {
  BACKUP_DIR,
  BACKUP_EXTENSION,
  BACKUP_FORMAT_VERSION,
  BACKUP_FORMAT,
  BACKUP_MEDIA_DIR,
  BackupError,
  BackupManifestHeadSchema,
  BackupManifestSchema,
  backupIdFor,
  dateFromBackupId,
  isLeftover,
  type BackupManifest,
} from './backup-format';
import { backupsToKeep, type RotationPolicy } from './rotation';

export const backupsDir = (projectDir: string) => path.join(projectDir, BACKUP_DIR);
export const poolDir = (projectDir: string) => path.join(projectDir, BACKUP_DIR, BACKUP_MEDIA_DIR);
export const backupFile = (projectDir: string, id: string) =>
  path.join(backupsDir(projectDir), `${id}.${BACKUP_EXTENSION}`);

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

// --- Fingerabdruck ------------------------------------------------------------

// SHA-256 über alle Zeilen aller Datentabellen, in fester Reihenfolge
// (Tabellen nach Name, Zeilen nach allen Spalten). Der Suchindex zählt nicht
// (abgeleitet), ebenso die internen Tabellen von SQLite. Gleicher Inhalt →
// gleicher Fingerabdruck, unabhängig vom Seitenaufbau der Datei. Generisch
// über sqlite_master, damit neue Tabellen späterer Migrationen von selbst
// mitzählen.
export function contentFingerprint(db: Db): string {
  const hash = createHash('sha256');
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE 'journal\\_fts%' ESCAPE '\\'
       ORDER BY name`,
    )
    .all() as { name: string }[];
  for (const { name } of tables) {
    const quoted = `"${name.replace(/"/g, '""')}"`;
    const cols = (db.prepare(`PRAGMA table_info(${quoted})`).all() as unknown[]).length;
    const order = Array.from({ length: cols }, (_, i) => i + 1).join(', ');
    hash.update(`\u0000${name}\u0000`);
    for (const row of db.prepare(`SELECT * FROM ${quoted} ORDER BY ${order}`).iterate()) {
      hash.update(
        JSON.stringify(Object.values(row as Record<string, unknown>), (_k, v: unknown) =>
          v instanceof Uint8Array ? Buffer.from(v).toString('hex') : typeof v === 'bigint' ? String(v) : v,
        ),
      );
      hash.update('\n');
    }
  }
  return hash.digest('hex');
}

// --- Manifest lesen -----------------------------------------------------------

const damaged = (detail: string, cause?: unknown) => {
  console.error(`[sicherung] beschädigt: ${detail}`, cause ?? '');
  return new BackupError('damaged', BACKUP_TEXTS.damaged);
};

// Öffnet eine Sicherung und prüft Aufbau und Manifest (ohne Prüfsummen).
// Gleicher misstrauischer ZIP-Leser wie beim Import (Sicherungen liegen in
// einem Ordner, den Lernende, Synchronisierungsprogramme oder Virenscanner
// verändern können). Wirft BackupError.
export async function openBackup(
  file: string,
  limits: ArchiveLimits = ARCHIVE_LIMITS,
): Promise<{ reader: ZipReader; manifest: BackupManifest }> {
  let reader: ZipReader;
  try {
    reader = await ZipReader.open(file, limits);
  } catch (err) {
    if ((err as ArchiveError).code === 'io')
      throw new BackupError('io', 'Die Sicherung konnte nicht gelesen werden.');
    throw damaged(`ZIP: ${(err as Error).message}`, err);
  }
  try {
    const entry = reader.entry(MANIFEST_ENTRY);
    const db = reader.entry(DATABASE_ENTRY);
    if (!entry || !db || reader.entries.length !== 2) throw damaged('Einträge');
    let json: unknown;
    try {
      json = JSON.parse((await reader.readBuffer(entry)).data.toString('utf8'));
    } catch (err) {
      throw damaged('manifest.json', err);
    }
    const head = BackupManifestHeadSchema.safeParse(json);
    if (!head.success) throw damaged('Kennung');
    const parsed = BackupManifestSchema.safeParse(json);
    if (
      head.data.formatVersion > BACKUP_FORMAT_VERSION ||
      (parsed.success && parsed.data.schemaVersion > LATEST_VERSION)
    )
      throw new BackupError(
        'newer-version',
        'Diese Sicherung stammt von einer neueren Version von Lernjournal. Bitte Lernjournal aktualisieren.',
      );
    if (!parsed.success) throw damaged('Manifest unvollständig');
    if (parsed.data.database.size !== db.size) throw damaged('Grösse der Datenbank');
    return { reader, manifest: parsed.data };
  } catch (err) {
    await reader.close();
    throw err;
  }
}

// --- Liste --------------------------------------------------------------------

export type StoredBackup = {
  id: string;
  file: string;
  bytes: number;
  createdAt: Date;
  manifest: BackupManifest | null; // null = nicht lesbar (beschädigt)
};

// IDs im Ordner «backups», neueste zuerst (Name = Zeitstempel UTC)
async function backupIds(projectDir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(backupsDir(projectDir));
  } catch {
    return [];
  }
  const ext = `.${BACKUP_EXTENSION}`;
  return names
    .filter((n) => n.endsWith(ext))
    .map((n) => n.slice(0, -ext.length))
    .filter((id) => dateFromBackupId(id) !== null)
    .sort((a, b) => b.localeCompare(a));
}

async function readStored(projectDir: string, id: string): Promise<StoredBackup | null> {
  const file = backupFile(projectDir, id);
  const bytes = await stat(file).then(
    (s) => (s.isFile() ? s.size : -1),
    () => -1,
  );
  if (bytes < 0) return null;
  let manifest: BackupManifest | null;
  try {
    const opened = await openBackup(file);
    await opened.reader.close();
    manifest = opened.manifest;
  } catch {
    manifest = null; // als beschädigt anzeigen
  }
  const createdAt = manifest ? new Date(manifest.createdAt) : dateFromBackupId(id)!;
  return { id, file, bytes, createdAt, manifest };
}

// Alle Sicherungen eines Projekts, neueste zuerst
export async function listBackups(projectDir: string): Promise<StoredBackup[]> {
  const out: StoredBackup[] = [];
  for (const id of await backupIds(projectDir)) {
    const b = await readStored(projectDir, id);
    if (b) out.push(b);
  }
  return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
}

// Nur die neueste lesbare Sicherung (für «unverändert?» und «täglich fällig?»)
export async function newestBackup(projectDir: string): Promise<StoredBackup | null> {
  for (const id of await backupIds(projectDir)) {
    const b = await readStored(projectDir, id);
    if (b?.manifest) return b;
  }
  return null;
}

export function toEntry(b: StoredBackup): BackupEntry {
  return {
    id: b.id,
    createdAt: b.createdAt.toISOString(),
    reason: b.manifest?.reason ?? null,
    journals: b.manifest?.counts.journals ?? null,
    media: b.manifest?.counts.media ?? null,
    bytes: b.bytes,
    damaged: b.manifest === null,
  };
}

// --- Bildvorrat ---------------------------------------------------------------

// Liest eine Datei und prüft sie gegen die erwartete Prüfsumme (null = fehlt/anders)
async function readVerified(file: string, expected: string): Promise<Buffer | null> {
  try {
    const data = await readFile(file);
    return sha256(data) === expected ? data : null;
  } catch {
    return null;
  }
}

// Bild in den Vorrat aufnehmen, falls noch nicht dort. Vorhandene Dateien
// werden nie überschrieben (unveränderlich); ob sie noch stimmen, prüft die
// Vorschau vor einer Wiederherstellung. false = Bild fehlt im Projekt oder
// passt nicht mehr zu seiner Prüfsumme.
async function addToPool(projectDir: string, m: MediaRow): Promise<boolean> {
  const dest = path.join(poolDir(projectDir), path.basename(m.relativePath));
  const exists = await stat(dest).then(
    (s) => s.isFile() && s.size > 0,
    () => false,
  );
  if (exists) return true;
  const data = await readVerified(path.join(projectDir, ...m.relativePath.split('/')), m.sha256);
  if (!data) return false;
  await writeAtomically(dest, (tmp) => writeFile(tmp, data, { flush: true }));
  return true;
}

// --- Sicherung anlegen --------------------------------------------------------

export type CreateBackupInput = {
  db: Db;
  projectDir: string;
  reason: BackupReason;
  appVersion: string;
  now: Date;
  // true: keine neue Sicherung, wenn der Inhalt der neuesten gleicht
  skipIfUnchanged?: boolean;
  limits?: ArchiveLimits;
};

export type CreateBackupOutcome = { status: 'created' | 'unchanged'; backup: StoredBackup };

export async function createBackup(input: CreateBackupInput): Promise<CreateBackupOutcome> {
  const { db, projectDir } = input;
  try {
    mkdirSync(poolDir(projectDir), { recursive: true });
  } catch (err) {
    throw ioError(err);
  }

  // 1) Nichts geändert seit der neuesten Sicherung?
  if (input.skipIfUnchanged) {
    const newest = await newestBackup(projectDir);
    if (newest?.manifest && newest.manifest.fingerprint === contentFingerprint(db))
      return { status: 'unchanged', backup: newest };
  }

  const work = await mkdtemp(path.join(tmpdir(), 'lernjournal-sicherung-'));
  try {
    // 2) Datenbank: konsistente Kopie (Backup-API), geprüft, ohne Suchindex
    const dbFile = path.join(work, DATABASE_ENTRY);
    let snap: Awaited<ReturnType<typeof snapshotDatabase>>;
    try {
      snap = await snapshotDatabase(db, dbFile, { dropSearchIndex: true });
    } catch (err) {
      if (err instanceof ArchiveError) {
        console.error('[sicherung] Kopie der Datenbank fehlerhaft:', err.message);
        throw new BackupError(
          'source',
          'Die Projektdatenbank ist beschädigt – es wurde keine neue Sicherung erstellt. Stelle eine frühere Sicherung wieder her.',
        );
      }
      throw err;
    }
    const copy = openDatabase(dbFile, { readOnly: true });
    let fingerprint: string;
    let recentTitles: string[];
    try {
      fingerprint = contentFingerprint(copy);
      recentTitles = (
        copy.prepare('SELECT title FROM journal ORDER BY updated_at DESC, id LIMIT 5').all() as {
          title: string;
        }[]
      ).map((r) => r.title.slice(0, 300));
    } finally {
      copy.close();
    }

    // 3) Bilder in den Vorrat (nur, was die KOPIE braucht)
    const media: BackupManifest['media'] = [];
    let missingMedia = 0;
    for (const m of snap.media) {
      if (await addToPool(projectDir, m)) media.push({ path: m.relativePath, sha256: m.sha256 });
      else missingMedia++;
    }
    if (missingMedia > 0) console.warn(`[sicherung] ${missingMedia} Bild(er) fehlen oder sind beschädigt`);

    // 4) ZIP schreiben, prüfen, atomar umbenennen
    const id = await freeId(projectDir, input.now);
    const target = backupFile(projectDir, id);
    const limits = input.limits ?? ARCHIVE_LIMITS;
    await writeAtomically(target, async (tmp) => {
      const zip = await ZipWriter.create(tmp, { modified: input.now, limits });
      try {
        const added = await zip.addFile(DATABASE_ENTRY, dbFile, { compress: true });
        const manifest: BackupManifest = {
          format: BACKUP_FORMAT,
          formatVersion: BACKUP_FORMAT_VERSION,
          appVersion: input.appVersion,
          schemaVersion: snap.schemaVersion,
          createdAt: input.now.toISOString(),
          reason: input.reason,
          project: snap.project,
          counts: { journals: snap.journals, media: snap.media.length },
          recentTitles,
          fingerprint,
          database: { size: added.size, sha256: added.sha256 },
          media,
          missingMedia,
        };
        await zip.addBuffer(MANIFEST_ENTRY, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), {
          compress: true,
        });
        await zip.close();
      } catch (err) {
        await zip.abort();
        throw err;
      }
      // Zurücklesen: Aufbau, Manifest und Prüfsumme der Datenbank
      const { reader, manifest } = await openBackup(tmp, limits);
      try {
        if ((await reader.hash(reader.entry(DATABASE_ENTRY)!)).sha256 !== manifest.database.sha256)
          throw new BackupError('io', 'Die Sicherung konnte nicht fehlerfrei geschrieben werden.');
      } finally {
        await reader.close();
      }
    }).catch((err: unknown) => {
      throw err instanceof BackupError ? err : ioError(err);
    });
    const stored = await readStored(projectDir, id);
    if (!stored?.manifest)
      throw new BackupError('io', 'Die Sicherung konnte nicht fehlerfrei geschrieben werden.');
    return { status: 'created', backup: stored };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

// Freie ID: Gleicher Zeitstempel kommt nur bei zurückgestellter Uhr vor –
// dann mit Zähler, damit nie eine bestehende Sicherung überschrieben wird
async function freeId(projectDir: string, now: Date): Promise<string> {
  for (let i = 0; i < 1000; i++) {
    const id = backupIdFor(now, i);
    const taken = await stat(backupFile(projectDir, id)).then(
      () => true,
      () => false,
    );
    if (!taken) return id;
  }
  throw new BackupError('io', 'Für diesen Zeitpunkt gibt es schon zu viele Sicherungen.');
}

// --- Prüfen -------------------------------------------------------------------

// Bild-Quellen für eine Wiederherstellung, in dieser Reihenfolge: der Vorrat
// der Sicherungen, dann der Bilderordner des Projekts. Beide zählen nur,
// wenn der Inhalt zur Prüfsumme passt (Bilder sind unveränderlich).
export function mediaSources(projectDir: string): string[] {
  return [poolDir(projectDir), path.join(projectDir, 'media')];
}

export async function findMedia(
  sources: readonly string[],
  m: { path: string; sha256: string },
): Promise<Buffer | null> {
  for (const dir of sources) {
    const data = await readVerified(path.join(dir, path.basename(m.path)), m.sha256);
    if (data) return data;
  }
  return null;
}

// Vollständige Prüfung vor einer Wiederherstellung: Aufbau, Manifest,
// Prüfsumme der Datenbank, und für jedes Bild eine unversehrte Quelle.
// Wirft BackupError, wenn die Datenbank nicht stimmt; fehlende Bilder werden
// gezählt (Wiederherstellung geht trotzdem, das Journal zeigt sie als fehlend).
export async function verifyBackup(
  file: string,
  sources: readonly string[],
  limits: ArchiveLimits = ARCHIVE_LIMITS,
): Promise<{ manifest: BackupManifest; missingMedia: number }> {
  const { reader, manifest } = await openBackup(file, limits);
  try {
    let sha: string;
    try {
      sha = (await reader.hash(reader.entry(DATABASE_ENTRY)!)).sha256;
    } catch (err) {
      throw damaged('Datenbank nicht lesbar', err);
    }
    if (sha !== manifest.database.sha256) throw damaged('Prüfsumme der Datenbank');
  } finally {
    await reader.close();
  }
  let missing = manifest.missingMedia;
  for (const m of manifest.media) if (!(await findMedia(sources, m))) missing++;
  return { manifest, missingMedia: missing };
}

// --- Rotation und Aufräumen ---------------------------------------------------

// Entfernt Sicherungen nach backupsToKeep und danach Bilder im Vorrat, auf
// die keine verbleibende Sicherung verweist. Ist eine verbleibende Sicherung
// nicht lesbar, bleibt der Vorrat diesmal unangetastet (sonst könnten Bilder
// verschwinden, die sie braucht, falls sie nur kurz gesperrt war).
export async function rotateBackups(
  projectDir: string,
  options: { protect?: readonly string[]; policy?: RotationPolicy } = {},
): Promise<{ deleted: string[]; mediaDeleted: number }> {
  const all = await listBackups(projectDir);
  const keep = backupsToKeep(all, options.policy ?? BACKUP_POLICY, options.protect ?? []);
  const deleted: string[] = [];
  for (const b of all) {
    if (keep.has(b.id)) continue;
    try {
      await rm(b.file, { force: true });
      deleted.push(b.id);
    } catch (err) {
      console.error('[sicherung] Alte Sicherung nicht gelöscht:', b.id, err);
    }
  }
  const kept = all.filter((b) => keep.has(b.id) || !deleted.includes(b.id));
  let mediaDeleted = 0;
  if (kept.every((b) => b.manifest)) {
    const needed = new Set(kept.flatMap((b) => b.manifest!.media.map((m) => path.basename(m.path))));
    let names: string[];
    try {
      names = await readdir(poolDir(projectDir));
    } catch {
      names = [];
    }
    for (const name of names) {
      if (needed.has(name) || isLeftover(name)) continue;
      await rm(path.join(poolDir(projectDir), name), { force: true }).then(
        () => mediaDeleted++,
        (err: unknown) => console.error('[sicherung] Bild im Vorrat nicht gelöscht:', name, err),
      );
    }
  } else {
    console.warn('[sicherung] Eine Sicherung ist nicht lesbar – Bildvorrat wird diesmal nicht aufgeräumt');
  }
  if (deleted.length || mediaDeleted)
    console.log(`[sicherung] Rotation: ${deleted.length} Sicherung(en), ${mediaDeleted} Bild(er) entfernt`);
  return { deleted, mediaDeleted };
}

// Reste abgebrochener Sicherungen/Wiederherstellungen entfernen (Temp-Dateien
// «.….tmp», Arbeitsordner «.wiederherstellung-…»). Nur beim Öffnen des
// Projekts aufrufen – dann läuft sicher nichts mehr (Projektsperre).
export async function cleanupLeftovers(projectDir: string): Promise<number> {
  let removed = 0;
  for (const dir of [backupsDir(projectDir), poolDir(projectDir)]) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names.filter(isLeftover)) {
      await rm(path.join(dir, name), { recursive: true, force: true }).then(
        () => removed++,
        () => {},
      );
    }
  }
  return removed;
}

// Sicherung vor einer Migration (AJ-04, vereinheitlicht in AJ-15): eine
// gewöhnliche Sicherung mit Anlass «vor-update» – erscheint in der Liste und
// lässt sich wie jede andere wiederherstellen (das ältere Schema wird dabei
// migriert). Liefert die ID.
export async function backupBeforeMigration(input: {
  db: Db;
  projectDir: string;
  appVersion: string;
  now: Date;
}): Promise<string> {
  const { backup } = await createBackup({ ...input, reason: 'vor-update' });
  await rotateBackups(input.projectDir, { protect: [backup.id] }).catch((err: unknown) =>
    console.error('[sicherung] Rotation fehlgeschlagen:', err),
  );
  return backup.id;
}

// Dateisystem-Fehler verständlich machen
export function ioError(err: unknown): Error {
  if (err instanceof BackupError) return err;
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'ENOSPC')
    return new BackupError('io', 'Nicht genug Speicherplatz für die Sicherung. Bitte Platz schaffen.');
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS' || code === 'EBUSY')
    return new BackupError(
      'io',
      'In den Ordner «backups» des Projekts kann nicht geschrieben werden. Ist er schreibgeschützt oder von einem anderen Programm gesperrt?',
    );
  if (code === 'ENOENT')
    return new BackupError(
      'io',
      'Der Projektordner ist nicht mehr erreichbar. Ist der Datenträger noch angeschlossen?',
    );
  return err instanceof Error ? err : new Error(String(err));
}

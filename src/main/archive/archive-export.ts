// .ajournal schreiben (AJ-14): das ganze Projekt in einer Datei, z. B. für
// den Wechsel auf einen neuen Computer oder als Sicherung auf einem USB-Stick.
//
// Ablauf:
//   1. konsistente, verdichtete Kopie der Datenbank in einen Temp-Ordner
//      (snapshotDatabase – nie die laufende Datei samt WAL kopieren)
//   2. ZIP in eine Temp-Datei neben dem Ziel: Datenbank (Deflate), Bilder
//      (gespeichert, sind schon komprimiert), zuletzt manifest.json mit
//      SHA-256 und Grösse jeder Datei
//   3. das fertige Archiv vollständig zurücklesen und prüfen (verifyArchive)
//   4. erst dann umbenennen (atomar, fs-atomic.ts) – eine abgebrochene oder
//      fehlerhafte Übergabe hinterlässt nie eine halbe .ajournal-Datei
//
// Bausteine für AJ-15 (Sicherungen): snapshotDatabase, writeProjectArchive,
// verifyArchive.
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Db } from '../db/connection';
import { writeAtomically } from '../fs-atomic';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_FORMAT_VERSION,
  ARCHIVE_LIMITS,
  ArchiveError,
  DATABASE_ENTRY,
  MANIFEST_ENTRY,
  MEDIA_ENTRY,
  type ArchiveLimits,
  type Manifest,
  type ManifestFile,
} from './archive-format';
import { snapshotDatabase } from './archive-db';
import { verifyArchive, type Progress } from './archive-import';
import { ZipWriter } from './zip-writer';

export type ArchiveContent = {
  dbFile: string; // fertige Kopie der Datenbank (Journalmodus DELETE)
  media: { entry: string; file: string }[];
  manifest: Omit<Manifest, 'files' | 'formatVersion' | 'format'> & { formatVersion?: number };
};

// Schreibt ein Archiv in eine NEUE Datei (tmp). Bricht ab, wenn eine Grenze
// überschritten würde – ein Archiv, das der Import ablehnt, entsteht so nie.
// Liefert die Dateiliste des Manifests und die Grösse des Archivs.
export async function writeProjectArchive(
  file: string,
  content: ArchiveContent,
  options: { modified?: Date; limits?: ArchiveLimits; onFile?: (bytes: number) => void } = {},
): Promise<{ files: ManifestFile[]; bytes: number }> {
  const limits = options.limits ?? ARCHIVE_LIMITS;
  if (content.media.length + 2 > limits.maxEntries)
    throw new ArchiveError('too-large', 'Das Projekt hat zu viele Bilder für eine .ajournal-Datei.');
  const zip = await ZipWriter.create(file, { modified: options.modified, limits });
  try {
    const files: ManifestFile[] = [];
    const add = async (entry: string, source: string, compress: boolean) => {
      const { size, sha256 } = await zip.addFile(entry, source, { compress });
      files.push({ path: entry, size, sha256 });
      options.onFile?.(size);
    };
    await add(DATABASE_ENTRY, content.dbFile, true);
    for (const m of content.media) await add(m.entry, m.file, false);
    const manifest: Manifest = {
      ...content.manifest,
      format: ARCHIVE_FORMAT,
      formatVersion: (content.manifest.formatVersion ?? ARCHIVE_FORMAT_VERSION) as Manifest['formatVersion'],
      files,
    };
    await zip.addBuffer(MANIFEST_ENTRY, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), {
      compress: true,
    });
    return { files, bytes: await zip.close() };
  } catch (err) {
    await zip.abort();
    throw err;
  }
}

export type ExportOutcome = { bytes: number; journals: number; media: number; warnings: string[] };

export async function exportProjectArchive(input: {
  db: Db;
  projectDir: string;
  target: string;
  appVersion: string;
  now: Date;
  onProgress?: Progress;
  limits?: ArchiveLimits;
}): Promise<ExportOutcome> {
  const limits = input.limits ?? ARCHIVE_LIMITS;
  const progress: Progress = input.onProgress ?? (() => {});
  const work = await mkdtemp(path.join(tmpdir(), 'lernjournal-export-'));
  try {
    // 1) Datenbank sichern (Backup-API) und prüfen
    progress('Datenbank wird gesichert …', 0, 1);
    const dbFile = path.join(work, DATABASE_ENTRY);
    const snap = await snapshotDatabase(input.db, dbFile);
    const dbBytes = (await stat(dbFile)).size;
    if (dbBytes > limits.maxDatabaseBytes)
      throw new ArchiveError('too-large', 'Die Projektdatenbank ist zu gross für eine .ajournal-Datei.');

    // Bilder laut KOPIE der Datenbank (passt genau zum gesicherten Stand)
    const warnings: string[] = [];
    const media: { entry: string; file: string; sha256: string; size: number }[] = [];
    let missing = 0;
    for (const m of snap.media) {
      // Pfad ist durch das Schema (CHECK) und MediaService immer media/<uuid>.<ext>;
      // was nicht so aussieht, könnte der Import nicht annehmen
      if (!MEDIA_ENTRY.test(m.relativePath)) {
        missing++;
        continue;
      }
      const file = path.join(input.projectDir, ...m.relativePath.split('/'));
      const size = await stat(file).then(
        (s) => (s.isFile() ? s.size : -1),
        () => -1,
      );
      if (size < 0 || size > limits.maxMediaBytes) {
        missing++;
        continue;
      }
      media.push({ entry: m.relativePath, file, sha256: m.sha256, size });
    }
    if (missing > 0)
      warnings.push(
        missing === 1
          ? '1 Bild fehlt im Projektordner (Ordner «media») und ist nicht in der Datei enthalten.'
          : `${missing} Bilder fehlen im Projektordner (Ordner «media») und sind nicht in der Datei enthalten.`,
      );

    // 2)–4) Schreiben, zurücklesen, umbenennen
    const total = dbBytes + media.reduce((s, m) => s + m.size, 0) || 1;
    let done = 0;
    let packed = -1; // −1: zuerst kommt die Datenbank, dann die Bilder
    let bytes = 0;
    let files: ManifestFile[] = [];
    await writeAtomically(input.target, async (tmp) => {
      progress('Datenbank wird verpackt …', 0, total);
      ({ files, bytes } = await writeProjectArchive(
        tmp,
        {
          dbFile,
          media: media.map((m) => ({ entry: m.entry, file: m.file })),
          manifest: {
            appVersion: input.appVersion,
            schemaVersion: snap.schemaVersion,
            createdAt: input.now.toISOString(),
            project: snap.project,
            counts: { journals: snap.journals, media: media.length },
          },
        },
        {
          modified: input.now,
          limits,
          onFile: (size) => {
            done += size;
            packed++;
            progress(
              packed < media.length
                ? `Bilder werden verpackt (${packed + 1} von ${media.length}) …`
                : 'Datei wird abgeschlossen …',
              done,
              total,
            );
          },
        },
      ));
      progress('Datei wird geprüft …', total, total);
      await verifyArchive(tmp, limits);
    });

    // Bild weicht von der Prüfsumme ab, die beim Einfügen gespeichert wurde
    // (Datei im Projektordner beschädigt?) – trotzdem übernehmen, aber sagen
    const writtenHash = new Map(files.map((f) => [f.path, f.sha256]));
    const changed = media.filter((m) => writtenHash.get(m.entry) !== m.sha256).length;
    if (changed > 0)
      warnings.push(
        changed === 1
          ? '1 Bild stimmt nicht mehr mit seiner Prüfsumme überein (möglicherweise beschädigt). Es wurde trotzdem übernommen.'
          : `${changed} Bilder stimmen nicht mehr mit ihrer Prüfsumme überein (möglicherweise beschädigt). Sie wurden trotzdem übernommen.`,
      );
    return { bytes, journals: snap.journals, media: media.length, warnings };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

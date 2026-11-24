// Wiederherstellen einer Sicherung (AJ-15): Datenbank prüfen und vorbereiten,
// Bilder zusammensuchen, als neues Projekt anlegen.
//
// Die Datenbank durchläuft genau dieselben Prüfungen wie beim Import einer
// .ajournal-Datei (archive-db.ts / archive-import.ts): Prüfsumme, exaktes
// Schema der Version, integrity_check, Fremdschlüssel, IDs, Journal-Inhalte
// nach dem Editor-Schema, Bildverweise; danach Migration auf das aktuelle
// Schema, Suchindex neu, nochmals integrity_check. Eine eigene Sicherung ist
// zwar vertrauenswürdiger als eine fremde Datei, aber der Ordner «backups»
// kann beschädigt oder verändert worden sein – wiederhergestellt wird nur,
// was alle Prüfungen besteht.
//
// Das Ersetzen des geöffneten Projekts (mit Sicherheitskopie vorher) steuert
// backup-service.ts, weil es das Projekt schliessen und wieder öffnen muss.
import { mkdirSync, readdirSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FolderKind } from '@shared/ipc';
import { BACKUP_TEXTS } from '@shared/backup';
import type { Db } from '../db/connection';
import { ArchiveError, DATABASE_ENTRY, type ArchiveLimits } from '../archive/archive-format';
import { verifyImportedDatabase, type MediaRow } from '../archive/archive-db';
import { finishImportedDatabase } from '../archive/archive-import';
import { writeAtomically } from '../fs-atomic';
import { DB_FILE, PROJECT_DIRS } from '../project/project-service';
import { BackupError, type BackupManifest } from './backup-format';
import { findMedia, ioError, openBackup } from './backup-store';

export type Progress = (step: string, percent: number | null) => void;

export type StagedDatabase = { manifest: BackupManifest; journals: number; media: MediaRow[] };

// Datenbank aus der Sicherung nach `dest` (neue Datei) entpacken, prüfen und
// auf den aktuellen Stand bringen. adjust läuft nach der Migration (z. B.
// Werte aus dem aktuellen Projekt übernehmen). Wirft BackupError.
export async function stageDatabase(
  file: string,
  dest: string,
  options: { adjust?: (db: Db) => void; limits?: ArchiveLimits } = {},
): Promise<StagedDatabase> {
  const { reader, manifest } = await openBackup(file, options.limits);
  try {
    const { sha256 } = await reader.extractTo(reader.entry(DATABASE_ENTRY)!, dest).catch((err: unknown) => {
      if (err instanceof ArchiveError) throw damagedBackup(err);
      throw ioError(err);
    });
    if (sha256 !== manifest.database.sha256) throw damagedBackup(new Error('Prüfsumme der Datenbank'));
  } finally {
    await reader.close();
  }
  try {
    const verified = verifyImportedDatabase(dest, manifest.schemaVersion);
    await finishImportedDatabase(dest, options.adjust);
    return { manifest, journals: verified.journals, media: verified.media };
  } catch (err) {
    if (err instanceof ArchiveError) {
      if (err.code === 'newer-version') throw new BackupError('newer-version', err.message);
      throw damagedBackup(err);
    }
    throw err;
  }
}

function damagedBackup(cause: Error): BackupError {
  console.error('[sicherung] Wiederherstellung abgelehnt:', cause.message);
  return new BackupError('damaged', BACKUP_TEXTS.damaged);
}

// Bilder für die wiederhergestellte Datenbank in `destDir` bereitstellen.
// Schon vorhandene, unversehrte Dateien bleiben (beim Ersetzen des aktuellen
// Projekts meist fast alle); sonst aus der ersten Quelle, deren Inhalt zur
// Prüfsumme passt – atomar, nie eine halbe Bilddatei. Liefert die Anzahl
// Bilder, die nirgends unversehrt zu finden waren.
export async function restoreMedia(
  rows: readonly MediaRow[],
  sources: readonly string[],
  destDir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ copied: number; missing: number }> {
  mkdirSync(destDir, { recursive: true });
  let copied = 0;
  let missing = 0;
  for (const [i, m] of rows.entries()) {
    onProgress?.(i, rows.length);
    const ref = { path: m.relativePath, sha256: m.sha256 };
    if (await findMedia([destDir], ref)) continue;
    const data = await findMedia(sources, ref);
    if (!data) {
      missing++;
      continue;
    }
    await writeAtomically(path.join(destDir, path.basename(m.relativePath)), (tmp) =>
      writeFile(tmp, data, { flush: true }),
    ).catch((err: unknown) => {
      throw ioError(err);
    });
    copied++;
  }
  return { copied, missing };
}

// Sicherung als NEUES Projekt in einen neuen oder leeren Ordner (SPEC:
// «vorzugsweise neues Zielprojekt»). Wie beim Import: Bei jedem Fehler wird
// entfernt, was angelegt wurde. Öffnen erledigt der Aufrufer.
export async function restoreAsNewProject(input: {
  file: string;
  sources: readonly string[];
  targetDir: string;
  inspectFolder: (dir: string) => { kind: FolderKind };
  onProgress?: Progress;
  limits?: ArchiveLimits;
}): Promise<{ journals: number; media: number; missing: number; manifest: BackupManifest }> {
  const progress = input.onProgress ?? (() => {});
  const target = input.targetDir;
  const { kind } = input.inspectFolder(target);
  if (kind !== 'new' && kind !== 'empty')
    throw new BackupError(
      'target',
      'Der Zielordner ist nicht leer. Eine Wiederherstellung als neues Lernjournal braucht einen neuen oder leeren Ordner.',
    );
  const createdDir = kind === 'new';
  let before: Set<string>;
  try {
    mkdirSync(target, { recursive: true });
    before = new Set(readdirSync(target));
  } catch (err) {
    throw ioError(err);
  }
  try {
    progress('Datenbank wird geprüft …', 0);
    const staged = await stageDatabase(input.file, path.join(target, DB_FILE), { limits: input.limits });
    const { missing } = await restoreMedia(staged.media, input.sources, path.join(target, 'media'), (d, t) =>
      progress(`Bilder werden kopiert (${d + 1} von ${t}) …`, Math.round(10 + (80 * d) / Math.max(1, t))),
    );
    for (const d of PROJECT_DIRS) mkdirSync(path.join(target, d), { recursive: true });
    return { journals: staged.journals, media: staged.media.length, missing, manifest: staged.manifest };
  } catch (err) {
    try {
      if (createdDir) await rm(target, { recursive: true, force: true });
      else
        for (const name of readdirSync(target))
          if (!before.has(name)) await rm(path.join(target, name), { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error('[sicherung] Aufräumen nach fehlgeschlagener Wiederherstellung:', cleanupErr);
    }
    throw ioError(err);
  }
}

// «3 Bilder fehlen …» (Hinweis nach der Wiederherstellung)
export function missingMediaWarning(missing: number): string[] {
  if (missing <= 0) return [];
  return [
    missing === 1
      ? '1 Bild war in der Sicherung nicht mehr unversehrt vorhanden und wird im Journal als fehlend angezeigt.'
      : `${missing} Bilder waren in der Sicherung nicht mehr unversehrt vorhanden und werden in den Journalen als fehlend angezeigt.`,
  ];
}

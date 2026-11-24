// Dienst «Projekt übergeben / importieren» (AJ-14). Verbindet das geöffnete
// Projekt mit Export (archive-export.ts) und Import (archive-import.ts) und
// übersetzt Dateisystem-Fehler in verständliche Meldungen.
//
// Kennt kein Electron (testbar mit Vitest): Dialoge, das Öffnen des
// importierten Projekts und die Fortschrittsanzeige erledigen die Handler.
import path from 'node:path';
import type { ArchiveProgress, ArchiveSummary } from '@shared/archive';
import type { FolderKind } from '@shared/ipc';
import { localIsoDate } from '@shared/school-year';
import type { Db } from '../db/connection';
import { safeFileName } from '../export/export-service';
import { ARCHIVE_EXTENSION, ARCHIVE_LIMITS, ArchiveError, type ArchiveLimits } from './archive-format';
import { exportProjectArchive, type ExportOutcome } from './archive-export';
import {
  importArchive,
  inspectArchive,
  recordExport,
  type ImportOutcome,
  type Progress,
} from './archive-import';

export type ArchiveServiceDeps = {
  getDb: () => Db;
  projectDir: () => string;
  appVersion: string;
  inspectFolder: (dir: string) => { kind: FolderKind };
  now?: () => Date;
  limits?: ArchiveLimits;
};

// Fortschritt für die Oberfläche: Schritt + Prozent
export type ProgressListener = (p: ArchiveProgress) => void;
export const toPercent =
  (listener?: ProgressListener): Progress =>
  (step, done, total) =>
    listener?.({ step, percent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null });

// Endung ergänzen, falls im Dialog weggelassen
export function withArchiveExtension(file: string): string {
  return file.toLowerCase().endsWith(`.${ARCHIVE_EXTENSION}`) ? file : `${file}.${ARCHIVE_EXTENSION}`;
}

export class ArchiveService {
  private readonly now: () => Date;
  private readonly limits: ArchiveLimits;

  constructor(private readonly deps: ArchiveServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.limits = deps.limits ?? ARCHIVE_LIMITS;
  }

  private projectTitle(): string {
    const r = this.deps.getDb().prepare('SELECT title FROM project').get() as { title: string } | undefined;
    return r?.title ?? '';
  }

  // «2026-11-24 Lehre 2025–2029.ajournal»: Datum vorne, damit mehrere Stände
  // im Explorer chronologisch stehen
  suggestedName(): string {
    return `${localIsoDate(this.now())} ${safeFileName(this.projectTitle(), 'Lernjournal')}.${ARCHIVE_EXTENSION}`;
  }

  // Ordnername für den Import, abgeleitet vom Projekttitel
  folderNameFor(title: string): string {
    return safeFileName(title, 'Lernjournal');
  }

  async exportTo(
    target: string,
    onProgress?: ProgressListener,
  ): Promise<ExportOutcome & { lastExportAt: string | null }> {
    // Nicht in den Bilderordner des Projekts: Unbekannte Dateien dort räumt
    // das Programm beim nächsten Öffnen auf (MediaService.collectGarbage)
    const mediaDir = path.resolve(this.deps.projectDir(), 'media');
    if (
      path
        .resolve(target)
        .toLowerCase()
        .startsWith(mediaDir.toLowerCase() + path.sep)
    ) {
      throw new ArchiveError(
        'target',
        'Bitte nicht im Bilderordner des Projekts speichern – am besten auf einem USB-Stick oder einer externen Festplatte.',
      );
    }
    const now = this.now();
    let outcome: ExportOutcome;
    try {
      outcome = await exportProjectArchive({
        db: this.deps.getDb(),
        projectDir: this.deps.projectDir(),
        target,
        appVersion: this.deps.appVersion,
        now,
        onProgress: toPercent(onProgress),
        limits: this.limits,
      });
    } catch (err) {
      if (err instanceof ArchiveError) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
        throw new ArchiveError(
          'io',
          `«${path.basename(target)}» konnte nicht gespeichert werden. Ist die Datei in einem anderen Programm geöffnet oder der Ordner schreibgeschützt?`,
        );
      }
      if (code === 'ENOENT' || code === 'ENOSPC' || code === 'EROFS') {
        throw new ArchiveError(
          'io',
          'Die Datei konnte nicht gespeichert werden. Ist der Ordner (z. B. USB-Stick) noch erreichbar und genug Platz frei?',
        );
      }
      throw err;
    }
    // Erst nach bestandener Prüfung: Zeitpunkt für die Erinnerung nach 30
    // Tagen merken (AJ-15). Schlägt das fehl, ist die Datei trotzdem gut –
    // dann erinnert das Programm eben zu früh, nichts geht verloren.
    let lastExportAt: string | null = now.toISOString();
    try {
      recordExport(this.deps.getDb(), lastExportAt);
    } catch (err) {
      console.error('[archiv] Zeitpunkt der Übergabe nicht gespeichert:', err);
      lastExportAt = null;
    }
    return { ...outcome, lastExportAt };
  }

  inspect(file: string): Promise<ArchiveSummary> {
    return inspectArchive(file, this.limits);
  }

  importTo(file: string, targetDir: string, onProgress?: ProgressListener): Promise<ImportOutcome> {
    return importArchive({
      file,
      targetDir,
      inspectFolder: this.deps.inspectFolder,
      onProgress: toPercent(onProgress),
      limits: this.limits,
      now: this.now(),
    });
  }
}

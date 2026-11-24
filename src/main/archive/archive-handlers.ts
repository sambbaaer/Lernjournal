// IPC-Handler «Projekt übergeben / importieren» (AJ-14).
//
// Die Oberfläche schickt bei keinem dieser Befehle einen Pfad. Alle Orte
// stammen aus den nativen Dialogen im Hauptprozess (bzw. aus dem eigenen
// Vorschlag) und werden hier zwischen den Schritten gemerkt:
//
//   Export:  archive:export → Speichern-Dialog → schreiben → «Im Ordner anzeigen»
//   Import:  archive:chooseImport  → Öffnen-Dialog, Datei prüfen, Vorschau +
//                                    Vorschlag Zielordner (Dokumente\<Titel>)
//            archive:chooseImportTarget → anderer Zielordner (optional)
//            archive:import       → entpacken, prüfen, Projekt öffnen
//
// Ein laufender Vorgang sperrt die anderen (busy). Während des Imports bleibt
// das bisherige Projekt offen; erst nach erfolgreicher Prüfung wird auf das
// neue Projekt gewechselt.
import path from 'node:path';
import type { Handlers } from '../ipc-handler';
import type { OpenedProjects } from '../project/project-handlers';
import type { ProjectService } from '../project/project-service';
import { ArchiveError } from './archive-format';
import { withArchiveExtension, type ArchiveService, type ProgressListener } from './archive-service';
import type { ArchiveSummary } from '@shared/archive';

export type ArchiveHandlerDeps = {
  service: ArchiveService;
  projects: ProjectService;
  opened: OpenedProjects;
  documentsDir: string;
  // Native Dialoge; null = abgebrochen
  chooseExportPath: (suggestedName: string) => Promise<string | null>;
  chooseArchiveFile: () => Promise<string | null>;
  chooseImportFolder: () => Promise<string | null>;
  showInFolder: (file: string) => void;
  progress: ProgressListener;
};

// Meldungen zu ProjectService.targetFolderFor (auch für die Wiederherstellung, AJ-15)
export const TARGET_PROBLEMS = {
  'not-a-folder': 'Das ist kein Ordner.',
  // Nicht in einen bestehenden Projektordner verschachteln
  project:
    'Dieser Ordner ist bereits ein Lernjournal. Bitte einen anderen Ordner wählen – ein bestehendes Projekt wird nie überschrieben.',
  'none-free': 'Kein freier Ordner gefunden. Bitte einen anderen Ordner wählen.',
} as const;

type ArchiveChannels =
  | 'archive:export'
  | 'archive:showFile'
  | 'archive:chooseImport'
  | 'archive:chooseImportTarget'
  | 'archive:import';

export function createArchiveHandlers(deps: ArchiveHandlerDeps): Pick<Handlers, ArchiveChannels> {
  let busy = false;
  // Zuletzt übergebene Datei (nur diese zeigt «Im Ordner anzeigen»)
  let lastExport: string | null = null;
  // Gewählte Datei und Zielordner zwischen Vorschau und Import
  let pending: { file: string; summary: ArchiveSummary; target: string } | null = null;

  async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (busy)
      throw new ArchiveError(
        'io',
        'Es läuft bereits eine Übergabe oder ein Import. Bitte einen Moment warten.',
      );
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  }

  return {
    'archive:export': () =>
      exclusive(async () => {
        if (!deps.projects.isOpen) throw new ArchiveError('target', 'Kein Projekt geöffnet.');
        const chosen = await deps.chooseExportPath(deps.service.suggestedName());
        if (!chosen) return { status: 'canceled' as const };
        const target = withArchiveExtension(chosen);
        const r = await deps.service.exportTo(target, deps.progress);
        lastExport = target;
        return {
          status: 'saved' as const,
          fileName: path.basename(target),
          bytes: r.bytes,
          journals: r.journals,
          media: r.media,
          warnings: r.warnings,
          lastExportAt: r.lastExportAt,
        };
      }),

    'archive:showFile': () => {
      if (!lastExport) return { shown: false };
      deps.showInFolder(lastExport);
      return { shown: true };
    },

    'archive:chooseImport': () =>
      exclusive(async () => {
        pending = null;
        const file = await deps.chooseArchiveFile();
        if (!file) return { status: 'canceled' as const };
        const summary = await deps.service.inspect(file);
        const target = deps.projects.freeFolder(deps.documentsDir, deps.service.folderNameFor(summary.title));
        if (!target)
          throw new ArchiveError('target', 'Kein freier Ordner gefunden. Bitte einen Zielordner wählen.');
        pending = { file, summary, target };
        return { status: 'ready' as const, fileName: path.basename(file), summary, target };
      }),

    // Anderer Zielordner: neu/leer → dieser, sonst ein Unterordner mit dem
    // Projekttitel (ProjectService.targetFolderFor). So entsteht nie ein
    // Projekt zwischen fremden Dateien.
    'archive:chooseImportTarget': () =>
      exclusive(async () => {
        if (!pending) throw new ArchiveError('target', 'Bitte zuerst eine .ajournal-Datei wählen.');
        const dir = await deps.chooseImportFolder();
        if (!dir) return { target: null };
        const r = deps.projects.targetFolderFor(dir, deps.service.folderNameFor(pending.summary.title));
        if ('problem' in r) throw new ArchiveError('target', TARGET_PROBLEMS[r.problem]);
        pending.target = r.target;
        return { target: r.target };
      }),

    'archive:import': () =>
      exclusive(async () => {
        if (!pending) throw new ArchiveError('target', 'Bitte zuerst eine .ajournal-Datei wählen.');
        const { file, target } = pending;
        const outcome = await deps.service.importTo(file, target, deps.progress);
        pending = null;
        // Wie «Öffnen»: Sperre, Integrität, Migration (keine mehr nötig),
        // Aufräumen und Suchindex-Prüfung (afterOpen). Schliesst das bisherige Projekt.
        deps.progress({ step: 'Projekt wird geöffnet …', percent: 100 });
        const result = deps.opened.remember(await deps.projects.open(target));
        if (result.status !== 'opened') {
          // Sehr unwahrscheinlich (gerade erst geprüft) – Daten bleiben, Ordner freigeben
          deps.opened.guard.allow(target);
          throw new ArchiveError(
            'io',
            `Das Projekt wurde nach «${target}» importiert, konnte aber nicht geöffnet werden. Öffne es über Datei → Öffnen.`,
          );
        }
        return {
          status: 'imported' as const,
          project: result.project,
          journals: outcome.journals,
          media: outcome.media,
          warnings: outcome.warnings,
        };
      }),
  };
}

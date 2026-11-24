// IPC-Handler «Sicherungen und Wiederherstellung» (AJ-15).
//
// Die Oberfläche schickt nur IDs aus backup:list (Muster im IPC-Vertrag
// geprüft, Existenz im Dienst) und nie einen Pfad. Den Zielordner für «als
// neues Lernjournal» schlägt der Hauptprozess vor (Dokumente\<Titel> (Stand
// JJJJ-MM-TT)) oder er stammt aus dem nativen Ordner-Dialog; er wird hier
// zwischen Vorschau und Wiederherstellung gemerkt.
//
//   backup:preview            → prüfen, Vorschau, Vorschlag Zielordner
//   backup:chooseRestoreTarget → anderer Zielordner (optional)
//   backup:restore            → wiederherstellen, Ergebnis öffnen
import { localIsoDate } from '@shared/school-year';
import { ArchiveError } from '../archive/archive-format';
import { TARGET_PROBLEMS } from '../archive/archive-handlers';
import { safeFileName } from '../export/export-service';
import type { Handlers } from '../ipc-handler';
import type { OpenedProjects } from '../project/project-handlers';
import type { ProjectService } from '../project/project-service';
import { BackupError } from './backup-format';
import type { BackupService, RestoreProgress } from './backup-service';
import { listBackups, toEntry } from './backup-store';

export type BackupHandlerDeps = {
  service: BackupService;
  projects: ProjectService;
  opened: OpenedProjects;
  documentsDir: string;
  chooseRestoreFolder: () => Promise<string | null>;
  progress: (p: { step: string; percent: number | null }) => void;
};

type BackupChannels =
  'backup:list' | 'backup:create' | 'backup:preview' | 'backup:chooseRestoreTarget' | 'backup:restore';

export function createBackupHandlers(deps: BackupHandlerDeps): Pick<Handlers, BackupChannels> {
  // Zielordner für «als neues Lernjournal», je Sicherung (aus der letzten Vorschau)
  let pending: { id: string; title: string; createdAt: string; target: string } | null = null;

  const requireOpen = () => {
    if (!deps.projects.isOpen) throw new BackupError('not-found', 'Kein Projekt geöffnet.');
  };
  const folderName = (title: string, createdAt: string) =>
    `${safeFileName(title, 'Lernjournal')} (Stand ${localIsoDate(new Date(createdAt))})`;
  const progress: RestoreProgress = (step, percent) => deps.progress({ step, percent });

  return {
    'backup:list': async () => {
      requireOpen();
      return deps.service.list();
    },

    'backup:create': async () => {
      requireOpen();
      const r = await deps.service.backupNow();
      return { status: r.status, backup: toEntry(r.backup) };
    },

    'backup:preview': async ({ id }) => {
      requireOpen();
      pending = null;
      const { title, ...preview } = await deps.service.preview(id);
      const target = deps.projects.freeFolder(deps.documentsDir, folderName(title, preview.createdAt));
      if (!target) throw new BackupError('target', TARGET_PROBLEMS['none-free']);
      pending = { id, title, createdAt: preview.createdAt, target };
      return { ...preview, target };
    },

    'backup:chooseRestoreTarget': async ({ id }) => {
      if (pending?.id !== id) throw new BackupError('target', 'Bitte die Sicherung zuerst nochmals wählen.');
      const dir = await deps.chooseRestoreFolder();
      if (!dir) return { target: null };
      const r = deps.projects.targetFolderFor(dir, folderName(pending.title, pending.createdAt));
      if ('problem' in r) throw new BackupError('target', TARGET_PROBLEMS[r.problem]);
      pending.target = r.target;
      return { target: r.target };
    },

    'backup:restore': async ({ id, mode }) => {
      requireOpen();
      if (mode === 'replace') {
        const r = await deps.service.restoreReplace(id, progress);
        const project = deps.opened.remember(r.opened);
        if (project.status !== 'opened') throw new Error('Projekt nach dem Ersetzen nicht geöffnet');
        const safety = r.safetyBackupId
          ? (await listBackups(project.project.path)).find((b) => b.id === r.safetyBackupId)
          : undefined;
        return {
          status: 'restored' as const,
          mode,
          project: project.project,
          journals: r.journals,
          media: r.media,
          warnings: r.warnings,
          safetyBackup: safety ? toEntry(safety) : null,
        };
      }
      if (pending?.id !== id) throw new BackupError('target', 'Bitte die Sicherung zuerst nochmals wählen.');
      const target = pending.target;
      const r = await deps.service.restoreAsNew(id, target, progress);
      pending = null;
      // Wie nach einem Import: normal öffnen (Sperre, Prüfungen). Schliesst
      // das bisherige Projekt – mit Sicherung, falls dort etwas geändert wurde.
      progress('Projekt wird geöffnet …', 100);
      const opened = deps.opened.remember(await deps.projects.open(target));
      if (opened.status !== 'opened') {
        deps.opened.guard.allow(target);
        throw new ArchiveError(
          'io',
          `Die Sicherung wurde nach «${target}» wiederhergestellt, konnte aber nicht geöffnet werden. Öffne sie über Datei → Öffnen.`,
        );
      }
      return {
        status: 'restored' as const,
        mode,
        project: opened.project,
        journals: r.journals,
        media: r.media,
        warnings: r.warnings,
        safetyBackup: null,
      };
    },
  };
}

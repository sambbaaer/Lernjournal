// Dienst «Sicherungen» für das geöffnete Projekt (AJ-15): wann automatisch
// gesichert wird, Sichern von Hand, Vorschau und Wiederherstellung.
//
// Zeitpunkte (SPEC: «mindestens täglich nach Änderungen und bei Programmende»):
//   - beim Öffnen: im Hintergrund, wenn sich der Inhalt seit der neuesten
//     Sicherung geändert hat (Fingerabdruck) – fängt auch Änderungen einer
//     Sitzung auf, die abgestürzt ist und darum nicht mehr sichern konnte
//   - beim Schliessen (Projektwechsel, Programmende): wenn in dieser Sitzung
//     etwas geändert wurde
//   - täglich: das laufende Programm prüft alle BACKUP_POLICY.checkEveryMs,
//     ob die neueste Sicherung älter als intervalMs ist und sich seither
//     etwas geändert hat
//   - von Hand: «Jetzt sichern» in den Einstellungen
// «Geändert in dieser Sitzung» misst SQLite selbst: total_changes() zählt
// alle Zeilen, die diese Verbindung seit dem Öffnen geschrieben hat. Erst der
// Fingerabdruck entscheidet endgültig – ohne echte Änderung keine neue
// Sicherung, damit die Rotation keine verschiedenen Stände verdrängt.
//
// Alle Vorgänge laufen nacheinander (exclusive): nie zwei Sicherungen
// gleichzeitig, nie eine Rotation während einer Wiederherstellung.
//
// Kennt kein Electron (testbar mit Vitest).
import { copyFile, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { BACKUP_POLICY, type BackupPreview, type BackupReason } from '@shared/backup';
import type { OpenResult } from '@shared/ipc';
import type { ArchiveLimits } from '../archive/archive-format';
import type { Db } from '../db/connection';
import { DB_FILE, type ProjectService } from '../project/project-service';
import { BackupError, STAGING_PREFIX } from './backup-format';
import { missingMediaWarning, restoreAsNewProject, restoreMedia, stageDatabase } from './backup-restore';
import {
  backupFile,
  backupsDir,
  cleanupLeftovers,
  createBackup,
  ioError,
  listBackups,
  mediaSources,
  newestBackup,
  poolDir,
  rotateBackups,
  toEntry,
  verifyBackup,
  type CreateBackupOutcome,
} from './backup-store';
import type { RotationPolicy } from './rotation';

export type BackupServiceDeps = {
  projects: ProjectService;
  appVersion: string;
  now?: () => Date;
  policy?: RotationPolicy & { intervalMs: number };
  limits?: ArchiveLimits;
};

export type RestoreProgress = (step: string, percent: number | null) => void;

export type RestoreOutcome = {
  journals: number;
  media: number;
  warnings: string[];
  // Sicherung mit dem Stand VOR der Wiederherstellung (nur beim Ersetzen)
  safetyBackupId: string | null;
};

type AutomaticReason = Extract<BackupReason, 'oeffnen' | 'schliessen' | 'taeglich'>;

export class BackupService {
  private queue: Promise<unknown> = Promise.resolve();
  // total_changes() beim letzten Abgleich mit einer Sicherung (null = unbekannt)
  private baseline: number | null = null;
  // Nach dem Ersetzen durch eine Sicherung: Die Sicherung beim Öffnen wäre nur
  // eine Kopie dessen, was gerade wiederhergestellt wurde
  private skipNextOpen = false;
  private readonly now: () => Date;
  private readonly policy: RotationPolicy & { intervalMs: number };
  // Letzte automatische Sicherung fehlgeschlagen (für die Einstellungen)
  lastError: string | null = null;

  constructor(private readonly deps: BackupServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.policy = deps.policy ?? BACKUP_POLICY;
  }

  private get projects() {
    return this.deps.projects;
  }

  // Nacheinander ausführen; ein Fehler blockiert die folgenden nicht
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  // Wartet, bis alle angestossenen Vorgänge fertig sind (Tests, Beenden)
  async idle(): Promise<void> {
    let last: Promise<unknown>;
    do {
      last = this.queue;
      await last;
    } while (last !== this.queue);
  }

  private changes(db: Db): number {
    return (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
  }

  // --- Automatisch --------------------------------------------------------------

  // Von ProjectService.afterOpen: Reste aufräumen, dann im Hintergrund sichern
  afterOpen(): void {
    if (!this.projects.isOpen) return;
    const dir = this.projects.dir;
    this.baseline = this.changes(this.projects.db);
    void this.exclusive(() => cleanupLeftovers(dir)).catch(() => {});
    void this.automatic('oeffnen');
  }

  // Vor dem Schliessen des Projekts (ProjectService.beforeClose)
  beforeClose(): Promise<void> {
    return this.automatic('schliessen');
  }

  // Regelmässig vom Hauptprozess aufgerufen (setInterval)
  tick(): Promise<void> {
    return this.automatic('taeglich');
  }

  private automatic(reason: AutomaticReason): Promise<void> {
    return this.exclusive(async () => {
      if (!this.projects.isOpen) return;
      if (reason === 'oeffnen' && this.skipNextOpen) {
        this.skipNextOpen = false;
        return;
      }
      const db = this.projects.db;
      const dir = this.projects.dir;
      const changed = this.baseline === null || this.changes(db) !== this.baseline;
      // Beim Öffnen entscheidet allein der Fingerabdruck (Absturz der letzten Sitzung)
      if (reason !== 'oeffnen' && !changed) return;
      if (reason === 'taeglich') {
        const newest = await newestBackup(dir);
        if (newest && !this.dueByAge(newest.createdAt)) return;
      }
      try {
        await this.create(db, dir, reason);
        this.lastError = null;
      } catch (err) {
        console.error(`[sicherung] Automatische Sicherung (${reason}) fehlgeschlagen:`, err);
        this.lastError =
          err instanceof BackupError
            ? err.message
            : 'Die letzte automatische Sicherung ist fehlgeschlagen. Ist der Projektordner erreichbar und genug Platz frei?';
      }
    });
  }

  // Neueste Sicherung älter als das Intervall – oder mehr als ein Intervall
  // «in der Zukunft» (Uhr war vorgestellt): dann lieber sichern
  private dueByAge(createdAt: Date): boolean {
    const age = this.now().getTime() - createdAt.getTime();
    return age >= this.policy.intervalMs || age < -this.policy.intervalMs;
  }

  // Sichern (falls geändert) und rotieren. Merkt sich den Zählerstand VOR dem
  // Sichern: Was währenddessen gespeichert wird, zählt als neue Änderung.
  private async create(db: Db, dir: string, reason: BackupReason, protect: string[] = []) {
    const before = this.changes(db);
    const outcome = await createBackup({
      db,
      projectDir: dir,
      reason,
      appVersion: this.deps.appVersion,
      now: this.now(),
      skipIfUnchanged: true,
      limits: this.deps.limits,
    });
    this.baseline = before;
    if (outcome.status === 'created')
      await rotateBackups(dir, { protect: [outcome.backup.id, ...protect], policy: this.policy }).catch(
        (err: unknown) => console.error('[sicherung] Rotation fehlgeschlagen:', err),
      );
    return outcome;
  }

  // --- Von Hand -------------------------------------------------------------------

  backupNow(): Promise<CreateBackupOutcome> {
    return this.exclusive(async () => {
      const outcome = await this.create(this.projects.db, this.projects.dir, 'manuell');
      this.lastError = null;
      return outcome;
    });
  }

  // Nicht exklusiv: Die Liste soll nicht auf eine lange Sicherung warten (die
  // erste kopiert alle Bilder); Temp-Dateien laufender Vorgänge zählen nicht mit.
  async list() {
    return { backups: (await listBackups(this.projects.dir)).map(toEntry), lastError: this.lastError };
  }

  // --- Wiederherstellen -----------------------------------------------------------

  // Datei zu einer ID. Die ID ist schon nach Muster geprüft (IPC); hier
  // zusätzlich: Sie muss jetzt im Ordner «backups» stehen.
  private async fileFor(dir: string, id: string): Promise<string> {
    const file = backupFile(dir, id);
    const ok = await stat(file).then(
      (s) => s.isFile(),
      () => false,
    );
    if (!ok)
      throw new BackupError('not-found', 'Diese Sicherung gibt es nicht mehr. Bitte die Liste neu laden.');
    return file;
  }

  // Vorschau mit vollständiger Prüfung (Datenbank und alle Bilder)
  preview(id: string): Promise<Omit<BackupPreview, 'target'> & { title: string }> {
    return this.exclusive(async () => {
      const dir = this.projects.dir;
      const db = this.projects.db;
      const { manifest, missingMedia } = await verifyBackup(
        await this.fileFor(dir, id),
        mediaSources(dir),
        this.deps.limits,
      );
      const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
      return {
        id,
        title: manifest.project.title,
        createdAt: manifest.createdAt,
        reason: manifest.reason,
        journals: manifest.counts.journals,
        media: manifest.counts.media,
        recentTitles: manifest.recentTitles,
        appVersion: manifest.appVersion,
        missingMedia,
        current: {
          journals: count('SELECT count(*) AS n FROM journal'),
          media: count('SELECT count(*) AS n FROM media'),
        },
      };
    });
  }

  // Als neues Lernjournal in targetDir. Öffnen erledigt der Aufrufer – NICHT
  // hier drin, denn das Öffnen schliesst das aktuelle Projekt, und dessen
  // Sicherung beim Schliessen muss in die Warteschlange (sonst Verklemmung).
  restoreAsNew(id: string, targetDir: string, onProgress?: RestoreProgress): Promise<RestoreOutcome> {
    return this.exclusive(async () => {
      const dir = this.projects.dir;
      const r = await restoreAsNewProject({
        file: await this.fileFor(dir, id),
        sources: mediaSources(dir),
        targetDir,
        inspectFolder: (d) => this.projects.inspectFolder(d),
        onProgress,
        limits: this.deps.limits,
      });
      return {
        journals: r.journals,
        media: r.media,
        warnings: missingMediaWarning(r.missing),
        safetyBackupId: null,
      };
    });
  }

  // Aktuelles Lernjournal durch die Sicherung ersetzen:
  //   1. Sicherung vollständig prüfen (vorher nichts verändern)
  //   2. Sicherheitskopie des aktuellen Stands – schlägt sie fehl, Abbruch
  //   3. Datenbank in einem Arbeitsordner unter «backups» vorbereiten
  //      (Prüfung, Migration, Suchindex); Zeitpunkt der letzten Übergabe und
  //      «Später erinnern» vom aktuellen Projekt übernehmen – die Übergabe
  //      auf den USB-Stick hat ja wirklich stattgefunden
  //   4. fehlende Bilder in den Bilderordner des Projekts
  //   5. Projekt schliessen, Datenbankdatei atomar ersetzen, wieder öffnen
  //      (Sperre, Integrität, Aufräumen). Lässt sich die neue Datei nicht
  //      öffnen, kommt die bisherige zurück.
  // Der Aufrufer speichert vorher Ausstehendes in der Oberfläche.
  restoreReplace(
    id: string,
    onProgress?: RestoreProgress,
  ): Promise<RestoreOutcome & { opened: Extract<OpenResult, { status: 'opened' }> }> {
    const progress: RestoreProgress = onProgress ?? (() => {});
    return this.exclusive(async () => {
      const dir = this.projects.dir;
      const db = this.projects.db;
      const file = await this.fileFor(dir, id);

      progress('Sicherung wird geprüft …', 0);
      await verifyBackup(file, mediaSources(dir), this.deps.limits);

      progress('Aktueller Stand wird gesichert …', 15);
      let safety: CreateBackupOutcome;
      try {
        safety = await this.create(db, dir, 'vor-wiederherstellung', [id]);
      } catch (err) {
        console.error('[sicherung] Sicherheitskopie vor Wiederherstellung fehlgeschlagen:', err);
        throw new BackupError(
          'source',
          'Der aktuelle Stand konnte nicht gesichert werden. Darum wurde nichts wiederhergestellt – dein Lernjournal ist unverändert.',
        );
      }

      const live = db.prepare('SELECT last_export_at, export_reminder_snoozed_until FROM project').get() as {
        last_export_at: string | null;
        export_reminder_snoozed_until: string | null;
      };
      const staging = await mkdtemp(path.join(backupsDir(dir), STAGING_PREFIX)).catch((err: unknown) => {
        throw ioError(err);
      });
      try {
        progress('Sicherung wird vorbereitet …', 30);
        const stagedDb = path.join(staging, DB_FILE);
        const staged = await stageDatabase(file, stagedDb, {
          limits: this.deps.limits,
          adjust: (d) => carryOverExport(d, live),
        });

        progress('Bilder werden bereitgestellt …', 50);
        const { missing } = await restoreMedia(
          staged.media,
          [poolDir(dir)],
          path.join(dir, 'media'),
          (d, t) =>
            progress(
              `Bilder werden bereitgestellt (${d + 1} von ${t}) …`,
              Math.round(50 + (35 * d) / Math.max(1, t)),
            ),
        );

        progress('Lernjournal wird ersetzt …', 90);
        const opened = await this.swapDatabase(dir, stagedDb, staging);
        return {
          opened,
          journals: staged.journals,
          media: staged.media.length,
          warnings: missingMediaWarning(missing),
          safetyBackupId: safety.backup.id,
        };
      } finally {
        await rm(staging, { recursive: true, force: true }).catch(() => {});
      }
    });
  }

  // Schritt 5 von restoreReplace. Vor dem Tausch wird eine Kopie der
  // bisherigen Datei im Arbeitsordner abgelegt (zusätzlich zur Sicherheitskopie),
  // damit ein Fehlschlag beim Öffnen sofort rückgängig gemacht werden kann.
  private async swapDatabase(
    dir: string,
    stagedDb: string,
    staging: string,
  ): Promise<Extract<OpenResult, { status: 'opened' }>> {
    const dbPath = path.join(dir, DB_FILE);
    const previous = path.join(staging, 'vorher.sqlite');
    const reopen = async () => {
      const r = await this.projects.open(dir).catch(() => null);
      if (r?.status !== 'opened')
        console.error('[sicherung] Projekt liess sich nicht wieder öffnen:', r?.status);
    };
    try {
      // Schliessen schreibt die WAL-Datei zurück (Checkpoint) und gibt die Sperre frei
      this.projects.close();
      // Eine nicht leere WAL-Datei gehörte zur bisherigen Datenbank und würde
      // sonst auf die neue angewendet – dann lieber abbrechen
      const wal = await stat(`${dbPath}-wal`).then(
        (s) => s.size,
        () => 0,
      );
      if (wal > 0) throw new Error('WAL-Datei nach dem Schliessen nicht leer');
      await rm(`${dbPath}-wal`, { force: true });
      await rm(`${dbPath}-shm`, { force: true });
      await copyFile(dbPath, previous);
      await renameWithRetry(stagedDb, dbPath);
    } catch (err) {
      console.error('[sicherung] Datenbank nicht ersetzt:', err);
      await reopen();
      throw new BackupError(
        'io',
        'Das Lernjournal konnte nicht ersetzt werden und ist unverändert. Ist eine Datei im Projektordner in einem anderen Programm geöffnet?',
      );
    }
    this.skipNextOpen = true;
    const r = await this.projects.open(dir).catch((err: unknown) => {
      console.error('[sicherung] Wiederhergestelltes Projekt öffnen:', err);
      return null;
    });
    if (r?.status === 'opened') return r;
    this.skipNextOpen = false;
    await renameWithRetry(previous, dbPath).catch((err: unknown) =>
      console.error('[sicherung] Bisherige Datenbank nicht zurückgelegt:', err),
    );
    await reopen();
    throw new BackupError(
      'damaged',
      'Die wiederhergestellte Sicherung liess sich nicht öffnen. Dein Lernjournal ist unverändert.',
    );
  }
}

// Zeitpunkt der letzten Übergabe: den neueren der beiden behalten (ISO-Text in
// UTC lässt sich direkt vergleichen); «Später erinnern» vom aktuellen Projekt
function carryOverExport(
  db: Db,
  live: { last_export_at: string | null; export_reminder_snoozed_until: string | null },
): void {
  const restored = db.prepare('SELECT last_export_at FROM project').get() as {
    last_export_at: string | null;
  };
  const newer =
    [restored.last_export_at, live.last_export_at]
      .filter((v): v is string => v !== null)
      .sort()
      .at(-1) ?? null;
  db.prepare('UPDATE project SET last_export_at = ?, export_reminder_snoozed_until = ?').run(
    newer,
    live.export_reminder_snoozed_until,
  );
}

// Windows: Virenscanner oder Suchindex halten eine frisch geschriebene Datei
// manchmal einen Moment offen (EPERM/EBUSY) – kurz warten und nochmals
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (i >= attempts || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      await new Promise((r) => setTimeout(r, 200 * i));
    }
  }
}

// Sicherungen und Wiederherstellung aus Sicht der Oberfläche (AJ-15). Reine
// Ablauf-Logik ohne React, damit sie mit Vitest prüfbar ist
// (window.lernjournal wird im Test ersetzt).
//
// Die Oberfläche kennt Sicherungen nur über ihre ID aus der Liste des
// Hauptprozesses; Pfade schickt sie nie. Vor dem Sichern und Wiederherstellen
// wird Ausstehendes im offenen Journal gespeichert – sonst fehlte eben
// Getipptes in der Sicherung bzw. ginge beim Ersetzen verloren.
import {
  BACKUP_REASON_LABELS,
  type BackupEntry,
  type BackupList,
  type BackupPreview,
  type RestoreMode,
} from '@shared/backup';
import { formatFileSize } from '@shared/export';
import type { ProjectInfo } from '@shared/ipc';
import { errorText, NOT_SAVED, plural } from '../archive/archive-actions';
import { formatDateTime } from '../project/messages';

export type Failure = { kind: 'error'; message: string };

// «Beim Schliessen», «Von Hand» … – unlesbare Sicherung: «Beschädigt»
export function reasonLabel(entry: Pick<BackupEntry, 'reason' | 'damaged'>): string {
  return entry.damaged || !entry.reason ? 'Beschädigt' : BACKUP_REASON_LABELS[entry.reason];
}

// «3 Journale · 2 Bilder · 1,2 MB»
export function entryContent(entry: BackupEntry): string {
  if (entry.damaged || entry.journals === null || entry.media === null)
    return `nicht lesbar · ${formatFileSize(entry.bytes)}`;
  return [
    plural(entry.journals, 'Journal', 'Journale'),
    plural(entry.media, 'Bild', 'Bilder'),
    formatFileSize(entry.bytes),
  ].join(' · ');
}

// «24.11.2026, 09:30»
export const entryDate = (entry: Pick<BackupEntry, 'createdAt'>) => formatDateTime(entry.createdAt);

export async function loadBackups(): Promise<{ kind: 'ok'; list: BackupList } | Failure> {
  const res = await window.lernjournal.backup.list().catch(() => null);
  if (!res || !res.ok)
    return { kind: 'error', message: errorText(res, 'Die Sicherungen konnten nicht gelesen werden.') };
  return { kind: 'ok', list: res.data };
}

// «Jetzt sichern». 'unchanged': Die neueste Sicherung ist schon aktuell.
export async function backupNow(
  saveFirst: () => Promise<boolean>,
): Promise<{ kind: 'created' | 'unchanged'; backup: BackupEntry } | Failure> {
  if (!(await saveFirst().catch(() => false))) return { kind: 'error', message: NOT_SAVED };
  const res = await window.lernjournal.backup.create().catch(() => null);
  if (!res || !res.ok)
    return { kind: 'error', message: errorText(res, 'Die Sicherung konnte nicht erstellt werden.') };
  return { kind: res.data.status, backup: res.data.backup };
}

// Meldung nach «Jetzt sichern» (Statusleiste)
export function backupNowNotice(out: { kind: 'created' | 'unchanged'; backup: BackupEntry }): string {
  return out.kind === 'created'
    ? `Gesichert: ${entryDate(out.backup)}.`
    : `Keine Änderungen seit der Sicherung vom ${entryDate(out.backup)} – sie ist aktuell.`;
}

// Vorschau: Der Hauptprozess prüft die Sicherung dabei vollständig
export async function previewBackup(
  id: string,
): Promise<{ kind: 'ready'; preview: BackupPreview } | Failure> {
  const res = await window.lernjournal.backup.preview({ id }).catch(() => null);
  if (!res || !res.ok)
    return { kind: 'error', message: errorText(res, 'Die Sicherung konnte nicht geprüft werden.') };
  return { kind: 'ready', preview: res.data };
}

// Anderer Ordner für «als neues Lernjournal»; null = abgebrochen (alte Wahl bleibt)
export async function chooseRestoreTarget(
  id: string,
): Promise<{ target: string | null } | { error: string }> {
  const res = await window.lernjournal.backup.chooseRestoreTarget({ id }).catch(() => null);
  if (!res || !res.ok) return { error: errorText(res, 'Der Ordner kann nicht verwendet werden.') };
  return { target: res.data.target };
}

export type RestoreOutcome = {
  kind: 'restored';
  mode: RestoreMode;
  project: ProjectInfo;
  journals: number;
  media: number;
  warnings: string[];
  safetyBackup: BackupEntry | null;
};

export async function restoreBackup(
  id: string,
  mode: RestoreMode,
  saveFirst: () => Promise<boolean>,
): Promise<RestoreOutcome | Failure> {
  if (!(await saveFirst().catch(() => false))) return { kind: 'error', message: NOT_SAVED };
  const res = await window.lernjournal.backup.restore({ id, mode }).catch(() => null);
  if (!res || !res.ok)
    return { kind: 'error', message: errorText(res, 'Die Sicherung konnte nicht wiederhergestellt werden.') };
  const d = res.data;
  return {
    kind: 'restored',
    mode: d.mode,
    project: d.project,
    journals: d.journals,
    media: d.media,
    warnings: d.warnings,
    safetyBackup: d.safetyBackup,
  };
}

// «Später erinnern»: bis wann ausgeblendet (null = hat nicht geklappt)
export async function snoozeExportReminder(): Promise<string | null> {
  const res = await window.lernjournal.project.snoozeExportReminder().catch(() => null);
  return res?.ok ? res.data.exportReminderUntil : null;
}

// Vergleich in der Vorschau: «12 Journale (jetzt: 14)»
export function compareLine(n: number, now: number, one: string, many: string): string {
  return n === now ? plural(n, one, many) : `${plural(n, one, many)} (jetzt: ${now})`;
}

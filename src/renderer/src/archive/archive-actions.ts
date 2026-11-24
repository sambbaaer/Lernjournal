// Projektübergabe .ajournal aus Sicht der Oberfläche (AJ-14). Reine
// Ablauf-Logik ohne React, damit sie mit Vitest prüfbar ist
// (window.lernjournal wird im Test ersetzt).
//
// Die Oberfläche schickt nie Pfade: Datei und Ordner wählt der Hauptprozess
// in seinen eigenen Dialogen. Hier wird nur vorher gespeichert, aufgerufen
// und das Ergebnis in Texte für Lernende übersetzt.
import type { ArchiveSummary } from '@shared/archive';
import { formatFileSize } from '@shared/export';
import type { IpcResult, ProjectInfo } from '@shared/ipc';
import { formatDateTime } from '../project/messages';

export type ArchiveExportOutcome =
  | {
      kind: 'saved';
      fileName: string;
      size: string;
      journals: number;
      media: number;
      warnings: string[];
      // Neuer Zeitpunkt der letzten Übergabe (Erinnerung, AJ-15)
      lastExportAt: string | null;
    }
  | { kind: 'canceled' }
  | { kind: 'error'; message: string };

export type ArchivePreviewOutcome =
  | { kind: 'ready'; fileName: string; summary: ArchiveSummary; target: string }
  | { kind: 'canceled' }
  | { kind: 'error'; message: string };

export type ArchiveImportOutcome =
  | { kind: 'imported'; project: ProjectInfo; journals: number; media: number; warnings: string[] }
  | { kind: 'error'; message: string };

export const NOT_SAVED =
  'Die letzten Änderungen sind noch nicht gespeichert. Bitte zuerst speichern (Strg+S).';

// Meldungen des Archivdienstes (Code INVALID_REQUEST, für Lernende
// formuliert) werden gezeigt, interne Fehler nur allgemein
export function errorText(res: IpcResult<unknown> | null, fallback: string): string {
  if (res && !res.ok && res.error.code === 'INVALID_REQUEST' && res.error.message !== 'Ungültige Daten')
    return res.error.message;
  return fallback;
}

// «3 Journale», «1 Bild» …
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// Eine Zeile zur Vorschau: «3 Journale · 2 Bilder · 1,2 MB»
export function contentLine(s: { journals: number; media: number; bytes?: number }): string {
  return [
    plural(s.journals, 'Journal', 'Journale'),
    plural(s.media, 'Bild', 'Bilder'),
    ...(s.bytes !== undefined ? [formatFileSize(s.bytes)] : []),
  ].join(' · ');
}

// «exportiert am 24.11.2026, 09:30 mit Lernjournal 0.1.0»
export function originLine(s: ArchiveSummary): string {
  return `exportiert am ${formatDateTime(s.createdAt)} mit Lernjournal ${s.appVersion}`;
}

// Ganzes Projekt als .ajournal speichern. saveFirst: Ausstehendes im offenen
// Journal speichern – sonst fehlte eben Getipptes in der Übergabe.
export async function exportArchive(saveFirst: () => Promise<boolean>): Promise<ArchiveExportOutcome> {
  if (!(await saveFirst().catch(() => false))) return { kind: 'error', message: NOT_SAVED };
  const res = await window.lernjournal.archive.export().catch(() => null);
  if (!res || !res.ok)
    return { kind: 'error', message: errorText(res, 'Die .ajournal-Datei konnte nicht erstellt werden.') };
  if (res.data.status === 'canceled') return { kind: 'canceled' };
  return {
    kind: 'saved',
    fileName: res.data.fileName,
    size: formatFileSize(res.data.bytes),
    journals: res.data.journals,
    media: res.data.media,
    warnings: res.data.warnings,
    lastExportAt: res.data.lastExportAt ?? null,
  };
}

// Import Schritt 1: Datei wählen und prüfen lassen
export async function chooseArchive(): Promise<ArchivePreviewOutcome> {
  const res = await window.lernjournal.archive.chooseImport().catch(() => null);
  if (!res || !res.ok)
    return { kind: 'error', message: errorText(res, 'Die Datei konnte nicht geprüft werden.') };
  if (res.data.status === 'canceled') return { kind: 'canceled' };
  return { kind: 'ready', fileName: res.data.fileName, summary: res.data.summary, target: res.data.target };
}

// Import optional: anderen Zielordner wählen. null = abgebrochen (alte Wahl bleibt)
export async function chooseArchiveTarget(): Promise<{ target: string | null } | { error: string }> {
  const res = await window.lernjournal.archive.chooseImportTarget().catch(() => null);
  if (!res || !res.ok) return { error: errorText(res, 'Der Ordner kann nicht verwendet werden.') };
  return { target: res.data.target };
}

// Import Schritt 2: Vorher speichern, denn danach ist das neue Projekt offen
export async function importArchive(saveFirst: () => Promise<boolean>): Promise<ArchiveImportOutcome> {
  if (!(await saveFirst().catch(() => false))) return { kind: 'error', message: NOT_SAVED };
  const res = await window.lernjournal.archive.import().catch(() => null);
  if (!res || !res.ok)
    return { kind: 'error', message: errorText(res, 'Das Projekt konnte nicht importiert werden.') };
  return {
    kind: 'imported',
    project: res.data.project,
    journals: res.data.journals,
    media: res.data.media,
    warnings: res.data.warnings,
  };
}

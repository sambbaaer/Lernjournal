// Word-Export aus Sicht der Oberfläche (AJ-12 Einzel-, AJ-13 Sammel-DOCX):
// Ausstehendes speichern, dann den Hauptprozess exportieren lassen. Reine Ablauf-Logik ohne React, damit sie
// mit Vitest prüfbar ist (window.lernjournal wird im Test ersetzt).
import { formatFileSize, type ExportResult } from '@shared/export';
import type { IpcResult } from '@shared/ipc';

export type ExportOutcome =
  | { kind: 'saved'; fileName: string; size: string; warnings: string[] }
  | { kind: 'canceled' }
  | { kind: 'error'; message: string };

// Nur Meldungen aus dem Exportdienst (Code INVALID_REQUEST, für Lernende
// formuliert) werden gezeigt, sonst eine allgemeine Meldung.
export function outcomeOf(res: IpcResult<ExportResult> | null): ExportOutcome {
  if (!res) return { kind: 'error', message: 'Der Export konnte nicht gestartet werden.' };
  if (!res.ok) {
    const fromService = res.error.code === 'INVALID_REQUEST' && res.error.message !== 'Ungültige Daten';
    return {
      kind: 'error',
      message: fromService ? res.error.message : 'Das Word-Dokument konnte nicht erstellt werden.',
    };
  }
  if (res.data.status === 'canceled') return { kind: 'canceled' };
  return {
    kind: 'saved',
    fileName: res.data.fileName,
    size: formatFileSize(res.data.bytes),
    warnings: res.data.warnings,
  };
}

// Gemeinsamer Ablauf: saveFirst = Ausstehendes im offenen Journal speichern,
// sonst fehlten eben getippte Sätze im Dokument; erst dann exportieren.
async function runExport(
  saveFirst: () => Promise<boolean>,
  call: () => Promise<IpcResult<ExportResult>>,
): Promise<ExportOutcome> {
  const saved = await saveFirst().catch(() => false);
  if (!saved) {
    return {
      kind: 'error',
      message: 'Die letzten Änderungen sind noch nicht gespeichert. Bitte zuerst speichern (Strg+S).',
    };
  }
  return outcomeOf(await call().catch(() => null));
}

// Ein Journal exportieren (Einzel-DOCX)
export function exportJournalDocx(
  journalId: string,
  saveFirst: () => Promise<boolean>,
): Promise<ExportOutcome> {
  return runExport(saveFirst, () =>
    window.lernjournal.export.journalDocx({ id: journalId, noticeAccepted: true }),
  );
}

// Mehrere Journale in einem Dokument (Sammel-DOCX). ids = Reihenfolge im Dokument.
export function exportCollectionDocx(
  ids: string[],
  title: string,
  saveFirst: () => Promise<boolean>,
): Promise<ExportOutcome> {
  return runExport(saveFirst, () =>
    window.lernjournal.export.collectionDocx({ ids, title, noticeAccepted: true }),
  );
}

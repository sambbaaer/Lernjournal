// Sicherungen in der Oberfläche (AJ-15): zuerst speichern, dann den
// Hauptprozess arbeiten lassen; nur IDs, nie Pfade; Texte für Lernende;
// Zustandswechsel im Reducer. window.lernjournal wird ersetzt.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupEntry } from '@shared/backup';
import type { ProjectInfo } from '@shared/ipc';
import { initialState, reducer } from '../state/app-state';
import {
  backupNow,
  backupNowNotice,
  chooseRestoreTarget,
  compareLine,
  entryContent,
  previewBackup,
  reasonLabel,
  restoreBackup,
  snoozeExportReminder,
} from './backup-actions';

function bridge(api: Record<string, unknown>) {
  vi.stubGlobal('window', { lernjournal: api });
}
afterEach(() => vi.unstubAllGlobals());

const ENTRY: BackupEntry = {
  id: 'sicherung-2026-11-24T08-30-00-000Z',
  createdAt: '2026-11-24T08:30:00.000Z',
  reason: 'schliessen',
  journals: 3,
  media: 1,
  bytes: 1_250_000,
  damaged: false,
};
const PROJECT = { id: 'p', title: 'Lehre', path: 'C:\\Lehre' } as ProjectInfo;
const ok = <T>(data: T) => ({ ok: true, data });

describe('Texte', () => {
  it('Anlass, Inhalt und Vergleich mit dem aktuellen Stand', () => {
    expect(reasonLabel(ENTRY)).toBe('Beim Schliessen');
    expect(reasonLabel({ reason: null, damaged: true })).toBe('Beschädigt');
    expect(entryContent(ENTRY)).toBe('3 Journale · 1 Bild · 1,2 MB');
    expect(entryContent({ ...ENTRY, damaged: true, journals: null, media: null })).toBe(
      'nicht lesbar · 1,2 MB',
    );
    expect(compareLine(12, 14, 'Journal', 'Journale')).toBe('12 Journale (jetzt: 14)');
    expect(compareLine(1, 1, 'Bild', 'Bilder')).toBe('1 Bild');
    expect(backupNowNotice({ kind: 'unchanged', backup: ENTRY })).toMatch(
      /^Keine Änderungen seit der Sicherung vom/,
    );
    expect(backupNowNotice({ kind: 'created', backup: ENTRY })).toMatch(/^Gesichert: /);
  });
});

describe('Jetzt sichern', () => {
  it('speichert zuerst, dann sichert der Hauptprozess (ohne Pfad)', async () => {
    const order: string[] = [];
    const create = vi.fn(async () => {
      order.push('create');
      return ok({ status: 'created', backup: ENTRY });
    });
    bridge({ backup: { create } });
    const out = await backupNow(async () => {
      order.push('save');
      return true;
    });
    expect(order).toEqual(['save', 'create']);
    expect(create).toHaveBeenCalledWith();
    expect(out).toEqual({ kind: 'created', backup: ENTRY });
  });

  it('nicht gespeichert → keine Sicherung; Fehler des Hauptprozesses verständlich', async () => {
    const create = vi.fn();
    bridge({ backup: { create } });
    expect(await backupNow(async () => false)).toMatchObject({
      kind: 'error',
      message: /noch nicht gespeichert/,
    });
    expect(create).not.toHaveBeenCalled();
    bridge({
      backup: {
        create: async () => ({
          ok: false,
          error: { code: 'INVALID_REQUEST', message: 'Nicht genug Speicherplatz.' },
        }),
      },
    });
    expect(await backupNow(async () => true)).toEqual({
      kind: 'error',
      message: 'Nicht genug Speicherplatz.',
    });
    bridge({
      backup: { create: async () => ({ ok: false, error: { code: 'INTERNAL', message: 'Stack …' } }) },
    });
    expect(await backupNow(async () => true)).toEqual({
      kind: 'error',
      message: 'Die Sicherung konnte nicht erstellt werden.',
    });
  });
});

describe('Wiederherstellen', () => {
  it('Vorschau und anderer Ordner schicken nur die ID', async () => {
    const preview = vi.fn(async () =>
      ok({ id: ENTRY.id, target: 'C:\\Dokumente\\Lehre (Stand 2026-11-24)' }),
    );
    const chooseRestoreTarget_ = vi.fn(async () => ok({ target: null }));
    bridge({ backup: { preview, chooseRestoreTarget: chooseRestoreTarget_ } });
    expect(await previewBackup(ENTRY.id)).toMatchObject({ kind: 'ready', preview: { id: ENTRY.id } });
    expect(preview).toHaveBeenCalledWith({ id: ENTRY.id });
    expect(await chooseRestoreTarget(ENTRY.id)).toEqual({ target: null });
    expect(chooseRestoreTarget_).toHaveBeenCalledWith({ id: ENTRY.id });
  });

  it('speichert vor dem Wiederherstellen; Ergebnis mit Sicherheitskopie', async () => {
    const order: string[] = [];
    const restore = vi.fn(async () => {
      order.push('restore');
      return ok({
        status: 'restored',
        mode: 'replace',
        project: PROJECT,
        journals: 3,
        media: 1,
        warnings: [],
        safetyBackup: ENTRY,
      });
    });
    bridge({ backup: { restore } });
    const out = await restoreBackup(ENTRY.id, 'replace', async () => {
      order.push('save');
      return true;
    });
    expect(order).toEqual(['save', 'restore']);
    expect(restore).toHaveBeenCalledWith({ id: ENTRY.id, mode: 'replace' });
    expect(out).toMatchObject({ kind: 'restored', mode: 'replace', safetyBackup: ENTRY });
    // Nicht gespeichert → nichts ersetzt
    restore.mockClear();
    expect(await restoreBackup(ENTRY.id, 'replace', async () => false)).toMatchObject({ kind: 'error' });
    expect(restore).not.toHaveBeenCalled();
  });

  it('beschädigte Sicherung: Meldung des Hauptprozesses erscheint', async () => {
    bridge({
      backup: {
        preview: async () => ({
          ok: false,
          error: { code: 'INVALID_REQUEST', message: 'Diese Sicherung ist beschädigt …' },
        }),
      },
    });
    expect(await previewBackup(ENTRY.id)).toEqual({
      kind: 'error',
      message: 'Diese Sicherung ist beschädigt …',
    });
  });

  it('«Später erinnern» liefert den Zeitpunkt oder null', async () => {
    bridge({
      project: { snoozeExportReminder: async () => ok({ exportReminderUntil: '2026-12-01T08:30:00.000Z' }) },
    });
    expect(await snoozeExportReminder()).toBe('2026-12-01T08:30:00.000Z');
    bridge({ project: { snoozeExportReminder: async () => Promise.reject(new Error('weg')) } });
    expect(await snoozeExportReminder()).toBeNull();
  });
});

describe('Zustand', () => {
  it('Dialog öffnen/schliessen; nur ein Dialog zugleich', () => {
    let s = reducer(initialState, { type: 'openArchive', mode: 'export' });
    s = reducer(s, { type: 'openRestore', backupId: ENTRY.id });
    expect(s).toMatchObject({ restoreDialog: { backupId: ENTRY.id }, archiveDialog: null, backstage: null });
    s = reducer(s, { type: 'closeRestore' });
    expect(s.restoreDialog).toBeNull();
  });

  it('erneutes Öffnen desselben Projekts erhöht projectEpoch (Journale werden neu geladen); Dialog bleibt', () => {
    let s = reducer(initialState, { type: 'projectOpened', project: PROJECT });
    s = reducer(s, { type: 'openRestore', backupId: ENTRY.id });
    const epoch = s.projectEpoch;
    s = reducer(s, { type: 'projectOpened', project: PROJECT });
    expect(s.projectEpoch).toBe(epoch + 1);
    expect(s.restoreDialog).toEqual({ backupId: ENTRY.id });
  });

  it('Übergabe und «Später erinnern» werden im Projekt nachgeführt', () => {
    let s = reducer(initialState, {
      type: 'projectOpened',
      project: { ...PROJECT, lastExportAt: null, exportReminderUntil: '2026-12-01T00:00:00.000Z' },
    });
    s = reducer(s, { type: 'exportRecorded', lastExportAt: '2026-11-24T08:30:00.000Z' });
    expect(s.project).toMatchObject({ lastExportAt: '2026-11-24T08:30:00.000Z', exportReminderUntil: null });
    s = reducer(s, { type: 'exportReminderSnoozed', until: '2026-12-01T08:30:00.000Z' });
    expect(s.project?.exportReminderUntil).toBe('2026-12-01T08:30:00.000Z');
    // Ohne Projekt passiert nichts
    expect(reducer(initialState, { type: 'exportRecorded', lastExportAt: 'x' }).project).toBeNull();
  });
});

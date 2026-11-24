// Ablauf der Projektübergabe in der Oberfläche (AJ-14): zuerst speichern,
// dann den Hauptprozess arbeiten lassen; Meldungen für Lernende.
// window.lernjournal wird ersetzt.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chooseArchive,
  chooseArchiveTarget,
  contentLine,
  exportArchive,
  importArchive,
  originLine,
} from './archive-actions';

function bridge(archive: Record<string, unknown>) {
  vi.stubGlobal('window', { lernjournal: { archive } });
}
afterEach(() => vi.unstubAllGlobals());

const SUMMARY = {
  title: 'Lehre',
  journals: 3,
  media: 1,
  createdAt: '2026-11-24T08:30:00.000Z',
  appVersion: '0.1.0',
  archiveBytes: 2_500_000,
  unpackedBytes: 3_000_000,
};

describe('Projekt übergeben (.ajournal)', () => {
  it('speichert zuerst, dann exportiert der Hauptprozess', async () => {
    const order: string[] = [];
    const exp = vi.fn(async () => {
      order.push('export');
      return {
        ok: true,
        data: {
          status: 'saved',
          fileName: 'a.ajournal',
          bytes: 2_500_000,
          journals: 3,
          media: 1,
          warnings: [],
        },
      };
    });
    bridge({ export: exp });
    const out = await exportArchive(async () => {
      order.push('save');
      return true;
    });
    expect(order).toEqual(['save', 'export']);
    expect(exp).toHaveBeenCalledWith(); // ohne Pfad
    expect(out).toEqual({
      kind: 'saved',
      fileName: 'a.ajournal',
      size: '2,4 MB',
      journals: 3,
      media: 1,
      warnings: [],
    });
  });

  it('exportiert nicht, wenn Ausstehendes nicht gespeichert werden konnte', async () => {
    const exp = vi.fn();
    bridge({ export: exp });
    expect((await exportArchive(async () => false)).kind).toBe('error');
    expect(exp).not.toHaveBeenCalled();
  });

  it('Abbrechen, Meldung des Dienstes, interner Fehler', async () => {
    bridge({ export: async () => ({ ok: true, data: { status: 'canceled' } }) });
    expect(await exportArchive(async () => true)).toEqual({ kind: 'canceled' });
    bridge({
      export: async () => ({ ok: false, error: { code: 'INVALID_REQUEST', message: 'USB-Stick voll?' } }),
    });
    expect(await exportArchive(async () => true)).toEqual({ kind: 'error', message: 'USB-Stick voll?' });
    bridge({ export: async () => ({ ok: false, error: { code: 'INTERNAL', message: 'Interner Fehler' } }) });
    expect(await exportArchive(async () => true)).toEqual({
      kind: 'error',
      message: 'Die .ajournal-Datei konnte nicht erstellt werden.',
    });
    bridge({ export: async () => Promise.reject(new Error('weg')) });
    expect((await exportArchive(async () => true)).kind).toBe('error');
  });
});

describe('Projekt importieren (.ajournal)', () => {
  it('Vorschau, anderer Zielordner, Import', async () => {
    const project = { id: 'p', title: 'Lehre', path: 'C:\\Users\\Lea\\Documents\\Lehre' };
    bridge({
      chooseImport: async () => ({
        ok: true,
        data: {
          status: 'ready',
          fileName: 'a.ajournal',
          summary: SUMMARY,
          target: 'C:\\Users\\Lea\\Documents\\Lehre',
        },
      }),
      chooseImportTarget: async () => ({ ok: true, data: { target: 'D:\\Lehre' } }),
      import: async () => ({
        ok: true,
        data: { status: 'imported', project, journals: 3, media: 1, warnings: [] },
      }),
    });
    expect(await chooseArchive()).toMatchObject({ kind: 'ready', summary: { title: 'Lehre' } });
    expect(await chooseArchiveTarget()).toEqual({ target: 'D:\\Lehre' });
    const save = vi.fn(async () => true);
    expect(await importArchive(save)).toMatchObject({ kind: 'imported', project, journals: 3 });
    expect(save).toHaveBeenCalled();
  });

  it('Meldungen bei abgelehnten Dateien kommen unverändert an', async () => {
    const message =
      'Die Datei enthält einen unsicheren Pfad («../x»: Pfad-Traversal («..»)) und wird nicht importiert.';
    bridge({
      chooseImport: async () => ({ ok: false, error: { code: 'INVALID_REQUEST', message } }),
      import: async () => ({ ok: false, error: { code: 'INTERNAL', message: 'Interner Fehler' } }),
      chooseImportTarget: async () => ({
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Das ist kein Ordner.' },
      }),
    });
    expect(await chooseArchive()).toEqual({ kind: 'error', message });
    expect(await chooseArchiveTarget()).toEqual({ error: 'Das ist kein Ordner.' });
    expect(await importArchive(async () => true)).toEqual({
      kind: 'error',
      message: 'Das Projekt konnte nicht importiert werden.',
    });
  });

  it('Texte der Vorschau', () => {
    expect(contentLine({ journals: 1, media: 0 })).toBe('1 Journal · 0 Bilder');
    expect(contentLine({ journals: 3, media: 1, bytes: 2_500_000 })).toBe('3 Journale · 1 Bild · 2,4 MB');
    expect(originLine(SUMMARY)).toMatch(/^exportiert am .*2026.* mit Lernjournal 0\.1\.0$/);
  });
});

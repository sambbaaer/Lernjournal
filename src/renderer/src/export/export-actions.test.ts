// Ablauf des Word-Exports in der Oberfläche (AJ-12): zuerst speichern, dann
// exportieren; Meldungen für Lernende. window.lernjournal wird ersetzt.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportJournalDocx, outcomeOf } from './export-actions';

const ID = '3f2a9c1e-6b7d-4e21-9a4f-0c5d8e7b1a23';

function fakeBridge(result: unknown) {
  const journalDocx = vi.fn(async () => result);
  vi.stubGlobal('window', { lernjournal: { export: { journalDocx } } });
  return journalDocx;
}
afterEach(() => vi.unstubAllGlobals());

describe('Word-Export aus der Oberfläche', () => {
  it('speichert zuerst und bestätigt den Exporthinweis', async () => {
    const calls: string[] = [];
    const bridge = fakeBridge({
      ok: true,
      data: { status: 'saved', fileName: 'a.docx', bytes: 48 * 1024, warnings: [] },
    });
    const out = await exportJournalDocx(ID, async () => {
      calls.push('save');
      return true;
    });
    expect(calls).toEqual(['save']);
    expect(bridge).toHaveBeenCalledWith({ id: ID, noticeAccepted: true });
    expect(out).toEqual({ kind: 'saved', fileName: 'a.docx', size: '48 KB', warnings: [] });
  });

  it('exportiert nicht, wenn Ausstehendes nicht gespeichert werden konnte', async () => {
    const bridge = fakeBridge({ ok: true, data: { status: 'canceled' } });
    const out = await exportJournalDocx(ID, async () => false);
    expect(bridge).not.toHaveBeenCalled();
    expect(out.kind).toBe('error');
  });

  it('Abbrechen und Fehler', () => {
    expect(outcomeOf({ ok: true, data: { status: 'canceled' } })).toEqual({ kind: 'canceled' });
    // Meldung des Exportdienstes (für Lernende formuliert) wird gezeigt …
    expect(
      outcomeOf({
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Ist die Datei noch in Word geöffnet?' },
      }),
    ).toEqual({ kind: 'error', message: 'Ist die Datei noch in Word geöffnet?' });
    // … interne Fehler nicht
    expect(outcomeOf({ ok: false, error: { code: 'INTERNAL', message: 'Interner Fehler' } })).toEqual({
      kind: 'error',
      message: 'Das Word-Dokument konnte nicht erstellt werden.',
    });
    expect(outcomeOf(null).kind).toBe('error');
  });
});

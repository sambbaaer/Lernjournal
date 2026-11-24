// Erinnerung an die Projektübergabe (AJ-15): Grenzfälle der 30-Tage-Regel,
// nie übergeben, «Später erinnern», verstellte Uhr. Reine Logik (Vitest).
import { describe, expect, it } from 'vitest';
import {
  EXPORT_REMINDER,
  exportReminder,
  exportReminderText,
  JOURNAL_REMINDER,
  journalReminder,
  journalReminderText,
  type ExportReminderInput,
  type JournalReminderInput,
} from './backup';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-24T08:30:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const base: ExportReminderInput = {
  lastExportAt: null,
  snoozedUntil: null,
  projectCreatedAt: ago(100 * DAY),
  journalCount: 5,
  now: NOW,
};
const check = (over: Partial<ExportReminderInput>) => exportReminder({ ...base, ...over });

describe('exportReminder', () => {
  it('Frist ist eine benannte Konstante (30 Tage, SPEC)', () => {
    expect(EXPORT_REMINDER.afterDays).toBe(30);
  });

  it('genau 30 Tage nach der letzten Übergabe fällig, eine Millisekunde vorher nicht', () => {
    expect(check({ lastExportAt: ago(30 * DAY) })).toEqual({ due: true, kind: 'overdue', days: 30 });
    expect(check({ lastExportAt: ago(30 * DAY - 1) })).toEqual({ due: false });
    expect(check({ lastExportAt: ago(45 * DAY + 5000) })).toEqual({ due: true, kind: 'overdue', days: 45 });
    expect(check({ lastExportAt: ago(0) })).toEqual({ due: false });
  });

  it('nie übergeben: gezählt ab Erstellung des Projekts', () => {
    expect(check({ projectCreatedAt: ago(29 * DAY) })).toEqual({ due: false });
    expect(check({ projectCreatedAt: ago(30 * DAY) })).toEqual({ due: true, kind: 'never', days: 30 });
  });

  it('ohne Journale keine Erinnerung (nichts zu sichern)', () => {
    expect(check({ journalCount: 0 })).toEqual({ due: false });
  });

  it('«Später erinnern» wirkt bis zum gespeicherten Zeitpunkt', () => {
    const lastExportAt = ago(40 * DAY);
    const until = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
    expect(check({ lastExportAt, snoozedUntil: until(3 * DAY) })).toEqual({ due: false });
    expect(check({ lastExportAt, snoozedUntil: until(0) })).toMatchObject({ due: true }); // abgelaufen
    expect(check({ lastExportAt, snoozedUntil: ago(1) })).toMatchObject({ due: true });
    expect(check({ lastExportAt, snoozedUntil: until(EXPORT_REMINDER.snoozeDays * DAY) })).toEqual({
      due: false,
    });
  });

  it('Uhr verstellt: Übergabe «in der Zukunft» zählt nicht, Erinnerung erscheint', () => {
    const future = new Date(NOW.getTime() + 2 * DAY).toISOString();
    expect(check({ lastExportAt: future })).toEqual({ due: true, kind: 'clock', days: null });
    // kleine Abweichung (Zeitabgleich) ist kein Problem
    expect(check({ lastExportAt: new Date(NOW.getTime() + 60_000).toISOString() })).toEqual({ due: false });
    // Projekt «aus der Zukunft», nie übergeben
    expect(check({ projectCreatedAt: future })).toEqual({ due: true, kind: 'clock', days: null });
  });

  it('Uhr verstellt: unplausibles «Später erinnern» (weit in der Zukunft) wird ignoriert', () => {
    const lastExportAt = ago(40 * DAY);
    const farFuture = new Date(NOW.getTime() + 365 * DAY).toISOString();
    expect(check({ lastExportAt, snoozedUntil: farFuture })).toMatchObject({ due: true, kind: 'overdue' });
  });

  it('unlesbare Zeitpunkte gelten als unbekannt', () => {
    expect(check({ lastExportAt: 'gestern' })).toMatchObject({ due: true, kind: 'never' });
    expect(check({ lastExportAt: null, projectCreatedAt: 'kaputt' })).toEqual({
      due: true,
      kind: 'never',
      days: null,
    });
  });
});

describe('exportReminderText', () => {
  it('Schweizer Hochdeutsch, nennt das Alter und den Grund', () => {
    const texts = [
      exportReminderText({ due: true, kind: 'never', days: 40 }),
      exportReminderText({ due: true, kind: 'overdue', days: 45 }),
      exportReminderText({ due: true, kind: 'clock', days: null }),
    ];
    expect(texts[1]).toContain('45 Tage alt');
    expect(texts[0]).toContain('noch keine Kopie');
    for (const t of texts) {
      expect(t).not.toMatch(/ß/);
      expect(t).toContain('USB-Stick');
    }
  });
});

describe('journalReminder', () => {
  const jBase: JournalReminderInput = {
    enabled: true,
    intervalDays: JOURNAL_REMINDER.defaultDays,
    lastJournalAt: ago(30 * DAY),
    projectCreatedAt: ago(100 * DAY),
    snoozedUntil: null,
    now: NOW,
  };
  const jCheck = (over: Partial<JournalReminderInput>) => journalReminder({ ...jBase, ...over });

  it('ist nur aktiv, wenn Opt-in gewählt wurde, und nutzt standardmässig 30 Tage', () => {
    expect(JOURNAL_REMINDER.defaultDays).toBe(30);
    expect(jCheck({ enabled: false })).toEqual({ due: false });
    expect(jCheck({ lastJournalAt: ago(29 * DAY) })).toEqual({ due: false });
    expect(jCheck({ lastJournalAt: ago(30 * DAY) })).toEqual({ due: true, kind: 'overdue', days: 30 });
  });

  it('berücksichtigt ein frei konfigurierbares Intervall und «Nicht jetzt» (Snooze)', () => {
    expect(jCheck({ intervalDays: 14, lastJournalAt: ago(14 * DAY) })).toEqual({
      due: true,
      kind: 'overdue',
      days: 14,
    });
    const until = new Date(NOW.getTime() + 3 * DAY).toISOString();
    expect(jCheck({ snoozedUntil: until })).toEqual({ due: false });
  });

  it('erinnert ohne Journale ab Projekterstellung und formuliert auf Schweizer Hochdeutsch', () => {
    const r = jCheck({ lastJournalAt: null, projectCreatedAt: ago(35 * DAY) });
    expect(r).toEqual({ due: true, kind: 'first', days: 35 });
    if (r.due) {
      expect(journalReminderText(r)).toContain('35 Tagen');
      expect(journalReminderText(r)).not.toMatch(/ß/);
    }
  });
});

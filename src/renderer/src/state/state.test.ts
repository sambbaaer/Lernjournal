import { describe, expect, it } from 'vitest';
import type { ProjectInfo } from '@shared/ipc';
import type { JournalDetail, JournalSummary } from '@shared/journal';
import { initialState, journalCounts, reducer } from './app-state';
import { commands } from './commands';
import { nextRegion } from './regions';
import { formatShortcut, matchesShortcut, parseShortcut } from './shortcuts';

const key = (k: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
  key: k,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe('Tastenkürzel', () => {
  it('erkennt Kürzel exakt (keine zusätzlichen Modifikatoren)', () => {
    expect(matchesShortcut(key('n', { ctrl: true }), 'Ctrl+N')).toBe(true);
    expect(matchesShortcut(key('N', { ctrl: true }), 'Ctrl+N')).toBe(true);
    expect(matchesShortcut(key('n', { ctrl: true, shift: true }), 'Ctrl+N')).toBe(false);
    expect(matchesShortcut(key('F', { ctrl: true, shift: true }), 'Ctrl+Shift+F')).toBe(true);
    expect(matchesShortcut(key('F6'), 'F6')).toBe(true);
    expect(matchesShortcut(key('F6', { shift: true }), 'F6')).toBe(false);
  });
  it('formatiert für deutsche Tastaturen', () => {
    expect(formatShortcut('Ctrl+Shift+F')).toBe('Strg+Umschalt+F');
    expect(formatShortcut('Alt+D')).toBe('Alt+D');
    expect(formatShortcut('F6')).toBe('F6');
  });
  it('meldet Tippfehler in Kürzeln sofort', () => {
    expect(() => parseShortcut('Strg+N')).toThrow();
  });
  it('alle Befehle haben gültige, eindeutige Kürzel', () => {
    const list = Object.values(commands).flatMap((c) => (c.shortcut ? [c.shortcut] : []));
    list.forEach((s) => parseShortcut(s));
    const norm = list.map((s) => JSON.stringify(parseShortcut(s)));
    expect(new Set(norm).size).toBe(norm.length);
  });
});

describe('F6-Bereiche', () => {
  it('springt vorwärts und rückwärts im Kreis', () => {
    expect(nextRegion(null, false)).toBe('ribbon');
    expect(nextRegion('ribbon', false)).toBe('navigation');
    expect(nextRegion('statusbar', false)).toBe('ribbon');
    expect(nextRegion('ribbon', true)).toBe('statusbar');
  });
  it('überspringt nicht vorhandene Bereiche (z. B. Datei-Menü offen)', () => {
    expect(nextRegion('ribbon', false, ['ribbon', 'document'])).toBe('document');
  });
});

describe('Zustand', () => {
  it('Navigation schliesst das Datei-Menü und löscht Hinweise', () => {
    const s = reducer(
      { ...initialState, backstage: 'info', notice: 'x' },
      { type: 'navigate', view: 'fachbuch' },
    );
    expect(s).toMatchObject({ view: 'fachbuch', backstage: null, notice: null });
  });
  it('Strg+Umschalt+F öffnet das Fachbuch und fordert den Fokus aufs Suchfeld an', () => {
    let s = initialState;
    commands['fachbuch.search'].run(s, (a) => (s = reducer(s, a)));
    expect(s.view).toBe('fachbuch');
    expect(s.focusRequest).toBe('fachbuch-search');
  });
  it('Speichern ohne Änderungen behauptet nie «Gespeichert»', () => {
    let s = initialState;
    commands['journal.save'].run(s, (a) => (s = reducer(s, a)));
    expect(s.saveStatus.kind).toBe('idle');
    expect(s.notice).toMatch(/Nichts zu speichern/);
  });
  it('Datei-Befehl öffnet und schliesst das Datei-Menü', () => {
    let s = initialState;
    const run = () => commands['file.open'].run(s, (a) => (s = reducer(s, a)));
    run();
    expect(s.backstage).toBe('neu');
    run();
    expect(s.backstage).toBeNull();
  });
});

describe('Anzahl Journale (Einstellungen)', () => {
  const summary = (id: string, status: JournalSummary['status'] = 'draft'): JournalSummary => ({
    id,
    title: id,
    workDate: '2026-11-23',
    status,
    learningPlace: 'betrieb',
    schoolYear: null,
    schoolYearOverride: null,
    updatedAt: '2026-11-23T10:00:00.000Z',
    completedAt: null,
    categoryIds: [],
    tagIds: [],
  });
  // Projekt wurde mit 0 Journalen geöffnet
  const opened = reducer(initialState, {
    type: 'projectOpened',
    project: { journalCount: 0 } as ProjectInfo,
  });

  it('zählt neu angelegte Journale sofort mit (nicht den Wert vom Öffnen)', () => {
    let s = reducer(opened, { type: 'journalsLoaded', journals: [] });
    s = reducer(s, { type: 'journalUpserted', journal: summary('a') });
    s = reducer(s, { type: 'journalUpserted', journal: summary('b') });
    expect(journalCounts(s)).toEqual({ total: 2, archived: 0 });
    s = reducer(s, { type: 'journalRemoved', id: 'a' });
    expect(journalCounts(s).total).toBe(1);
  });
  it('weist archivierte Journale separat aus', () => {
    const s = reducer(opened, {
      type: 'journalsLoaded',
      journals: [summary('a'), summary('b', 'archived')],
    });
    expect(journalCounts(s)).toEqual({ total: 2, archived: 1 });
  });
  it('nutzt vor dem Laden der Liste den Wert aus dem Projekt', () => {
    const s = reducer(initialState, { type: 'projectOpened', project: { journalCount: 5 } as ProjectInfo });
    expect(journalCounts(s).total).toBe(5);
  });
});

describe('Kategorien und Schlagwörter im Zustand', () => {
  const taxonomy = {
    categories: [{ id: 'c', name: 'a – X', source: 'bipla' as const, sortOrder: 0, journalCount: 1 }],
    tags: [{ id: 't', name: 'Falz', journalCount: 1 }],
    missingSuggestions: 6,
  };
  it('werden beim Projektwechsel zurückgesetzt (keine Kategorien eines anderen Projekts)', () => {
    let s = reducer(initialState, { type: 'taxonomyLoaded', taxonomy });
    expect(s.taxonomy).toBe(taxonomy);
    s = reducer(s, { type: 'projectOpened', project: { journalCount: 0 } as ProjectInfo });
    expect(s.taxonomy.categories).toEqual([]);
    s = reducer(s, { type: 'taxonomyLoaded', taxonomy });
    s = reducer(s, { type: 'projectClosed' });
    expect(s.taxonomy.tags).toEqual([]);
  });
  it('Menüband «Kategorien» fordert den Sprung ins Journal an', () => {
    const s = reducer(initialState, { type: 'requestFocus', target: 'journal-categories' });
    expect(s.focusRequest).toBe('journal-categories');
  });
});

describe('Verknüpfungen im Zustand (AJ-10)', () => {
  const journal = (id: string) =>
    ({ id, title: id, sections: {}, categoryIds: [], tagIds: [] }) as unknown as JournalDetail;
  const linked = (id: string) => ({ id, title: id, workDate: '2026-03-14', status: 'draft' as const });
  const links = { linked: [linked('b'), linked('c')], mentionedIn: [linked('c')] };

  it('gehören zum geöffneten Journal; verspätete Antworten für ein anderes werden verworfen', () => {
    let s = reducer(initialState, { type: 'journalOpened', journal: journal('a') });
    s = reducer(s, { type: 'linksLoaded', journalId: 'a', links });
    expect(s.openJournalLinks).toBe(links);
    // Wechsel zu b: Anzeige leer, bis die Verknüpfungen von b geladen sind
    s = reducer(s, { type: 'journalOpened', journal: journal('b') });
    expect(s.openJournalLinks.linked).toEqual([]);
    s = reducer(s, { type: 'linksLoaded', journalId: 'a', links });
    expect(s.openJournalLinks.linked).toEqual([]);
    s = reducer(s, { type: 'journalClosed' });
    expect(s.openJournalLinks.linked).toEqual([]);
  });

  it('gelöschtes Journal verschwindet sofort aus «Verknüpft mit» und «Erwähnt in»', () => {
    let s = reducer(initialState, { type: 'journalOpened', journal: journal('a') });
    s = reducer(s, { type: 'linksLoaded', journalId: 'a', links });
    s = reducer(s, { type: 'journalRemoved', id: 'c' });
    expect(s.openJournalLinks).toEqual({ linked: [linked('b')], mentionedIn: [] });
  });
});

describe('Exportdialog im Zustand (AJ-12)', () => {
  it('öffnet mit den gewählten Journalen, schliesst das Datei-Menü, schliesst wieder', () => {
    let s = reducer(initialState, { type: 'openBackstage', page: 'exportieren' });
    s = reducer(s, { type: 'openExport', journalIds: ['a'] });
    expect(s.exportDialog).toEqual({ journalIds: ['a'] });
    expect(s.backstage).toBeNull();
    s = reducer(s, { type: 'closeExport' });
    expect(s.exportDialog).toBeNull();
  });

  it('ohne Journal kein Dialog; Projektwechsel schliesst ihn', () => {
    expect(reducer(initialState, { type: 'openExport', journalIds: [] }).exportDialog).toBeNull();
    const s = reducer(initialState, { type: 'openExport', journalIds: ['a'] });
    expect(reducer(s, { type: 'projectClosed' }).exportDialog).toBeNull();
  });
});

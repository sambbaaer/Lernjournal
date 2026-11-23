import { describe, expect, it } from 'vitest';
import { initialState, reducer } from './app-state';
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

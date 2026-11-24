import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_WINDOW_BOUNDS,
  isVisibleOnDisplays,
  loadWindowBounds,
  saveWindowBounds,
  type DisplayArea,
} from './window-state';

const screen1080p: DisplayArea[] = [{ x: 0, y: 0, width: 1920, height: 1080 }];

describe('window-state', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'lj-win-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('liefert ohne gespeicherte Datei die Standardgrösse', () => {
    expect(loadWindowBounds(path.join(dir, 'fehlt.json'), screen1080p)).toEqual(DEFAULT_WINDOW_BOUNDS);
  });

  it('speichert und lädt Position, Grösse und Maximiert-Status', () => {
    const file = path.join(dir, 'window-state.json');
    saveWindowBounds(file, { x: 120, y: 80, width: 1440, height: 900, maximized: true });
    expect(loadWindowBounds(file, screen1080p)).toEqual({
      x: 120,
      y: 80,
      width: 1440,
      height: 900,
      maximized: true,
    });
  });

  it('verwirft Positionen auf einem abgesteckten Zweitmonitor, behält aber die Grösse', () => {
    const file = path.join(dir, 'window-state.json');
    saveWindowBounds(file, { x: 2400, y: 100, width: 1280, height: 800, maximized: false });
    expect(isVisibleOnDisplays({ x: 2400, y: 100, width: 1280, height: 800 }, screen1080p)).toBe(false);
    expect(loadWindowBounds(file, screen1080p)).toEqual({
      width: 1280,
      height: 800,
      maximized: false,
    });
  });
});

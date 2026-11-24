// Fenstergrösse, Position und Maximiert-Zustand zwischen Starts merken.
// Speichert nur im eigenen userData-Ordner (Store-MSIX leitet in den Paket-
// Container um, Portable-EXE nutzt %APPDATA%\Lernjournal) und prüft beim
// Laden, dass das gespeicherte Rechteck auf einem aktuell angeschlossenen
// Bildschirm sichtbar ist.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type WindowBounds = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
};

export const DEFAULT_WINDOW_BOUNDS: WindowBounds = {
  width: 1280,
  height: 800,
  maximized: false,
};

const MIN_WIDTH = 760;
const MIN_HEIGHT = 480;

export type DisplayArea = { x: number; y: number; width: number; height: number };

// Liegt mindestens ein 120 × 80 px grosser Teil des Fensters auf einem der
// angeschlossenen Monitore? Verhindert unsichtbare Fenster nach dem Abstecken
// eines externen Bildschirms.
export function isVisibleOnDisplays(
  bounds: { x: number; y: number; width: number; height: number },
  displays: readonly DisplayArea[],
): boolean {
  if (displays.length === 0) return true;
  return displays.some((d) => {
    const overlapX = Math.min(bounds.x + bounds.width, d.x + d.width) - Math.max(bounds.x, d.x);
    const overlapY = Math.min(bounds.y + bounds.height, d.y + d.height) - Math.max(bounds.y, d.y);
    return overlapX >= 120 && overlapY >= 80;
  });
}

export function loadWindowBounds(file: string, displays: readonly DisplayArea[]): WindowBounds {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<WindowBounds>;
    const width =
      typeof raw.width === 'number' && Number.isFinite(raw.width) && raw.width >= MIN_WIDTH
        ? Math.round(raw.width)
        : DEFAULT_WINDOW_BOUNDS.width;
    const height =
      typeof raw.height === 'number' && Number.isFinite(raw.height) && raw.height >= MIN_HEIGHT
        ? Math.round(raw.height)
        : DEFAULT_WINDOW_BOUNDS.height;
    const maximized = Boolean(raw.maximized);
    if (
      typeof raw.x === 'number' &&
      typeof raw.y === 'number' &&
      Number.isFinite(raw.x) &&
      Number.isFinite(raw.y) &&
      isVisibleOnDisplays({ x: raw.x, y: raw.y, width, height }, displays)
    ) {
      return { x: Math.round(raw.x), y: Math.round(raw.y), width, height, maximized };
    }
    return { width, height, maximized };
  } catch {
    return { ...DEFAULT_WINDOW_BOUNDS };
  }
}

export function saveWindowBounds(file: string, bounds: WindowBounds): void {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(bounds), 'utf8');
    renameSync(tmp, file);
  } catch {
    // Unkritisch: beim nächsten Start gelten die Standardmasse
  }
}

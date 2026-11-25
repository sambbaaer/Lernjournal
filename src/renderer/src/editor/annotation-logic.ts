// Bild-Schnellbeschriftung (AJ-32) – reine Logik, ohne Oberfläche testbar.
import type { Annotation, AnnotationColor } from '@shared/annotations';

const clamp = (v: number) => Math.min(1, Math.max(0, v));
// Kleiner als 1 % der Bildgrösse = versehentlicher Klick, keine Form
const MIN_DRAG = 0.01;

// Pfeil oder Kreis aus einer Zieh-Bewegung (relativ 0–1). Pfeil zeigt vom
// Startpunkt zum Endpunkt (Spitze dort, wo man loslässt).
export function shapeFromDrag(
  tool: Annotation['type'],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: AnnotationColor,
): Annotation | null {
  if (Math.hypot(x2 - x1, y2 - y1) < MIN_DRAG) return null;
  if (tool === 'arrow')
    return { type: 'arrow', x1: clamp(x1), y1: clamp(y1), x2: clamp(x2), y2: clamp(y2), color };
  if (tool === 'ellipse') {
    const x = clamp(Math.min(x1, x2));
    const y = clamp(Math.min(y1, y2));
    const w = Math.max(0.01, Math.min(1 - x, Math.abs(x2 - x1)));
    const h = Math.max(0.01, Math.min(1 - y, Math.abs(y2 - y1)));
    return { type: 'ellipse', x, y, w, h, color };
  }
  return null;
}

// Nächste freie Nummer (1, 2, 3 … – Lücken nach dem Löschen werden nicht gefüllt)
export function nextNumber(list: readonly Annotation[]): number {
  const max = Math.max(0, ...list.map((a) => (a.type === 'number' ? a.n : 0)));
  return Math.min(99, max + 1);
}

// Form verschieben, ohne sie aus dem Bild zu schieben
export function moveAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case 'arrow': {
      const minX = Math.min(a.x1, a.x2);
      const maxX = Math.max(a.x1, a.x2);
      const minY = Math.min(a.y1, a.y2);
      const maxY = Math.max(a.y1, a.y2);
      const sx = Math.min(Math.max(dx, -minX), 1 - maxX);
      const sy = Math.min(Math.max(dy, -minY), 1 - maxY);
      return { ...a, x1: a.x1 + sx, x2: a.x2 + sx, y1: a.y1 + sy, y2: a.y2 + sy };
    }
    case 'ellipse':
      return {
        ...a,
        x: Math.min(Math.max(0, a.x + dx), 1 - a.w),
        y: Math.min(Math.max(0, a.y + dy), 1 - a.h),
      };
    default:
      return { ...a, x: clamp(a.x + dx), y: clamp(a.y + dy) };
  }
}

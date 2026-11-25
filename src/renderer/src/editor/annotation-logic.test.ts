// Bild-Schnellbeschriftung (AJ-32)
import { describe, expect, it } from 'vitest';
import { AnnotationsSchema } from '@shared/annotations';
import { moveAnnotation, nextNumber, shapeFromDrag } from './annotation-logic';

describe('Bildbeschriftung', () => {
  it('Pfeil zeigt zum Loslass-Punkt; Kreis aus beliebiger Zieh-Richtung', () => {
    expect(shapeFromDrag('arrow', 0.1, 0.2, 0.5, 0.6, 'rot')).toEqual({
      type: 'arrow',
      x1: 0.1,
      y1: 0.2,
      x2: 0.5,
      y2: 0.6,
      color: 'rot',
    });
    expect(shapeFromDrag('ellipse', 0.6, 0.6, 0.2, 0.3, 'blau')).toMatchObject({ x: 0.2, y: 0.3 });
    expect(shapeFromDrag('arrow', 0.5, 0.5, 0.501, 0.5, 'rot')).toBeNull(); // nur Klick
  });

  it('Nummern zählen weiter, Verschieben bleibt im Bild', () => {
    expect(nextNumber([])).toBe(1);
    expect(nextNumber([{ type: 'number', x: 0, y: 0, n: 4, color: 'rot' }])).toBe(5);
    const moved = moveAnnotation(
      { type: 'ellipse', x: 0.9, y: 0.9, w: 0.2, h: 0.05, color: 'rot' },
      0.5,
      0.5,
    );
    expect(moved).toMatchObject({ x: 0.8, y: 0.95 });
    const arrow = moveAnnotation({ type: 'arrow', x1: 0, y1: 0, x2: 0.5, y2: 0.5, color: 'rot' }, -0.1, 0.1);
    expect(arrow).toMatchObject({ x1: 0, y1: 0.1 });
    expect(AnnotationsSchema.safeParse([moved, arrow]).success).toBe(true);
  });
});

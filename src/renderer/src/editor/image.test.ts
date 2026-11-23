import { describe, expect, it } from 'vitest';
import { targetSize } from './image-processing';

describe('Zielgrösse beim Verkleinern', () => {
  it('begrenzt die längere Kante auf 2400 px und behält das Seitenverhältnis', () => {
    expect(targetSize(3000, 2000)).toEqual({ width: 2400, height: 1600 });
    expect(targetSize(2000, 6000)).toEqual({ width: 800, height: 2400 });
  });
  it('vergrössert nie', () => {
    expect(targetSize(800, 500)).toEqual({ width: 800, height: 500 });
  });
});

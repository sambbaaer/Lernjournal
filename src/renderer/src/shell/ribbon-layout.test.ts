// Menüband immer einzeilig: erst Beschriftungen weg, dann «Weitere Befehle»
import { describe, expect, it } from 'vitest';
import { fitRibbon } from './ribbon-layout';

const full = [200, 150, 300, 250]; // Summe 900
const compact = [80, 60, 120, 100]; // Summe 360

describe('Platzverteilung im Menüband', () => {
  it('genug Platz: alles mit Beschriftung', () => {
    expect(fitRibbon(1000, full, compact, 44)).toEqual({ compactFrom: 4, visible: 4 });
  });
  it('weniger Platz: Gruppen von rechts nur noch mit Symbolen', () => {
    // 900 − 150 (letzte Gruppe kompakt) = 750 passt
    expect(fitRibbon(760, full, compact, 44)).toEqual({ compactFrom: 3, visible: 4 });
    // 900 − 150 − 180 = 570
    expect(fitRibbon(600, full, compact, 44)).toEqual({ compactFrom: 2, visible: 4 });
    expect(fitRibbon(370, full, compact, 44)).toEqual({ compactFrom: 0, visible: 4 });
  });
  it('sehr schmal: Gruppen von rechts in «Weitere Befehle»', () => {
    // 80 + 60 + 44 = 184 passt, mit der dritten Gruppe (304) nicht
    expect(fitRibbon(250, full, compact, 44)).toEqual({ compactFrom: 0, visible: 2 });
  });
  it('mindestens eine Gruppe bleibt sichtbar', () => {
    expect(fitRibbon(50, full, compact, 44)).toEqual({ compactFrom: 0, visible: 1 });
  });
});

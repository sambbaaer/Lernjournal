// Tests der Verteilungsart (AJ-16b)
import { describe, expect, it } from 'vitest';
import { DISTRIBUTION_LABELS, DISTRIBUTIONS } from '@shared/ipc';
import { detectDistribution } from './distribution';

describe('detectDistribution', () => {
  const base = { isPackaged: true, windowsStore: undefined, portableExecutableDir: undefined };

  it('erkennt Store, portable, installiert und Entwicklung', () => {
    expect(detectDistribution({ ...base, windowsStore: true })).toBe('store');
    expect(detectDistribution({ ...base, portableExecutableDir: 'D:\\USB' })).toBe('portable');
    expect(detectDistribution(base)).toBe('installiert');
    expect(detectDistribution({ ...base, windowsStore: false })).toBe('installiert');
    expect(detectDistribution({ ...base, isPackaged: false, windowsStore: true })).toBe('entwicklung');
  });

  it('Store geht vor portable (beides gleichzeitig gibt es nicht, Store ist eindeutiger)', () => {
    expect(detectDistribution({ ...base, windowsStore: true, portableExecutableDir: 'D:\\' })).toBe('store');
  });

  it('jede Art hat eine Bezeichnung', () => {
    for (const d of DISTRIBUTIONS) expect(DISTRIBUTION_LABELS[d]).toMatch(/\S/);
  });
});

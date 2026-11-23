import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './LinkDialog';

describe('Weblink-Adresse', () => {
  it('ergänzt https bei www. und akzeptiert http(s)', () => {
    expect(normalizeUrl('www.fogra.org')).toBe('https://www.fogra.org/');
    expect(normalizeUrl(' https://dpsuisse.ch/qv ')).toBe('https://dpsuisse.ch/qv');
  });
  it('lehnt andere Protokolle und Unsinn ab', () => {
    for (const v of ['javascript:alert(1)', 'file:///C:/', 'mailto:a@b.ch', 'fogra', ''])
      expect(normalizeUrl(v)).toBeNull();
  });
});

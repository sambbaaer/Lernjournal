import { describe, expect, it } from 'vitest';
import { parseMarked, stripMarks } from './search';

describe('Markierte Treffer zerlegen', () => {
  it('trennt Text und Treffer', () => {
    expect(parseMarked('Die \u0002Farbmessung\u0003 ist gut')).toEqual([
      { text: 'Die ', hit: false },
      { text: 'Farbmessung', hit: true },
      { text: ' ist gut', hit: false },
    ]);
  });
  it('fasst benachbarte Treffer zusammen, verträgt Text ohne Treffer und leere Eingabe', () => {
    expect(parseMarked('\u0002Farb\u0003\u0002messung\u0003')).toEqual([{ text: 'Farbmessung', hit: true }]);
    expect(parseMarked('nur Text')).toEqual([{ text: 'nur Text', hit: false }]);
    expect(parseMarked('')).toEqual([]);
  });
  it('HTML bleibt Text (keine Auswertung als Markup)', () => {
    expect(parseMarked('<b>\u0002x\u0003</b>')).toEqual([
      { text: '<b>', hit: false },
      { text: 'x', hit: true },
      { text: '</b>', hit: false },
    ]);
    expect(stripMarks('a\u0002b\u0003c')).toBe('abc');
  });
});

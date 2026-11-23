// Reine Logik der Journal-Verknüpfungen (AJ-10): Link-Ziele, Aufräumen, Suche.
import { describe, expect, it } from 'vitest';
import {
  filterLinkCandidates,
  journalIdFromHref,
  journalLinkHref,
  journalLinkTargets,
  searchKey,
  stripJournalLinks,
} from './links';

const A = '3f2a9c1e-6b7d-4e21-9a4f-0c5d8e7b1a23';
const B = '0b8c7d6e-1111-4222-8333-944455556666';
const link = (id: string) => ({ type: 'link', attrs: { href: journalLinkHref(id) } });

describe('Link-Ziele', () => {
  it('erkennt nur gültige Journal-Links', () => {
    expect(journalIdFromHref(journalLinkHref(A))).toBe(A);
    expect(journalIdFromHref(`lernjournal://journal/${A.toUpperCase()}`)).toBe(A);
    expect(journalIdFromHref('https://fogra.org')).toBeNull();
    expect(journalIdFromHref(`lernjournal://journal/${A}/x`)).toBeNull();
    expect(journalIdFromHref('lernjournal://journal/../etc')).toBeNull();
    expect(journalIdFromHref(42)).toBeNull();
  });

  it('findet Links in allen Abschnitten, auch in Listen und Tabellen', () => {
    const sections = {
      auftrag: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [link(A)] }] }],
      },
      durchfuehrung: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'b', marks: [link(B)] }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      reflexion: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'web', marks: [{ type: 'link', attrs: { href: 'https://x.ch' } }] },
            ],
          },
        ],
      },
    };
    expect([...journalLinkTargets(sections)].sort()).toEqual([B, A].sort());
  });

  it('entfernt nur Links auf das gelöschte Journal und lässt Text und andere Marken stehen', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'weg', marks: [link(A)] },
            { type: 'text', text: 'fett', marks: [{ type: 'bold' }, link(A)] },
            { type: 'text', text: 'bleibt', marks: [link(B)] },
          ],
        },
      ],
    };
    const before = JSON.stringify(doc);
    const out = stripJournalLinks(doc, A);
    expect(out.content[0]!.content).toEqual([
      { type: 'text', text: 'weg' },
      { type: 'text', text: 'fett', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'bleibt', marks: [link(B)] },
    ]);
    expect(JSON.stringify(doc)).toBe(before); // Original unverändert
  });
});

describe('Suche in der Link-Auswahl', () => {
  const c = (id: string, title: string, workDate: string, extra: string[] = []) => ({
    id,
    title,
    workDate,
    extra,
  });
  const list = [
    c('1', 'Überfüller anlegen', '2026-01-10'),
    c('2', 'Farbmessung am Druckbogen', '2026-03-01', ['Spektralfotometer']),
    c('3', 'Proof erstellen', '2026-02-01', ['Farbmessung']),
    c('4', 'Plattenbelichtung', '2025-11-20'),
  ];
  const titles = (q: string) => filterLinkCandidates(list, q).map((x) => x.title);

  it('ohne Eingabe: alle, neuestes Arbeitsdatum zuerst', () => {
    expect(titles('  ')).toEqual([
      'Farbmessung am Druckbogen',
      'Proof erstellen',
      'Überfüller anlegen',
      'Plattenbelichtung',
    ]);
  });

  it('ignoriert Gross/Klein und Umlaute (auch ae/oe/ue)', () => {
    expect(searchKey('  ÜBER   Füller ')).toBe('uber fuller');
    expect(titles('uberfuller')).toEqual(['Überfüller anlegen']);
    expect(titles('überf')).toEqual(['Überfüller anlegen']);
    expect(titles('ueberfueller')).toEqual(['Überfüller anlegen']); // Umschreibung ohne Umlaut-Taste
    expect(titles('ueberf')).toEqual(['Überfüller anlegen']);
    expect(titles('UBERF')).toEqual(['Überfüller anlegen']);
  });

  it('alle Wörter müssen vorkommen; Treffer im Titel zuerst, dann Schlagwörter', () => {
    expect(titles('farbmessung')).toEqual(['Farbmessung am Druckbogen', 'Proof erstellen']);
    expect(titles('bogen farb')).toEqual(['Farbmessung am Druckbogen']);
    expect(titles('spektral')).toEqual(['Farbmessung am Druckbogen']);
  });

  it('findet auch das Arbeitsdatum in Schweizer Schreibweise', () => {
    expect(titles('20.11.2025')).toEqual(['Plattenbelichtung']);
    expect(titles('2026-02')).toEqual(['Proof erstellen']);
  });
});

import { describe, expect, it } from 'vitest';
import { plainTextOf, type JournalDetail } from '@shared/journal';
import { newJournalSections } from '@shared/journal-templates';
import { draftSections, journalRevision, previewEdits } from './journal-edits';

function journal(...text: { text: string; marks?: { type: string }[] }[]): JournalDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Farbmessung',
    template: 'report',
    workDate: '2026-11-24',
    status: 'draft',
    qvSelected: false,
    learningPlace: 'betrieb',
    schoolYear: null,
    schoolYearOverride: null,
    updatedAt: '',
    createdAt: '',
    completedAt: null,
    categoryIds: [],
    tagIds: [],
    sections: newJournalSections().map((section) =>
      section.id === 'durchfuehrung'
        ? {
            ...section,
            doc: {
              type: 'doc',
              content: [{ type: 'paragraph', content: text.map((entry) => ({ type: 'text', ...entry })) }],
            },
          }
        : section,
    ),
  };
}

describe('Gezielte MCP-Textkorrekturen', () => {
  it('behält die Formatierung und lässt andere Abschnitte unverändert', () => {
    const original = journal(
      { text: 'Dichte prüfen', marks: [{ type: 'bold' }] },
      { text: ' und notieren.' },
    );
    const { sections } = previewEdits(original, [
      { kind: 'replace_text', sectionId: 'durchfuehrung', before: 'prüfen', after: 'messen' },
    ]);
    expect(sections[0]).toBe(original.sections[0]);
    expect(sections[2]).toBe(original.sections[2]);
    expect(sections[1]?.doc).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Dichte messen', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' und notieren.' },
          ],
        },
      ],
    });
    expect(journalRevision({ ...original, sections })).not.toBe(journalRevision(original));
  });

  it('lehnt mehrdeutige, gemischt formatierte und unveränderte Ersetzungen ab', () => {
    const edit = (before: string, after: string) => [
      { kind: 'replace_text' as const, sectionId: 'durchfuehrung' as const, before, after },
    ];
    expect(() => previewEdits(journal({ text: 'Dichte Dichte' }), edit('Dichte', 'Farbe'))).toThrow(
      /mehrdeutig/,
    );
    expect(() =>
      previewEdits(
        journal({ text: 'Dichte ', marks: [{ type: 'bold' }] }, { text: 'messen' }),
        edit('Dichte messen', 'Dichte prüfen'),
      ),
    ).toThrow(/Formatierungen/);
    expect(() => previewEdits(journal({ text: 'Dichte messen' }), edit('Dichte', 'Dichte'))).toThrow(
      /keine Änderung/,
    );
  });

  it('übernimmt Entwurfstext als Text und bewahrt Zeilenabsätze', () => {
    const sections = draftSections({ reflexion: 'Vorbereitet\r\n<Befund offen>' });
    expect(plainTextOf(sections.find(({ id }) => id === 'reflexion')!.doc)).toBe(
      'Vorbereitet\n<Befund offen>',
    );
  });
});

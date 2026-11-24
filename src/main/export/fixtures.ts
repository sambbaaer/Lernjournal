// Testdaten für den Word-Export: ein realistisches Journal der Fachrichtung
// Print mit allen erlaubten Editor-Knoten (SPEC «Erlaubte Editor-Knoten»).
// Wird von export.test.ts genutzt (Golden File) und ist gegen das echte
// Editor-Schema geprüft – es ist also echtes Tiptap-JSON, kein Fantasieformat.
import type { TiptapNode } from './docx-content';
import type { ExportAuthor, ExportJournal } from './docx-journal';

// Kleine Bauhelfer, damit die Testdaten lesbar bleiben
const t = (text: string, ...marks: string[]): TiptapNode => ({
  type: 'text',
  text,
  ...(marks.length ? { marks: marks.map((m) => ({ type: m })) } : {}),
});
const link = (text: string, href: string): TiptapNode => ({
  type: 'text',
  text,
  marks: [{ type: 'link', attrs: { href, target: null, rel: 'noopener noreferrer nofollow', class: null } }],
});
const p = (...content: TiptapNode[]): TiptapNode => ({ type: 'paragraph', content });
const doc = (...content: TiptapNode[]): TiptapNode => ({ type: 'doc', content });
const li = (...content: TiptapNode[]): TiptapNode => ({ type: 'listItem', content });
const cell = (type: 'tableHeader' | 'tableCell', text: string): TiptapNode => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth: null },
  content: [p(t(text))],
});
const row = (type: 'tableHeader' | 'tableCell', ...texts: string[]): TiptapNode => ({
  type: 'tableRow',
  content: texts.map((x) => cell(type, x)),
});

export const IDS = {
  journal: '3f2a9c1e-6b7d-4e21-9a4f-0c5d8e7b1a23',
  linked: 'b81e4d70-2c3a-4f9e-8d16-5a7c9e0f4b12',
  image: '0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
};

export const AUTHOR: ExportAuthor = { displayName: 'Lea Muster', company: 'Druckerei Beispiel AG' };

export const JOURNAL: ExportJournal = {
  id: IDS.journal,
  title: 'Farbmessung und Volltondichte am Druckbogen',
  workDate: '2026-03-14',
  schoolYear: 2,
  semester: 1,
  learningPlace: 'betrieb',
  categories: ['e – Ausführen von Druckaufträgen'],
  tags: ['Farbmessung', 'ISO 12647-2', 'Spektralfotometer'],
  sections: {
    auftrag: doc(
      p(
        t('Für einen Flyer (A5, 4/4-farbig, 135 g/m² Bilderdruck matt) musste ich die '),
        t('Volltondichten', 'bold'),
        t(' messen und auf den Sollwert '),
        t('einregeln', 'italic'),
        t('.'),
      ),
      p(t('Ziel: Abweichung ΔE ≤ 5 gegenüber dem Proof.'), { type: 'hardBreak' }, t('Für: interner Auftrag')),
    ),
    durchfuehrung: doc(
      { type: 'heading', attrs: { level: 2 }, content: [t('Vorgehen')] },
      {
        type: 'orderedList',
        attrs: { start: 1, type: null },
        content: [
          li(p(t('Messgerät kalibriert (Weissreferenz).'))),
          li(
            p(t('Kontrollstreifen in der Mitte des Bogens gemessen.')),
            p(t('Dabei auf trockene Farbe geachtet.')),
            {
              type: 'bulletList',
              content: [li(p(t('Cyan, Magenta, Gelb, Schwarz einzeln'))), li(p(t('Graubalance zusätzlich')))],
            },
          ),
          li(p(t('Farbzonen nachgeregelt und erneut gemessen.'))),
        ],
      },
      { type: 'heading', attrs: { level: 3 }, content: [t('Messwerte')] },
      {
        type: 'table',
        content: [
          row('tableHeader', 'Farbe', 'Soll', 'Ist vorher', 'Ist nachher'),
          row('tableCell', 'Cyan', '1.45', '1.31', '1.44'),
          row('tableCell', 'Schwarz', '1.70', '1.62', '1.69'),
        ],
      },
      {
        type: 'figure',
        attrs: { mediaId: IDS.image, caption: 'Kontrollstreifen nach dem Einregeln', alt: '' },
      },
      {
        type: 'orderedList',
        attrs: { start: 3, type: null },
        content: [li(p(t('Freigabe durch den Berufsbildner, '), t('unterstrichen', 'underline')))],
      },
      p(
        t('Grundlagen siehe '),
        link('Fogra', 'https://fogra.org'),
        t(' und mein Journal '),
        link('Farbprofil', `lernjournal://journal/${IDS.linked}`),
        t('.'),
      ),
    ),
    reflexion: doc({ type: 'paragraph' }),
  },
};

export const LINK_TITLES = new Map([[IDS.linked, 'ICC-Profile im Workflow']]);

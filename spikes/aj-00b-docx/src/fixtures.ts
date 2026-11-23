// Testdaten: drei Journale im Format, das die App später aus SQLite liest.
// Inhalte sind realistisch (Fachrichtung Print), damit man das Ergebnis
// in Word auch inhaltlich beurteilen kann.

import type { TiptapNode } from './schema.ts';

export type Journal = {
  id: string;
  title: string;
  workDate: string; // lokales ISO-Datum, z. B. 2026-03-14
  schoolYear: number;
  learningPlace: 'betrieb' | 'uek' | 'schule';
  categories: string[];
  tags: string[];
  sections: { auftrag: TiptapNode; durchfuehrung: TiptapNode; reflexion: TiptapNode };
};

// Kleine Bauhelfer, damit die Testdaten lesbar bleiben.
const t = (text: string, ...marks: string[]): TiptapNode => ({
  type: 'text',
  text,
  ...(marks.length ? { marks: marks.map((m) => ({ type: m })) } : {}),
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

export const JOURNAL_IDS = {
  farbe: '3f2a9c1e-6b7d-4e21-9a4f-0c5d8e7b1a23',
  platte: 'b81e4d70-2c3a-4f9e-8d16-5a7c9e0f4b12',
  falz: 'c4d5e6f7-0a1b-4c2d-8e3f-9a0b1c2d3e4f',
};

export const journals: Journal[] = [
  {
    id: JOURNAL_IDS.farbe,
    title: 'Farbmessung und Volltondichte am Druckbogen',
    workDate: '2026-03-14',
    schoolYear: 2,
    learningPlace: 'betrieb',
    categories: ['e – Ausführen von Druckaufträgen'],
    tags: ['Farbmessung', 'Spektralfotometer', 'ISO 12647-2'],
    sections: {
      auftrag: doc(
        p(t('Für einen Flyer (A5, 4/4-farbig, 135 g/m² Bilderdruck matt) musste ich die '),
          t('Volltondichten', 'bold'), t(' messen und auf den Sollwert einregeln.')),
        p(t('Ziel: Abweichung ΔE ≤ 5 gegenüber dem Proof.')),
      ),
      durchfuehrung: doc(
        { type: 'heading', attrs: { level: 2 }, content: [t('Vorgehen')] },
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [
            li(p(t('Messgerät kalibriert (Weissreferenz).'))),
            li(p(t('Kontrollstreifen in der Mitte des Bogens gemessen.')),
              { type: 'bulletList', content: [li(p(t('Cyan, Magenta, Gelb, Schwarz einzeln'))), li(p(t('Graubalance zusätzlich')))] }),
            li(p(t('Farbzonen nachgeregelt und erneut gemessen.'))),
          ],
        },
        { type: 'heading', attrs: { level: 2 }, content: [t('Messwerte')] },
        {
          type: 'table',
          content: [
            row('tableHeader', 'Farbe', 'Soll', 'Ist vorher', 'Ist nachher'),
            row('tableCell', 'Cyan', '1.45', '1.31', '1.44'),
            row('tableCell', 'Magenta', '1.40', '1.52', '1.41'),
            row('tableCell', 'Gelb', '1.30', '1.29', '1.30'),
            row('tableCell', 'Schwarz', '1.70', '1.62', '1.69'),
          ],
        },
        { type: 'figure', attrs: { mediaId: 'bogen-quer', caption: 'Kontrollstreifen auf dem Druckbogen', alt: 'Druckbogen mit Kontrollstreifen' } },
        p(t('Siehe auch '),
          { type: 'text', text: 'Plattenwechsel', marks: [{ type: 'link', attrs: { href: `lernjournal://journal/${JOURNAL_IDS.platte}` } }] },
          t(' und die '),
          { type: 'text', text: 'Fogra-Prozessstandards', marks: [{ type: 'link', attrs: { href: 'https://fogra.org' } }] },
          t('.')),
      ),
      reflexion: doc(
        p(t('Gut lief: ', 'bold'), t('Messung und Nachregeln gingen schneller als beim letzten Mal.')),
        p(t('Schwierig: ', 'bold'), t('Magenta lief nach 2000 Bogen wieder hoch.'), { type: 'hardBreak' },
          t('Nächstes Mal prüfe ich früher die '), t('Feuchtung', 'italic'), t('.')),
      ),
    },
  },
  {
    id: JOURNAL_IDS.platte,
    title: 'Plattenwechsel an der Bogenoffsetmaschine',
    workDate: '2026-04-02',
    schoolYear: 2,
    learningPlace: 'betrieb',
    categories: ['e – Ausführen von Druckaufträgen', 'g – Warten und Instandhalten von Druckmaschinen'],
    tags: ['Plattenwechsel', 'Sicherheit'],
    sections: {
      auftrag: doc(p(t('Druckplatten für einen Folgeauftrag wechseln und Gummitücher reinigen.'))),
      durchfuehrung: doc(
        { type: 'bulletList', content: [li(p(t('Maschine gesichert (Not-Aus geprüft)'))), li(p(t('Platten ausgespannt, neue eingespannt'))), li(p(t('Gummituch gewaschen')))] },
        { type: 'figure', attrs: { mediaId: 'platte-hoch', caption: 'Eingespannte Druckplatte', alt: 'Druckplatte' } },
        p(t('Zurück zu '),
          { type: 'text', text: 'Farbmessung', marks: [{ type: 'link', attrs: { href: `lernjournal://journal/${JOURNAL_IDS.farbe}` } }] },
          t('.')),
      ),
      reflexion: doc({ type: 'paragraph' }), // leer (so speichert Tiptap ein leeres Feld): Export muss das sauber anzeigen
    },
  },
  {
    id: JOURNAL_IDS.falz,
    title: 'Falzen eines Leporellos',
    workDate: '2026-05-20',
    schoolYear: 2,
    learningPlace: 'uek',
    categories: ['f – Ausführen von Weiterverarbeitungsaufträgen'],
    tags: ['Falzen', 'Laufrichtung'],
    sections: {
      auftrag: doc(p(t('Sechsseitiges Leporello falzen, '), t('Laufrichtung', 'underline'), t(' beachten.'))),
      durchfuehrung: doc(
        { type: 'orderedList', attrs: { start: 1 }, content: [li(p(t('Laufrichtung geprüft'))), li(p(t('Falzmaschine eingestellt')))] },
        p(t('Eine zweite nummerierte Liste muss wieder bei 1 beginnen:')),
        { type: 'orderedList', attrs: { start: 1 }, content: [li(p(t('Probefalz'))), li(p(t('Auflage')))] },
        p(t('Link auf ein Journal, das nicht im Export ist: '),
          { type: 'text', text: 'Altes Journal', marks: [{ type: 'link', attrs: { href: 'lernjournal://journal/00000000-0000-4000-8000-000000000000' } }] }),
      ),
      reflexion: doc(p(t('Falzbruch bei 300 g/m² – nächstes Mal rillen.'))),
    },
  },
];

// Ein Journal als Folge von Word-Blöcken: Titel, Metadaten-Kopfblock und die
// drei Abschnitte Auftrag / Durchführung / Reflexion (SPEC «Word-Export»).
//
// Wiederverwendbar: Das Einzel-DOCX (AJ-12) enthält genau ein Journal, das
// Sammel-DOCX (AJ-13) reiht mehrere mit gemeinsamem Kontext aneinander.
import { Bookmark, HeadingLevel, Paragraph, TextRun } from 'docx';
import { SECTION_KEYS, SECTION_TITLES, type LearningPlace } from '@shared/journal';
import {
  bookmarkFor,
  cleanText,
  contentBlocks,
  formatDateCH,
  hasContent,
  type Block,
  type ContentContext,
  type TiptapNode,
} from './docx-content';

// Alles, was der Export über ein Journal wissen muss – bereits aufbereitet
// (Namen statt IDs), damit die Abbildung ohne Datenbank testbar ist.
export type ExportJournal = {
  id: string;
  title: string;
  workDate: string; // lokales ISO-Datum «JJJJ-MM-TT»
  // Lehrjahr (manuell oder berechnet) und Semester (nur wenn berechnet)
  schoolYear: number | null;
  semester: number | null;
  learningPlace: LearningPlace;
  categories: string[]; // in der Reihenfolge der Kategorienliste
  tags: string[]; // alphabetisch
  sections: Record<(typeof SECTION_KEYS)[number], TiptapNode>;
};

// Angaben zur lernenden Person aus dem Profil (Kopfblock, Fusszeile, Dateieigenschaften)
export type ExportAuthor = { displayName: string; company: string | null };

// Im Word-Dokument ausgeschrieben (in der App reicht «üK»)
export const LEARNING_PLACE_DOCX: Record<LearningPlace, string> = {
  betrieb: 'Betrieb',
  uek: 'überbetrieblicher Kurs (üK)',
  schule: 'Berufsfachschule',
};

export function displayTitle(title: string): string {
  return title.trim() || 'Ohne Titel';
}

// «2. Lehrjahr, 1. Semester» bzw. «2. Lehrjahr» (manuell gesetzt) oder null
export function schoolYearText(year: number | null, semester: number | null): string | null {
  if (!year) return null;
  return semester ? `${year}. Lehrjahr, ${semester}. Semester` : `${year}. Lehrjahr`;
}

// Eine Zeile des Kopfblocks: «Bezeichnung: Wert · Wert · Bezeichnung: Wert»
// (leere Bezeichnung = nur der Wert, z. B. «2. Lehrjahr, 1. Semester»)
function metaLine(pairs: [label: string, value: string][]): Paragraph {
  const children: TextRun[] = [];
  pairs.forEach(([label, value], i) => {
    if (i > 0) children.push(new TextRun('   ·   '));
    if (label) children.push(new TextRun({ text: `${label}: `, bold: true }));
    children.push(new TextRun(cleanText(value)));
  });
  return new Paragraph({ style: 'JournalMeta', children });
}

// Metadaten-Kopfblock: Name, Lehrbetrieb, Arbeitsdatum, Lehrjahr, Lernort,
// Kategorien, Schlagwörter. Leere Angaben fallen weg (alles ist freiwillig).
export function metaBlocks(j: ExportJournal, author: ExportAuthor): Paragraph[] {
  const lines: [string, string][][] = [];
  const person: [string, string][] = [];
  if (author.displayName.trim()) person.push(['Name', author.displayName.trim()]);
  if (author.company?.trim()) person.push(['Lehrbetrieb', author.company.trim()]);
  if (person.length) lines.push(person);
  const when: [string, string][] = [['Arbeitsdatum', formatDateCH(j.workDate)]];
  const year = schoolYearText(j.schoolYear, j.semester);
  if (year) when.push(['', year]);
  when.push(['Lernort', LEARNING_PLACE_DOCX[j.learningPlace]]);
  lines.push(when);
  if (j.categories.length) lines.push([['Kategorien', j.categories.join(', ')]]);
  if (j.tags.length) lines.push([['Schlagwörter', j.tags.join(', ')]]);
  return lines.map(metaLine);
}

// Das ganze Journal. Titel = «Überschrift 1» mit Textmarke (Sprungziel für
// Links im Sammel-DOCX), Abschnitte = «Überschrift 2» (für das Inhaltsverzeichnis).
export function journalBlocks(j: ExportJournal, author: ExportAuthor, ctx: ContentContext): Block[] {
  const out: Block[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new Bookmark({ id: bookmarkFor(j.id), children: [new TextRun(cleanText(displayTitle(j.title)))] }),
      ],
    }),
    ...metaBlocks(j, author),
  ];
  for (const key of SECTION_KEYS) {
    out.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(SECTION_TITLES[key])] }),
    );
    const section = j.sections[key];
    // Leerer Abschnitt: ein grauer Strich statt nichts – so sieht man in Word,
    // dass der Abschnitt bewusst leer ist, und kann direkt dort weiterschreiben.
    // Hilfetexte des Editors sind nur Platzhalter und werden nie exportiert.
    out.push(
      ...(hasContent(section)
        ? contentBlocks(section, ctx)
        : [new Paragraph({ children: [new TextRun({ text: '–', color: '808080' })] })]),
    );
  }
  return out;
}

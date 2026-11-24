// Sammel-DOCX (AJ-13): mehrere Journale in EINEM Word-Dokument.
//
// Aufbau (SPEC «Word-Export»):
//   Seite 1   Titelseite – Titel, Name, Lehrbetrieb, Beruf/Fachrichtung,
//             Zeitraum der Journale, Anzahl, Erstelldatum (ohne Fusszeile)
//   Seite 2   Inhaltsverzeichnis als echtes Word-Feld (TOC)
//   ab Seite 3 die Journale in der gewählten Reihenfolge, jedes auf einer
//             neuen Seite (klare Journal-Grenzen)
//
// Alle Journale teilen EINEN Inhaltskontext (createContentContext): So zählen
// die Abbildungsnummern durch das ganze Dokument («Abbildung 1 … n»), und ein
// Link auf ein Journal, das ebenfalls im Dokument steht, wird zum klickbaren
// Sprung auf dessen Titel (Textmarke). Links auf Journale ausserhalb der
// Auswahl bleiben Text mit dem Hinweis «(siehe Journal «Titel»)».
//
// Rein wie die übrigen Bausteine (keine Datei-, DB- oder Electron-Zugriffe),
// damit das Dokument mit Golden Files prüfbar ist.
import { Paragraph, TableOfContents, TextRun, type FileChild } from 'docx';
import { DEFAULT_COLLECTION_TITLE } from '@shared/export';
import { SPECIALIZATION_LABELS, type Profile } from '@shared/ipc';
import { cleanText, createContentContext, formatDateCH, type MediaResolver } from './docx-content';
import { buildDocument, DEFAULT_DESIGN, textWidthCm, type DocxDesign } from './docx-document';
import { displayTitle, journalBlocks, type ExportAuthor, type ExportJournal } from './docx-journal';

// Angaben für die Titelseite, die nicht aus den Journalen stammen
export type CollectionInfo = {
  title: string; // vom Nutzer gewählt; leer → «Lerndokumentation»
  createdOn: string; // Exportdatum (lokales ISO-Datum), von aussen für feste Testergebnisse
  specialization: Profile['specialization'] | null; // Fachrichtung aus dem Profil
};

export type CollectionDocumentInput = {
  journals: ExportJournal[]; // bereits in der gewählten Reihenfolge
  author: ExportAuthor;
  media: MediaResolver;
  // Titel verlinkter Journale ausserhalb der Auswahl (Hinweis im Text)
  linkTitles?: ReadonlyMap<string, string>;
  info: CollectionInfo;
  design?: DocxDesign;
};

export function collectionTitle(title: string): string {
  return title.trim() || DEFAULT_COLLECTION_TITLE;
}

// Zeitraum der Journale nach Arbeitsdatum: «14.03.2026 – 20.06.2026», bei nur
// einem Datum dieses allein. Unabhängig von der gewählten Reihenfolge.
export function periodText(journals: readonly Pick<ExportJournal, 'workDate'>[]): string | null {
  const dates = journals.map((j) => j.workDate).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return null;
  return first === last ? formatDateCH(first) : `${formatDateCH(first)} – ${formatDateCH(last)}`;
}

// Beruf und Fachrichtung (Fokus Print, SPEC). Beide Berufsbezeichnungen, weil
// das Profil kein Geschlecht kennt – und auch keines kennen soll.
export function professionText(specialization: CollectionInfo['specialization']): string {
  const base = 'Medientechnologin/Medientechnologe EFZ';
  return specialization ? `${base}, Fachrichtung ${SPECIALIZATION_LABELS[specialization]}` : base;
}

// Titelseite. Leere Profilangaben fallen weg (alles ist freiwillig).
export function titlePageBlocks(
  journals: readonly ExportJournal[],
  author: ExportAuthor,
  info: CollectionInfo,
): Paragraph[] {
  const line = (text: string, opts: { size?: number; color?: string; after?: number } = {}) =>
    new Paragraph({
      spacing: opts.after !== undefined ? { after: opts.after } : undefined,
      children: [new TextRun({ text: cleanText(text), size: opts.size, color: opts.color })],
    });
  const out: Paragraph[] = [
    new Paragraph({ style: 'Title', children: [new TextRun(cleanText(collectionTitle(info.title)))] }),
  ];
  const name = author.displayName.trim();
  if (name) out.push(new Paragraph({ style: 'Subtitle', children: [new TextRun(cleanText(name))] }));
  const company = author.company?.trim();
  if (company) out.push(line(company, { size: 26 }));
  out.push(line(professionText(info.specialization), { size: 22, color: '595959', after: 720 }));

  const period = periodText(journals);
  if (period) out.push(line(`Zeitraum: ${period}`, { size: 24 }));
  out.push(line(journals.length === 1 ? '1 Journal' : `${journals.length} Journale`, { size: 24 }));
  // Herkunft klar benennen: Lernjournal ist ein inoffizielles Hilfsmittel (R-14)
  out.push(
    new Paragraph({
      spacing: { before: 1440 },
      children: [
        new TextRun({
          text: `Erstellt am ${formatDateCH(info.createdOn)} mit Lernjournal (inoffizielles Hilfsmittel)`,
          size: 18,
          color: '595959',
        }),
      ],
    }),
  );
  return out;
}

// Inhaltsverzeichnis auf eigener Seite: Feld TOC über «Überschrift 1» (die
// Journaltitel) mit Links. Bewusst nur Ebene 1: Die Abschnitte Auftrag /
// Durchführung / Reflexion heissen in jedem Journal gleich und würden das
// Verzeichnis nur verdreifachen (Word zeigt sie im Navigationsbereich).
// `docx` füllt die Einträge vor (ohne Seitenzahlen) und markiert das Feld als
// «zu aktualisieren»; Word ergänzt die Seitenzahlen beim Öffnen (updateFields).
export function tocBlocks(): FileChild[] {
  return [
    new Paragraph({
      style: 'TOCHeading',
      pageBreakBefore: true,
      children: [new TextRun('Inhaltsverzeichnis')],
    }),
    new TableOfContents('Inhaltsverzeichnis', { hyperlink: true, headingStyleRange: '1-1' }),
  ];
}

export function buildCollectionDocument(input: CollectionDocumentInput): {
  doc: ReturnType<typeof buildDocument>;
  warnings: string[];
} {
  const design = input.design ?? DEFAULT_DESIGN;
  const ctx = createContentContext({
    media: input.media,
    inDocument: input.journals.map((j) => j.id),
    linkTitles: input.linkTitles,
    textWidthCm: textWidthCm(design),
  });
  const warnings: string[] = [];
  const body: FileChild[] = [];
  for (const journal of input.journals) {
    // Hinweise je Journal sammeln und mit dem Titel versehen – im Sammel-DOCX
    // muss man wissen, WO ein Bild fehlt. Der Zähler (Abbildungen, Listen)
    // läuft dabei im gemeinsamen Kontext weiter.
    ctx.warnings = new Set();
    body.push(...journalBlocks(journal, input.author, ctx, { pageBreakBefore: true }));
    for (const w of ctx.warnings) warnings.push(`«${displayTitle(journal.title)}»: ${w}`);
  }
  // Inhalt zuerst gebaut: Erst danach sind die Listen-Startwerte bekannt
  const doc = buildDocument({
    title: collectionTitle(input.info.title),
    author: input.author,
    design,
    ctx,
    children: [...titlePageBlocks(input.journals, input.author, input.info), ...tocBlocks(), ...body],
    updateFields: true,
    titlePage: true,
  });
  return { doc, warnings };
}

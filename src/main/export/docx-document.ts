// Das Word-Dokument rund um den Inhalt: Seite (A4, Ränder), Formatvorlagen,
// Nummerierung, Fusszeile mit Seitenzahlen und Dateieigenschaften.
//
// Aufbau für Wiederverwendung (ADR 0002):
//   buildDocument()        – gemeinsame Hülle für Einzel- und Sammel-DOCX
//   buildJournalDocument() – Einzel-DOCX (AJ-12): genau ein Journal
// Das Sammel-DOCX (AJ-13) baut mit createContentContext() + journalBlocks()
// je Journal (gemeinsamer Kontext) und reicht die Blöcke an buildDocument()
// weiter – ergänzt um Titelseite, Inhaltsverzeichnis und Seitenumbrüche.
import { BorderStyle, Document, Footer, Packer, PageNumber, Paragraph, TabStopType, TextRun } from 'docx';
import {
  cmToTwips,
  createContentContext,
  numberingConfig,
  type Block,
  type ContentContext,
  type MediaResolver,
} from './docx-content';
import { displayTitle, journalBlocks, type ExportAuthor, type ExportJournal } from './docx-journal';

// Einfache Standardgestaltung (SPEC: Schrift, Grösse, Rand). Noch ohne
// Einstellung in der Oberfläche; die Werte sind bewusst an einer Stelle.
export type DocxDesign = { font: string; fontSizePt: number; marginCm: number };
export const DEFAULT_DESIGN: DocxDesign = { font: 'Calibri', fontSizePt: 11, marginCm: 2.5 };

// A4 hoch
export const PAGE_WIDTH_CM = 21;
export const PAGE_HEIGHT_CM = 29.7;
export const textWidthCm = (design: DocxDesign) => PAGE_WIDTH_CM - 2 * design.marginCm;

const COLOR_HEADING = '1F3864';
const COLOR_SECTION = '2F5496';
const COLOR_MUTED = '595959';

export type DocumentInput = {
  title: string; // Dateieigenschaft «Titel»
  author: ExportAuthor;
  design: DocxDesign;
  ctx: ContentContext; // für die Nummerierungsvorlagen der verwendeten Listen
  children: Block[];
  // Word beim Öffnen Felder aktualisieren lassen (für das Inhaltsverzeichnis, AJ-13)
  updateFields?: boolean;
};

// Fusszeile: «Lerndokumentation – Name» links, «Seite X von Y» rechts
function footer(author: ExportAuthor, design: DocxDesign): Footer {
  const name = author.displayName.trim();
  const style = { size: 16, color: COLOR_MUTED }; // 8 pt
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF', space: 4 } },
        tabStops: [{ type: TabStopType.RIGHT, position: cmToTwips(textWidthCm(design)) }],
        children: [
          new TextRun({ text: name ? `Lerndokumentation – ${name}` : 'Lerndokumentation', ...style }),
          new TextRun({
            children: ['\tSeite ', PageNumber.CURRENT, ' von ', PageNumber.TOTAL_PAGES],
            ...style,
          }),
        ],
      }),
    ],
  });
}

export function buildDocument(input: DocumentInput): Document {
  const { design, author } = input;
  const size = Math.round(design.fontSizePt * 2); // docx rechnet in halben Punkten
  const font = design.font;
  const margin = cmToTwips(design.marginCm);
  return new Document({
    creator: author.displayName.trim() || 'Lernjournal',
    lastModifiedBy: author.displayName.trim() || 'Lernjournal',
    title: input.title,
    subject: 'Lerndokumentation',
    description: 'Exportiert aus Lernjournal (inoffizielles Hilfsmittel)',
    features: { updateFields: input.updateFields ?? false },
    // Formatvorlagen über die eingebauten IDs (Heading1, Caption …): Deutsches
    // Word zeigt sie als «Überschrift 1», «Beschriftung» usw., und ein
    // Inhaltsverzeichnis findet die Überschriften.
    styles: {
      default: {
        document: {
          run: { font, size, language: { value: 'de-CH' } },
          paragraph: { spacing: { after: 120 } },
        },
        heading1: {
          run: { font, size: 32, bold: true, color: COLOR_HEADING },
          paragraph: { keepNext: true, spacing: { before: 0, after: 120 } },
        },
        heading2: {
          run: { font, size: 26, bold: true, color: COLOR_SECTION },
          paragraph: { keepNext: true, spacing: { before: 320, after: 100 } },
        },
        heading3: {
          run: { font, size: size + 2, bold: true },
          paragraph: { keepNext: true, spacing: { before: 200, after: 60 } },
        },
        heading4: {
          run: { font, size, bold: true, italics: true },
          paragraph: { keepNext: true, spacing: { before: 160, after: 40 } },
        },
        hyperlink: { run: { color: '0563C1', underline: {} } },
      },
      paragraphStyles: [
        {
          id: 'Caption',
          name: 'caption', // eingebauter Name → «Beschriftung»
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: Math.max(16, size - 4), italics: true, color: '404040' },
          paragraph: { spacing: { before: 60, after: 200 } },
        },
        {
          id: 'JournalMeta',
          name: 'Journal-Metadaten',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: Math.max(16, size - 4), color: COLOR_MUTED },
          paragraph: { spacing: { after: 40 } },
        },
      ],
    },
    numbering: { config: numberingConfig(input.ctx) },
    sections: [
      {
        properties: {
          page: {
            size: { width: cmToTwips(PAGE_WIDTH_CM), height: cmToTwips(PAGE_HEIGHT_CM) },
            margin: { top: margin, bottom: margin, left: margin, right: margin },
          },
        },
        footers: { default: footer(author, design) },
        children: input.children,
      },
    ],
  });
}

export type JournalDocumentInput = {
  journal: ExportJournal;
  author: ExportAuthor;
  media: MediaResolver;
  // Titel verlinkter Journale (Hinweis «siehe Journal …» im Text)
  linkTitles?: ReadonlyMap<string, string>;
  design?: DocxDesign;
};

// Einzel-DOCX: ein Journal, keine Titelseite, kein Inhaltsverzeichnis
export function buildJournalDocument(input: JournalDocumentInput): { doc: Document; warnings: string[] } {
  const design = input.design ?? DEFAULT_DESIGN;
  const ctx = createContentContext({
    media: input.media,
    inDocument: [input.journal.id],
    linkTitles: input.linkTitles,
    textWidthCm: textWidthCm(design),
  });
  // Inhalt zuerst: Erst danach ist bekannt, welche Listen-Startwerte vorkommen
  const children = journalBlocks(input.journal, input.author, ctx);
  const doc = buildDocument({
    title: displayTitle(input.journal.title),
    author: input.author,
    design,
    ctx,
    children,
  });
  return { doc, warnings: [...ctx.warnings] };
}

// Fertige DOCX-Datei (ZIP) als Bytes
export async function packDocx(doc: Document): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toBuffer(doc));
}

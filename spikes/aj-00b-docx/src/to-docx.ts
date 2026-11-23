// AJ-00b – Tiptap-JSON → echtes Word-Dokument mit der Bibliothek `docx`.
//
// Grundsatz (SPEC «Word-Export»): Jeder erlaubte Editor-Knoten hat eine
// feste Abbildung auf ein natives Word-Element. Kein HTML-Pseudoexport.
//
//   Journaltitel          → Formatvorlage «Überschrift 1» (Heading1) + Textmarke
//   Abschnitt (Auftrag …) → «Überschrift 2» (Heading2)
//   Editor-H2 / H3        → «Überschrift 3» / «Überschrift 4»
//   Absatz                → «Standard»
//   Aufzählung/Nummerierung → Word-Listen (numbering), jede Liste neu ab 1
//   Tabelle               → Word-Tabelle, erste Zeile als Kopfzeile wiederholt
//   Bild + Legende        → Bild + «Beschriftung» (Caption) mit SEQ-Feld
//   Link auf Journal      → interner Link (Textmarke) im Sammel-DOCX, sonst Text
//   externer Link         → echter Hyperlink
//
// Unbekannte Knoten gehen NIE verloren: ihr Text wird als normaler Absatz
// ausgegeben und eine Warnung gesammelt (Datenintegrität vor Schönheit).

import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  PageBreak,
  PageNumber,
  Paragraph,
  SimpleField,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import type { Journal } from './fixtures.ts';
import type { TiptapMark, TiptapNode } from './schema.ts';

// --- Einstellungen ----------------------------------------------------------

// Bilddaten liefert der Aufrufer (in der App: Main-Prozess liest media/<id>).
export type MediaResolver = (mediaId: string) =>
  | { data: Buffer; type: 'png' | 'jpg'; widthPx: number; heightPx: number }
  | undefined;

export type ExportOptions = {
  authorName: string;
  font?: string; // konfigurierbar (SPEC: einfache Standardgestaltung)
  fontSizePt?: number;
  resolveMedia: MediaResolver;
};

const LEARNING_PLACE_LABEL = { betrieb: 'Betrieb', uek: 'überbetrieblicher Kurs', schule: 'Berufsfachschule' };
const SECTION_TITLES = [
  ['auftrag', 'Auftrag / Ausgangslage'],
  ['durchfuehrung', 'Durchführung'],
  ['reflexion', 'Reflexion'],
] as const;

// A4 mit 2.5 cm Rand → 16 cm Satzspiegel. docx rechnet Bilder in Pixel bei 96 dpi.
const TEXT_WIDTH_PX = Math.round((16 / 2.54) * 96); // ≈ 605 px
const MAX_IMAGE_HEIGHT_PX = Math.round((12 / 2.54) * 96); // Bilder höchstens 12 cm hoch

// Schweizer Datumsformat 14.03.2026 (ohne Zeitzonen-Falle: reine Textzerlegung)
export function formatDateCH(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

// Word-Textmarken: max. 40 Zeichen, nur Buchstaben/Ziffern/_; muss mit Buchstaben beginnen.
export function bookmarkFor(journalId: string): string {
  return `j_${journalId.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 40);
}

// --- Kontext, der während eines Exports mitläuft ----------------------------

type Ctx = {
  opts: ExportOptions;
  exportedIds: Set<string>; // welche Journale sind in DIESEM Dokument?
  warnings: string[];
  listInstance: number; // jede nummerierte Liste bekommt eine eigene Instanz → beginnt bei 1
  figureNo: number; // laufende Abbildungsnummer, als vorberechneter Feldwert
};

// --- Inline-Inhalte (Text mit Formatierung, Links, Umbrüche) ----------------

function runFromText(node: TiptapNode, ctx: Ctx, style?: string): TextRun {
  const has = (m: string) => node.marks?.some((x) => x.type === m) ?? false;
  return new TextRun({
    text: node.text ?? '',
    bold: has('bold'),
    italics: has('italic'),
    underline: has('underline') ? {} : undefined,
    strike: has('strike'),
    font: has('code') ? 'Consolas' : undefined,
    style,
  });
}

function inlineChildren(nodes: TiptapNode[] | undefined, ctx: Ctx): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      out.push(new TextRun({ break: 1 }));
      continue;
    }
    if (node.type !== 'text') {
      ctx.warnings.push(`Unbekannter Inline-Knoten «${node.type}» als Text ausgegeben`);
      out.push(new TextRun(plainText(node)));
      continue;
    }
    const link = node.marks?.find((m: TiptapMark) => m.type === 'link');
    const href = String(link?.attrs?.href ?? '');
    if (!link) {
      out.push(runFromText(node, ctx));
    } else if (href.startsWith('lernjournal://journal/')) {
      const targetId = href.slice('lernjournal://journal/'.length);
      if (ctx.exportedIds.has(targetId)) {
        // Ziel ist im selben Dokument → klickbarer Sprung zur Textmarke
        out.push(new InternalHyperlink({ anchor: bookmarkFor(targetId), children: [runFromText(node, ctx, 'Hyperlink')] }));
      } else {
        // Ziel fehlt im Export → Text bleibt, ohne toten Link
        out.push(runFromText(node, ctx));
        out.push(new TextRun({ text: ' (nicht in diesem Export)', italics: true }));
      }
    } else if (/^https?:\/\//.test(href)) {
      out.push(new ExternalHyperlink({ link: href, children: [runFromText(node, ctx, 'Hyperlink')] }));
    } else {
      // Andere Schemas (file:, javascript: …) werden aus Sicherheitsgründen nicht verlinkt
      ctx.warnings.push(`Link mit unzulässigem Ziel als Text ausgegeben: ${href}`);
      out.push(runFromText(node, ctx));
    }
  }
  return out;
}

// Reiner Text eines Knotens (Rückfall für Unbekanntes, auch für Suche nützlich)
export function plainText(node: TiptapNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(plainText).join(node.type === 'paragraph' ? '' : ' ');
}

// --- Block-Inhalte ----------------------------------------------------------

type Block = Paragraph | Table;

function listBlocks(node: TiptapNode, ctx: Ctx, level: number): Block[] {
  const ordered = node.type === 'orderedList';
  const instance = ordered ? ++ctx.listInstance : 0;
  const out: Block[] = [];
  for (const item of node.content ?? []) {
    for (const child of item.content ?? []) {
      if (child.type === 'paragraph') {
        out.push(
          new Paragraph({
            children: inlineChildren(child.content, ctx),
            ...(ordered
              ? { numbering: { reference: 'nummeriert', level, instance } }
              : { bullet: { level } }),
          }),
        );
      } else if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...listBlocks(child, ctx, Math.min(level + 1, 8)));
      } else {
        out.push(...blocks([child], ctx));
      }
    }
  }
  return out;
}

function tableBlock(node: TiptapNode, ctx: Ctx): Table {
  const rows = node.content ?? [];
  const columns = Math.max(1, ...rows.map((r) => (r.content ?? []).length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((r, rowIndex) => {
      const isHeader = (r.content ?? []).every((c) => c.type === 'tableHeader');
      return new TableRow({
        tableHeader: isHeader && rowIndex === 0, // Kopfzeile auf jeder Seite wiederholen
        children: (r.content ?? []).map(
          (c) =>
            new TableCell({
              width: { size: Math.floor(100 / columns), type: WidthType.PERCENTAGE },
              columnSpan: Number(c.attrs?.colspan ?? 1),
              rowSpan: Number(c.attrs?.rowspan ?? 1),
              shading: c.type === 'tableHeader' ? { fill: 'E7E6E6' } : undefined,
              margins: { top: 40, bottom: 40, left: 80, right: 80 }, // Innenabstand (Twips)
              children: blocks(c.content, ctx).map((b) =>
                // Kopfzellen fett: Absätze neu bauen statt Formatvorlage – bleibt in Word bearbeitbar
                b instanceof Paragraph && c.type === 'tableHeader'
                  ? new Paragraph({ children: (c.content ?? []).flatMap((pn) => (pn.content ?? []).map((tn) => new TextRun({ text: plainText(tn), bold: true }))) })
                  : b,
              ),
            }),
        ),
      });
    }),
  });
}

function figureBlocks(node: TiptapNode, ctx: Ctx): Block[] {
  const mediaId = String(node.attrs?.mediaId ?? '');
  const caption = String(node.attrs?.caption ?? '');
  const media = ctx.opts.resolveMedia(mediaId);
  const out: Block[] = [];
  if (!media) {
    ctx.warnings.push(`Bild ${mediaId} fehlt – Platzhalter exportiert`);
    out.push(new Paragraph({ children: [new TextRun({ text: `[Bild fehlt: ${mediaId}]`, italics: true })] }));
  } else {
    // Seitenverhältnis behalten, auf Satzspiegel und maximale Höhe begrenzen
    const scale = Math.min(1, TEXT_WIDTH_PX / media.widthPx, MAX_IMAGE_HEIGHT_PX / media.heightPx);
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true, // Bild und Legende nicht über einen Seitenumbruch trennen
        children: [
          new ImageRun({
            type: media.type,
            data: media.data,
            transformation: { width: Math.round(media.widthPx * scale), height: Math.round(media.heightPx * scale) },
            altText: { name: mediaId, title: caption, description: String(node.attrs?.alt ?? caption) },
          }),
        ],
      }),
    );
  }
  // Legende: «Abbildung 3: …» – Nummer ist ein SEQ-Feld (Word zählt beim Aktualisieren
  // selbst). Wir schreiben die Nummer zusätzlich als vorberechneten Wert ins Feld,
  // sonst zeigen LibreOffice und die Word-Vorschau nur «Abbildung :».
  ctx.figureNo++;
  out.push(
    new Paragraph({
      style: 'Caption',
      alignment: AlignmentType.CENTER,
      children: [new TextRun('Abbildung '), new SimpleField('SEQ Abbildung \\* ARABIC', String(ctx.figureNo)), new TextRun(caption ? `: ${caption}` : '')],
    }),
  );
  return out;
}

function blocks(nodes: TiptapNode[] | undefined, ctx: Ctx): Block[] {
  const out: Block[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case 'paragraph':
        out.push(new Paragraph({ children: inlineChildren(node.content, ctx) }));
        break;
      case 'heading': {
        // Editor-H2 → Word-Überschrift 3, Editor-H3 → Überschrift 4
        const level = Number(node.attrs?.level ?? 2);
        out.push(new Paragraph({ heading: level <= 2 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4, children: inlineChildren(node.content, ctx) }));
        break;
      }
      case 'bulletList':
      case 'orderedList':
        out.push(...listBlocks(node, ctx, 0));
        break;
      case 'table':
        out.push(tableBlock(node, ctx));
        out.push(new Paragraph('')); // Abstand nach Tabelle
        break;
      case 'figure':
        out.push(...figureBlocks(node, ctx));
        break;
      default:
        ctx.warnings.push(`Unbekannter Block «${node.type}» als Text ausgegeben`);
        out.push(new Paragraph(plainText(node)));
    }
  }
  return out;
}

// --- Ein Journal als Folge von Word-Blöcken --------------------------------

function journalBlocks(j: Journal, ctx: Ctx): Block[] {
  const meta = [
    `Arbeitsdatum: ${formatDateCH(j.workDate)}`,
    `Lehrjahr ${j.schoolYear}`,
    `Lernort: ${LEARNING_PLACE_LABEL[j.learningPlace]}`,
  ].join('  ·  ');
  const out: Block[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new Bookmark({ id: bookmarkFor(j.id), children: [new TextRun(j.title)] })],
    }),
    new Paragraph({ style: 'Meta', children: [new TextRun(meta)] }),
  ];
  if (j.categories.length) out.push(new Paragraph({ style: 'Meta', children: [new TextRun(`Kategorien: ${j.categories.join(', ')}`)] }));
  if (j.tags.length) out.push(new Paragraph({ style: 'Meta', children: [new TextRun(`Schlagwörter: ${j.tags.join(', ')}`)] }));

  for (const [key, title] of SECTION_TITLES) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(title)] }));
    const section = j.sections[key];
    const hasContent = plainText(section).trim().length > 0 || JSON.stringify(section).includes('"figure"');
    // Leere Abschnitte: Hilfetexte sind Platzhalter und werden NICHT exportiert (SPEC).
    out.push(...(hasContent ? blocks(section.content, ctx) : [new Paragraph({ children: [new TextRun({ text: '–', color: '808080' })] })]));
  }
  return out;
}

// --- Gemeinsame Formatvorlagen, Nummerierung, Fusszeile ---------------------

function documentShell(opts: ExportOptions, title: string, children: Block[], withToc: boolean): Document {
  const font = opts.font ?? 'Calibri';
  const size = (opts.fontSizePt ?? 11) * 2; // docx rechnet in halben Punkten
  return new Document({
    creator: opts.authorName,
    title,
    description: 'Exportiert aus Lernjournal (inoffizielles Hilfsmittel)',
    features: { updateFields: withToc }, // Word fragt beim Öffnen, ob Felder (TOC) aktualisiert werden sollen
    styles: {
      default: {
        document: { run: { font, size, language: { value: 'de-CH' } } },
        heading1: { run: { font, size: 32, bold: true, color: '1F3864' }, paragraph: { keepNext: true, spacing: { before: 0, after: 120 } } },
        heading2: { run: { font, size: 26, bold: true, color: '2F5496' }, paragraph: { keepNext: true, spacing: { before: 280, after: 80 } } },
        heading3: { run: { font, size: 23, bold: true }, paragraph: { keepNext: true, spacing: { before: 200, after: 60 } } },
        heading4: { run: { font, size: size, bold: true, italics: true }, paragraph: { keepNext: true } },
        hyperlink: { run: { color: '0563C1', underline: {} } },
      },
      paragraphStyles: [
        { id: 'Caption', name: 'caption', basedOn: 'Normal', next: 'Normal', run: { size: 18, italics: true, color: '404040' }, paragraph: { spacing: { after: 200 } } },
        { id: 'TOCHeading', name: 'TOC Heading', basedOn: 'Normal', next: 'Normal', run: { size: 32, bold: true, color: '1F3864' }, paragraph: { spacing: { after: 200 } } },
        { id: 'Meta', name: 'Journal-Metadaten', basedOn: 'Normal', run: { size: 18, color: '595959' }, paragraph: { spacing: { after: 40 } } },
        { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 48, bold: true, color: '1F3864' }, paragraph: { spacing: { before: 2400, after: 240 } } },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'nummeriert',
          levels: [0, 1, 2].map((level) => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level],
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 1418, bottom: 1418, left: 1418, right: 1418 } }, // A4, 2.5 cm
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF', space: 4 } },
                tabStops: [{ type: 'right', position: 9070 }],
                children: [
                  new TextRun({ text: `${opts.authorName} – Lernjournal`, size: 16, color: '595959' }),
                  new TextRun({ children: ['\tSeite ', PageNumber.CURRENT, ' von ', PageNumber.TOTAL_PAGES], size: 16, color: '595959' }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

// --- Öffentliche Funktionen -------------------------------------------------

export function exportSingle(j: Journal, opts: ExportOptions) {
  const ctx: Ctx = { opts, exportedIds: new Set([j.id]), warnings: [], listInstance: 0, figureNo: 0 };
  const doc = documentShell(opts, j.title, journalBlocks(j, ctx), false);
  return { doc, warnings: ctx.warnings };
}

export function exportCollection(title: string, items: Journal[], opts: ExportOptions) {
  const ctx: Ctx = { opts, exportedIds: new Set(items.map((j) => j.id)), warnings: [], listInstance: 0, figureNo: 0 };
  const children: Block[] = [
    // Titelseite
    new Paragraph({ style: 'Title', children: [new TextRun(title)] }),
    new Paragraph({ children: [new TextRun({ text: opts.authorName, size: 28 })] }),
    new Paragraph({ children: [new TextRun({ text: `${items.length} Lerndokumentationen`, size: 24, color: '595959' })] }),
    new Paragraph({ children: [new PageBreak()] }),
    // Inhaltsverzeichnis: Feld über Überschrift 1–2. docx füllt die Einträge
    // bereits vor (ohne Seitenzahlen); Word aktualisiert Seitenzahlen beim Öffnen.
    // Eigene Formatvorlage statt Überschrift 1 – sonst stünde «Inhaltsverzeichnis» im eigenen Verzeichnis
    new Paragraph({ style: 'TOCHeading', children: [new TextRun('Inhaltsverzeichnis')] }),
    new TableOfContents('Inhaltsverzeichnis', { hyperlink: true, headingStyleRange: '1-2' }) as unknown as Paragraph,
  ];
  for (const j of items) {
    children.push(new Paragraph({ children: [new PageBreak()] })); // klare Journal-Grenzen
    children.push(...journalBlocks(j, ctx));
  }
  const doc = documentShell(opts, title, children, true);
  return { doc, warnings: ctx.warnings };
}

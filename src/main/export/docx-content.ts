// Tiptap-JSON → native Word-Elemente (Bibliothek `docx`, ADR 0002).
// Überführt aus dem Spike `spikes/aj-00b-docx/src/to-docx.ts` (AJ-00b) und
// für die App ergänzt (Listen mit mehreren Absätzen, Kopfzellen mit beliebigem
// Inhalt, Bilder in Tabellen, ungültige XML-Zeichen, Startnummer von Listen).
//
// Grundsatz (SPEC «Word-Export»): Jeder erlaubte Editor-Knoten hat eine feste
// Abbildung auf ein natives Word-Element – kein HTML-Pseudoexport. So bleibt
// das Dokument in Word normal bearbeitbar (Formatvorlagen, echte Listen …).
//
//   Absatz                  → Formatvorlage «Standard»
//   Editor-Überschrift 2/3  → «Überschrift 3/4» (1 = Journaltitel, 2 = Abschnitt)
//   Fett/Kursiv/Unterstr.   → Zeichenformat (auch Durchgestrichen)
//   Aufzählung              → Word-Aufzählung
//   Nummerierung            → Word-Nummerierung, jede Liste neu ab 1 (bzw. Startwert)
//   Tabelle                 → Word-Tabelle, Kopfzeile wiederholt sich auf jeder Seite
//   Bild + Legende          → Bild + «Beschriftung» mit Feld SEQ Abbildung
//   Link zu Journal         → Sprung zur Textmarke, wenn das Ziel im selben
//                             Dokument steht (Sammel-DOCX, AJ-13), sonst Text
//                             mit Hinweis auf das Journal
//   Weblink (http/https)    → echter Hyperlink
//   harter Umbruch          → Zeilenumbruch
//   Hinweisbox (AJ-28)      → einzellige Tabelle mit farbigem Rand links und
//                             fetter Beschriftung «Merke»/«Achtung»/«Tipp»
//   Checkliste (AJ-29)      → Absätze mit ☐ bzw. ☑
//   Rechenblock (AJ-31)     → zweispaltige Tabelle Gegeben/Formel/Rechnung/Ergebnis
//   Schlagwort-Querverweis  → normaler Text (AJ-27)
//   Merkstelle (AJ-33)      → normaler Text (die Markierung ist nur in der App)
//   beschriftetes Bild      → zusammengerechnetes Bild (AJ-32, export-service.ts)
//
// Unbekanntes geht NIE verloren: Text wird als normaler Absatz ausgegeben und
// eine Warnung gesammelt (Datenintegrität vor Schönheit).
//
// Die Funktionen hier sind rein (keine Datei-, DB- oder Electron-Zugriffe):
// Bilder kommen bereits geladen über `media`, Titel verlinkter Journale über
// `linkTitles`. Dadurch ist die Abbildung mit Golden Files testbar.
import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Paragraph,
  SimpleField,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ILevelsOptions,
  type INumberingOptions,
  type ParagraphChild,
} from 'docx';
import { annotatedMediaKey } from '@shared/annotation-key';
import { CALC_LABELS, CALLOUT_LABELS, type CalcRole, type CalloutKind } from '@shared/editor-schema';
import { journalIdFromHref, tagIdFromHref } from '@shared/links';

// --- Eingaben ---------------------------------------------------------------

// Tiptap-JSON, bewusst locker typisiert: Der Inhalt wurde beim Speichern
// bereits gegen das Editor-Schema geprüft (validateSections).
export type TiptapMark = { type: string; attrs?: Record<string, unknown> };
export type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
};

// Ein Bild, fertig zum Einbetten. Word kann nur PNG und JPEG sicher anzeigen;
// WebP wandelt der Exportdienst vorher in PNG um (siehe image-convert.ts).
export type DocxImage = { data: Uint8Array; type: 'png' | 'jpg'; widthPx: number; heightPx: number };
export type MediaResolver = (mediaId: string) => DocxImage | undefined;

// --- Masse ------------------------------------------------------------------

// Word rechnet Seitenmasse in Twips (1/20 Punkt, 1440 je Zoll), `docx` Bilder
// in Pixeln bei 96 dpi. Umrechnung zentral, damit Ränder und Bildbreiten passen.
export const TWIPS_PER_CM = 1440 / 2.54;
export const PX_PER_CM = 96 / 2.54;
export const cmToTwips = (cm: number) => Math.round(cm * TWIPS_PER_CM);
export const cmToPx = (cm: number) => Math.round(cm * PX_PER_CM);

// Bilder höchstens 12 cm hoch, damit Bild und Legende auf eine Seite passen
export const MAX_IMAGE_HEIGHT_CM = 12;
// Innenabstand der Tabellenzellen (links + rechts) in Twips
const CELL_MARGIN_TWIPS = 80;

// Bild proportional in einen Rahmen einpassen; nie vergrössern (sonst
// würden kleine Screenshots unscharf aufgeblasen).
export function fitImage(
  widthPx: number,
  heightPx: number,
  maxWidthPx: number,
  maxHeightPx: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidthPx / widthPx, maxHeightPx / heightPx);
  return {
    width: Math.max(1, Math.round(widthPx * scale)),
    height: Math.max(1, Math.round(heightPx * scale)),
  };
}

// --- Hilfsfunktionen --------------------------------------------------------

// Schweizer Datumsformat 14.03.2026 – reine Textzerlegung, keine Zeitzonen-Falle
export function formatDateCH(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return d && m && y ? `${d}.${m}.${y}` : isoDate;
}

// Word-Textmarken: höchstens 40 Zeichen, nur Buchstaben/Ziffern/_ und mit
// einem Buchstaben am Anfang. Aus der Journal-ID abgeleitet, damit Links im
// Sammel-DOCX (AJ-13) ihr Ziel finden.
export function bookmarkFor(journalId: string): string {
  return `j_${journalId.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 40);
}

// Zeichen, die in XML 1.0 verboten sind (Steuerzeichen, einzelne Surrogate,
// U+FFFE/U+FFFF). Sie können über Einfügen aus anderen Programmen in den Text
// geraten; im DOCX würde Word sonst «unlesbarer Inhalt» melden.
// Als Text mit doppelten Backslashes, damit die Zeichen lesbar (und für den
// Formatierer unantastbar) als \uXXXX-Folgen dastehen.
const XML_INVALID = new RegExp(
  [
    '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]', // Steuerzeichen, Nicht-Zeichen
    '[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])', // hohes Surrogat ohne Partner
    '(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]', // tiefes Surrogat ohne Partner
  ].join('|'),
  'g',
);
export function cleanText(text: string): string {
  return text.replace(XML_INVALID, '');
}

// Reiner Text eines Knotens (Rückfall für Unbekanntes)
export function plainText(node: TiptapNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(plainText).join(node.type === 'paragraph' ? '' : ' ');
}

// --- Kontext eines Exports --------------------------------------------------

// Läuft durch EIN Word-Dokument. Ein Sammel-DOCX (AJ-13) verwendet einen
// gemeinsamen Kontext für alle Journale, damit Abbildungsnummern und Listen
// durchgehend zählen und Links zwischen den Journalen funktionieren.
export type ContentContext = {
  media: MediaResolver;
  // Journale, die in DIESEM Dokument stehen (Ziel für interne Sprünge)
  inDocument: ReadonlySet<string>;
  // Titel von Journalen, auf die im Text verlinkt wird (für den Hinweis im Text)
  linkTitles: ReadonlyMap<string, string>;
  // Breite des Satzspiegels in Pixeln (Bilder) und Twips (Tabellen)
  textWidthPx: number;
  textWidthTwips: number;
  // Hinweise für die Oberfläche (ohne Doppelte)
  warnings: Set<string>;
  // Zähler: jede nummerierte Liste eine eigene Instanz → beginnt wieder bei 1
  listInstance: number;
  // laufende Abbildungsnummer (vorberechneter Wert im SEQ-Feld)
  figureNo: number;
  // Startwerte nummerierter Listen ≠ 1 (je eine eigene Nummerierungsvorlage)
  listStarts: Set<number>;
};

export function createContentContext(input: {
  media: MediaResolver;
  inDocument: Iterable<string>;
  linkTitles?: ReadonlyMap<string, string>;
  textWidthCm: number;
}): ContentContext {
  return {
    media: input.media,
    inDocument: new Set(input.inDocument),
    linkTitles: input.linkTitles ?? new Map(),
    textWidthPx: cmToPx(input.textWidthCm),
    textWidthTwips: cmToTwips(input.textWidthCm),
    warnings: new Set(),
    listInstance: 0,
    figureNo: 0,
    listStarts: new Set(),
  };
}

// Umgebung, in der ein Block steht: im Fliesstext oder in einer Tabellenzelle
type Scope = {
  bold: boolean; // Kopfzellen: ganzer Text fett (bleibt in Word normal bearbeitbar)
  compact: boolean; // in Tabellenzellen: kein Abstand nach dem Absatz (niedrige Zeilen)
  maxImageWidthPx: number; // Bilder in Zellen nur so breit wie die Zelle
};
const bodyScope = (ctx: ContentContext): Scope => ({
  bold: false,
  compact: false,
  maxImageWidthPx: ctx.textWidthPx,
});

// --- Nummerierung (Word-Listen) ---------------------------------------------

const ORDERED_REF = 'lj-nummerierung';
const orderedRef = (start: number) => (start === 1 ? ORDERED_REF : `${ORDERED_REF}-${start}`);
const LIST_INDENT_TWIPS = 360; // Einzug je Ebene (0,63 cm wie in Word)
const MAX_LIST_LEVEL = 8; // Word kennt die Ebenen 0–8

// Einzug einer Listenebene; auch für Folgeabsätze im selben Listenpunkt
const listIndent = (level: number) => ({ left: LIST_INDENT_TWIPS * (level + 2), hanging: LIST_INDENT_TWIPS });

// Formatvorlagen für nummerierte Listen: 1. → a. → i. → 1. … (wie Word)
export function numberingConfig(ctx: ContentContext): INumberingOptions['config'] {
  const formats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
  const levels = (start: number): ILevelsOptions[] =>
    Array.from({ length: MAX_LIST_LEVEL + 1 }, (_, level) => ({
      level,
      format: formats[level % 3]!,
      text: `%${level + 1}.`,
      alignment: AlignmentType.START,
      start: level === 0 ? start : 1,
      style: { paragraph: { indent: listIndent(level) } },
    }));
  const starts = [1, ...[...ctx.listStarts].sort((a, b) => a - b)];
  return starts.map((start) => ({ reference: orderedRef(start), levels: levels(start) }));
}

// --- Inline-Inhalte ---------------------------------------------------------

function textRun(node: TiptapNode, scope: Scope, style?: string): TextRun {
  const has = (m: string) => node.marks?.some((x) => x.type === m) ?? false;
  return new TextRun({
    text: cleanText(node.text ?? ''),
    bold: scope.bold || has('bold') || undefined,
    italics: has('italic') || undefined,
    underline: has('underline') ? {} : undefined,
    strike: has('strike') || undefined,
    style,
  });
}

function inlineChildren(
  nodes: TiptapNode[] | undefined,
  ctx: ContentContext,
  scope: Scope,
): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      out.push(new TextRun({ break: 1 }));
      continue;
    }
    if (node.type !== 'text') {
      ctx.warnings.add(`Ein unbekanntes Textelement («${node.type}») wurde als normaler Text übernommen.`);
      out.push(new TextRun(cleanText(plainText(node))));
      continue;
    }
    const link = node.marks?.find((m) => m.type === 'link');
    const href = String(link?.attrs?.['href'] ?? '');
    const targetId = journalIdFromHref(href);
    if (!link || tagIdFromHref(href)) {
      // Querverweis auf ein Schlagwort (AJ-27): im Dokument einfach Text
      out.push(textRun(node, scope));
    } else if (targetId) {
      out.push(...journalLink(node, targetId, ctx, scope));
    } else if (/^https?:\/\//i.test(href)) {
      out.push(new ExternalHyperlink({ link: href, children: [textRun(node, scope, 'Hyperlink')] }));
    } else {
      // Andere Ziele (file:, javascript: …) lässt schon der Editor nicht zu;
      // falls doch eines ankommt: nur Text, nie verlinken.
      ctx.warnings.add('Ein Link mit unzulässigem Ziel wurde als normaler Text übernommen.');
      out.push(textRun(node, scope));
    }
  }
  return out;
}

// Link zu einem anderen Journal (AJ-10):
//  - Ziel steht im selben Dokument (Sammel-DOCX) → klickbarer Sprung zur Textmarke
//  - sonst bleibt der Text; nennt er das Ziel nicht schon, folgt der Hinweis
//    «(siehe Journal «Titel»)», damit Leserinnen und Leser wissen, worauf er zeigt.
function journalLink(
  node: TiptapNode,
  targetId: string,
  ctx: ContentContext,
  scope: Scope,
): ParagraphChild[] {
  if (ctx.inDocument.has(targetId)) {
    return [
      new InternalHyperlink({ anchor: bookmarkFor(targetId), children: [textRun(node, scope, 'Hyperlink')] }),
    ];
  }
  const title = ctx.linkTitles.get(targetId)?.trim();
  const shown = (node.text ?? '').trim().toLocaleLowerCase('de-CH');
  const out: ParagraphChild[] = [textRun(node, scope)];
  if (title && !shown.includes(title.toLocaleLowerCase('de-CH'))) {
    out.push(new TextRun({ text: cleanText(` (siehe Journal «${title}»)`), italics: true }));
  }
  return out;
}

// --- Block-Inhalte ----------------------------------------------------------

export type Block = Paragraph | Table;

function listBlocks(node: TiptapNode, ctx: ContentContext, scope: Scope, level: number): Block[] {
  const ordered = node.type === 'orderedList';
  const start = ordered ? Math.max(1, Math.floor(Number(node.attrs?.['start'] ?? 1)) || 1) : 1;
  if (ordered && start !== 1) ctx.listStarts.add(start);
  const instance = ordered ? ++ctx.listInstance : 0;
  const out: Block[] = [];
  for (const item of node.content ?? []) {
    // Nur der erste Absatz eines Listenpunkts bekommt Nummer bzw. Aufzählungszeichen;
    // weitere Absätze im selben Punkt stehen eingerückt darunter (wie in Word).
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type === 'paragraph') {
        const children = inlineChildren(child.content, ctx, scope);
        if (first) {
          out.push(
            new Paragraph({
              children,
              ...(ordered
                ? { numbering: { reference: orderedRef(start), level, instance } }
                : { bullet: { level } }),
            }),
          );
        } else {
          out.push(new Paragraph({ children, indent: { left: listIndent(level).left } }));
        }
      } else if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...listBlocks(child, ctx, scope, Math.min(level + 1, MAX_LIST_LEVEL)));
      } else {
        out.push(...blocks([child], ctx, scope));
      }
      first = false;
    }
  }
  return out;
}

function tableBlock(node: TiptapNode, ctx: ContentContext): Table {
  const rows = node.content ?? [];
  const span = (c: TiptapNode) => Math.max(1, Math.floor(Number(c.attrs?.['colspan'] ?? 1)) || 1);
  const columns = Math.max(1, ...rows.map((r) => (r.content ?? []).reduce((n, c) => n + span(c), 0)));
  // Feste Spaltenbreiten in Twips (statt Prozent): Word und LibreOffice zeigen
  // die Tabelle so gleich breit wie den Satzspiegel.
  const colTwips = Math.floor(ctx.textWidthTwips / columns);
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' };
  return new Table({
    width: { size: colTwips * columns, type: WidthType.DXA },
    columnWidths: Array.from({ length: columns }, () => colTwips),
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: rows.map((r, rowIndex) => {
      const cells = r.content ?? [];
      const headerRow = cells.length > 0 && cells.every((c) => c.type === 'tableHeader');
      return new TableRow({
        // Kopfzeile auf jeder Seite wiederholen (nur die erste Zeile)
        tableHeader: headerRow && rowIndex === 0,
        children: cells.map((c) => {
          const header = c.type === 'tableHeader';
          const width = colTwips * span(c);
          const scope: Scope = {
            bold: header,
            compact: true,
            maxImageWidthPx: Math.max(
              16,
              Math.floor(((width - 2 * CELL_MARGIN_TWIPS) / TWIPS_PER_CM) * PX_PER_CM),
            ),
          };
          const content = blocks(c.content, ctx, scope);
          return new TableCell({
            width: { size: width, type: WidthType.DXA },
            columnSpan: span(c) > 1 ? span(c) : undefined,
            rowSpan: Number(c.attrs?.['rowspan'] ?? 1) > 1 ? Number(c.attrs?.['rowspan']) : undefined,
            shading: header ? { fill: 'E7E6E6' } : undefined,
            margins: {
              top: 40,
              bottom: 40,
              left: CELL_MARGIN_TWIPS,
              right: CELL_MARGIN_TWIPS,
            },
            // Word verlangt mindestens einen Absatz pro Zelle
            children: content.length ? content : [new Paragraph({})],
          });
        }),
      });
    }),
  });
}

function figureBlocks(node: TiptapNode, ctx: ContentContext, scope: Scope): Block[] {
  const mediaId = String(node.attrs?.['mediaId'] ?? '');
  const caption = cleanText(String(node.attrs?.['caption'] ?? '').trim());
  const alt = cleanText(String(node.attrs?.['alt'] ?? '').trim());
  // Beschriftetes Bild (AJ-32): der Exportdienst hat Foto + Formen vorab zu
  // einem Bild zusammengerechnet; fehlt es, das Originalfoto verwenden.
  const annotated = annotatedMediaKey(mediaId, node.attrs?.['annotations']);
  const image = (annotated && ctx.media(annotated)) || ctx.media(mediaId);
  ctx.figureNo++;
  const out: Block[] = [];
  if (!image) {
    ctx.warnings.add('Ein Bild wurde nicht gefunden und ist im Dokument als «[Bild fehlt]» markiert.');
    out.push(
      new Paragraph({
        keepNext: true,
        children: [new TextRun({ text: '[Bild fehlt]', italics: true, color: '808080' })],
      }),
    );
  } else {
    const size = fitImage(image.widthPx, image.heightPx, scope.maxImageWidthPx, cmToPx(MAX_IMAGE_HEIGHT_CM));
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true, // Bild und Legende nicht über einen Seitenumbruch trennen
        children: [
          new ImageRun({
            type: image.type,
            data: image.data,
            transformation: size,
            // Alternativtext für Bildschirmleser (auch in Word sichtbar)
            altText: {
              name: `Abbildung ${ctx.figureNo}`,
              title: caption,
              description: alt || caption,
            },
          }),
        ],
      }),
    );
  }
  // Legende «Abbildung 3: …». Die Nummer ist ein SEQ-Feld (Word zählt beim
  // Aktualisieren selbst, und ein Abbildungsverzeichnis findet die Legenden).
  // Den Wert schreiben wir vorberechnet mit, sonst zeigen LibreOffice und die
  // Word-Vorschau nur «Abbildung :».
  out.push(
    new Paragraph({
      style: 'Caption',
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun('Abbildung '),
        new SimpleField('SEQ Abbildung \\* ARABIC', String(ctx.figureNo)),
        ...(caption ? [new TextRun(`: ${caption}`)] : []),
      ],
    }),
  );
  return out;
}

// Farben der Hinweisboxen (Rand links und heller Hintergrund)
const CALLOUT_COLORS: Record<CalloutKind, { border: string; fill: string }> = {
  merke: { border: '3A3771', fill: 'EEEDF6' },
  achtung: { border: 'C42B1C', fill: 'FDECEA' },
  tipp: { border: '0E7A0D', fill: 'E9F5E9' },
};

// Hinweisbox (AJ-28): einzellige Tabelle – bleibt in Word ein Block, den man
// verschieben und bearbeiten kann, und bricht sauber über Seiten um.
function calloutBlock(node: TiptapNode, ctx: ContentContext): Table {
  const kind = (Object.keys(CALLOUT_LABELS) as CalloutKind[]).includes(node.attrs?.['kind'] as CalloutKind)
    ? (node.attrs?.['kind'] as CalloutKind)
    : 'merke';
  const color = CALLOUT_COLORS[kind];
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const inner = blocks(node.content, ctx, { bold: false, compact: true, maxImageWidthPx: ctx.textWidthPx });
  return new Table({
    width: { size: ctx.textWidthTwips, type: WidthType.DXA },
    columnWidths: [ctx.textWidthTwips],
    borders: {
      top: none,
      bottom: none,
      right: none,
      insideHorizontal: none,
      insideVertical: none,
      left: { style: BorderStyle.SINGLE, size: 24, color: color.border },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: ctx.textWidthTwips, type: WidthType.DXA },
            shading: { fill: color.fill },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [
              new Paragraph({
                spacing: { after: 40 },
                children: [new TextRun({ text: CALLOUT_LABELS[kind], bold: true, color: color.border })],
              }),
              ...inner,
            ],
          }),
        ],
      }),
    ],
  });
}

// Checkliste (AJ-29): ☐/☑ vor dem ersten Absatz jedes Punkts
function taskListBlocks(node: TiptapNode, ctx: ContentContext, scope: Scope): Block[] {
  const out: Block[] = [];
  for (const item of node.content ?? []) {
    const box = item.attrs?.['checked'] === true ? '☑' : '☐';
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type === 'paragraph') {
        out.push(
          new Paragraph({
            indent: { left: LIST_INDENT_TWIPS * 2, hanging: first ? LIST_INDENT_TWIPS : 0 },
            spacing: scope.compact ? { after: 0 } : { after: 60 },
            children: [
              ...(first ? [new TextRun({ text: `${box}\t` })] : []),
              ...inlineChildren(child.content, ctx, scope),
            ],
          }),
        );
      } else out.push(...blocks([child], ctx, scope));
      first = false;
    }
  }
  return out;
}

// Rechenblock (AJ-31): Beschriftung links, Inhalt rechts; Ergebnis fett
function calculationBlock(node: TiptapNode, ctx: ContentContext): Table {
  const labelTwips = cmToTwips(3);
  const contentTwips = ctx.textWidthTwips - labelTwips;
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return new Table({
    width: { size: ctx.textWidthTwips, type: WidthType.DXA },
    columnWidths: [labelTwips, contentTwips],
    borders: {
      top: border,
      bottom: border,
      left: none,
      right: none,
      insideHorizontal: border,
      insideVertical: none,
    },
    rows: (node.content ?? []).map((line) => {
      const role = String(line.attrs?.['role'] ?? 'given') as CalcRole;
      const result = role === 'result';
      const scope: Scope = { bold: result, compact: true, maxImageWidthPx: ctx.textWidthPx };
      return new TableRow({
        children: [
          new TableCell({
            width: { size: labelTwips, type: WidthType.DXA },
            margins: { top: 40, bottom: 40, left: CELL_MARGIN_TWIPS, right: CELL_MARGIN_TWIPS },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [new TextRun({ text: CALC_LABELS[role] ?? '', bold: true })],
              }),
            ],
          }),
          new TableCell({
            width: { size: contentTwips, type: WidthType.DXA },
            margins: { top: 40, bottom: 40, left: CELL_MARGIN_TWIPS, right: CELL_MARGIN_TWIPS },
            children: [
              new Paragraph({ spacing: { after: 0 }, children: inlineChildren(line.content, ctx, scope) }),
            ],
          }),
        ],
      });
    }),
  });
}

function blocks(nodes: TiptapNode[] | undefined, ctx: ContentContext, scope: Scope): Block[] {
  const out: Block[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case 'paragraph':
        out.push(
          new Paragraph({
            children: inlineChildren(node.content, ctx, scope),
            spacing: scope.compact ? { after: 0 } : undefined,
          }),
        );
        break;
      case 'heading': {
        // Editor-Überschrift 2 → Word «Überschrift 3», Editor-3 → «Überschrift 4».
        // Überschrift 1 und 2 sind Journaltitel und Abschnitte (Inhaltsverzeichnis).
        const level = Number(node.attrs?.['level'] ?? 2);
        out.push(
          new Paragraph({
            heading: level <= 2 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4,
            children: inlineChildren(node.content, ctx, scope),
          }),
        );
        break;
      }
      case 'bulletList':
      case 'orderedList':
        out.push(...listBlocks(node, ctx, scope, 0));
        break;
      case 'table':
        out.push(tableBlock(node, ctx));
        // Absatz nach der Tabelle: Abstand zum Folgetext; zwei Tabellen
        // verschmelzen sonst, und eine Zelle muss mit einem Absatz enden.
        out.push(new Paragraph({}));
        break;
      case 'figure':
        out.push(...figureBlocks(node, ctx, scope));
        break;
      case 'callout':
        out.push(calloutBlock(node, ctx), new Paragraph({}));
        break;
      case 'taskList':
        out.push(...taskListBlocks(node, ctx, scope));
        break;
      case 'calculation':
        out.push(calculationBlock(node, ctx), new Paragraph({}));
        break;
      default:
        ctx.warnings.add(`Ein unbekannter Inhalt («${node.type}») wurde als normaler Text übernommen.`);
        out.push(new Paragraph({ children: [new TextRun(cleanText(plainText(node)))] }));
    }
  }
  return out;
}

// Inhalt eines Abschnitts (Tiptap-Dokument «doc») als Word-Blöcke
export function contentBlocks(doc: TiptapNode, ctx: ContentContext): Block[] {
  return blocks(doc.content, ctx, bodyScope(ctx));
}

// Hat ein Abschnitt Inhalt? Leere Absätze zählen nicht; Bilder und Tabellen schon.
// (Hilfetexte im Editor sind nur Platzhalter und stehen nicht im JSON.)
export function hasContent(doc: TiptapNode): boolean {
  const walk = (n: TiptapNode): boolean =>
    (n.type === 'text' && (n.text ?? '').trim().length > 0) ||
    n.type === 'figure' ||
    n.type === 'table' ||
    n.type === 'calculation' ||
    (n.content ?? []).some(walk);
  return walk(doc);
}

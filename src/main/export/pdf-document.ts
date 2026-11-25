// Gemeinsame aufbereitete Journaldaten, eigenes Drucklayout für PDF (AJ-18).
import { annotationSvg, describeAnnotations, parseAnnotations } from '@shared/annotations';
import { CALC_LABELS, CALLOUT_LABELS, type CalcRole, type CalloutKind } from '@shared/editor-schema';
import { journalIdFromHref } from '@shared/links';
import {
  cleanText,
  formatDateCH,
  hasContent,
  plainText,
  type DocxImage,
  type TiptapNode,
} from './docx-content';
import { collectionTitle, periodText, professionText, type CollectionInfo } from './docx-collection';
import { displayTitle, journalMetaLines, type ExportAuthor, type ExportJournal } from './docx-journal';

export type PdfDocument = { html: string; images: ReadonlyMap<string, DocxImage> };

type PdfInput = {
  journals: ExportJournal[];
  author: ExportAuthor;
  images: ReadonlyMap<string, DocxImage>;
  linkTitles: ReadonlyMap<string, string>;
  collection?: CollectionInfo;
};

const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const html = (text: string) => cleanText(text).replace(/[&<>"']/g, (c) => entities[c]!);

const STYLES = `
@page {
  size: A4; margin: 19mm 19mm 20mm;
  @bottom-right { content: 'Seite ' counter(page) ' von ' counter(pages); color: #555; font: 9pt Arial, sans-serif; }
}
@page cover { @bottom-right { content: none; } }
html { color-scheme: light; }
body { margin: 0; color: #202028; background: white; font: 10.5pt/1.42 'Segoe UI', Arial, sans-serif; overflow-wrap: anywhere; }
h1, h2, h3, h4 { color: #343449; line-height: 1.25; break-after: avoid; }
h1 { font-size: 24pt; margin: 0 0 5mm; }
h2 { font-size: 15pt; margin: 6mm 0 2mm; }
h3 { font-size: 12pt; margin: 4mm 0 2mm; }
h4 { font-size: 11pt; margin: 3mm 0 1mm; }
p { margin: 0 0 2.2mm; orphans: 2; widows: 2; white-space: pre-wrap; }
ul, ol { margin: 0 0 3mm; padding-left: 7mm; }
li p { margin-bottom: 1mm; }
a { color: #3a3771; text-decoration: underline; }
.cover { page: cover; padding-top: 35mm; }
.cover h1 { font-size: 32pt; padding-bottom: 6mm; border-bottom: 1pt solid #aaa7b8; }
.cover .profile { margin: 7mm 0; }
.cover .origin { margin-top: 14mm; }
.contents, .collection article { break-before: page; }
.contents li { padding: 1.5mm 0; break-inside: avoid; }
.contents time { color: #555; margin-left: 2mm; }
.meta { font-size: 9.5pt; color: #494958; border-bottom: .5pt solid #bab8c3; padding-bottom: 3mm; }
.empty { color: #646474; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0 0 3mm; }
thead { display: table-header-group; }
th, td { border: .5pt solid #8e8d9e; text-align: left; vertical-align: top; padding: 1.6mm 2mm; }
th { background: #eeedf4; }
th > :last-child, td > :last-child { margin-bottom: 0; }
figure { break-inside: avoid; text-align: center; margin: 4mm 0; }
img { display: block; margin: 0 auto; max-width: 100%; max-height: 120mm; object-fit: contain; }
figcaption { margin-top: 1.6mm; color: #4e4d60; font-size: 9pt; }
.annotated { position: relative; display: inline-block; max-width: 100%; }
.annotated img { max-height: 120mm; }
.annotated svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.callout { break-inside: avoid; margin: 0 0 3mm; padding: 2mm 3mm; border-left: 1.4mm solid #3a3771; background: #eeedf6; }
.callout-achtung { border-color: #c42b1c; background: #fdecea; }
.callout-tipp { border-color: #0e7a0d; background: #e9f5e9; }
.callout-label { font-weight: 700; margin-bottom: 1mm; }
.callout > :last-child { margin-bottom: 0; }
ul.tasks { list-style: none; padding-left: 1mm; }
ul.tasks li { display: flex; gap: 2mm; }
ul.tasks .box { flex: none; }
table.calc th { width: 30mm; background: none; }
table.calc tr.result td { font-weight: 700; }
`;

function renderCover(journals: ExportJournal[], author: ExportAuthor, info: CollectionInfo): string {
  const profile = [author.displayName.trim(), author.company?.trim(), professionText(info.specialization)]
    .filter(Boolean)
    .map((line) => `<p>${html(line!)}</p>`)
    .join('');
  const period = periodText(journals);
  const count = journals.length === 1 ? '1 Journal' : `${journals.length} Journale`;
  return `<header class="cover"><h1>${html(collectionTitle(info.title))}</h1><div class="profile">${profile}</div>
    ${period ? `<p>Zeitraum: ${html(period)}</p>` : ''}<p>${count}</p>
    <p class="origin">Erstellt am ${html(formatDateCH(info.createdOn))} mit Lernjournal (inoffizielles Hilfsmittel)</p></header>
    <nav class="contents" aria-label="Inhaltsverzeichnis"><h2>Inhaltsverzeichnis</h2><ol>${journals
      .map(
        (j) =>
          `<li><a href="#journal-${html(j.id)}">${html(displayTitle(j.title))}</a><time>${html(formatDateCH(j.workDate))}</time></li>`,
      )
      .join('')}</ol></nav>`;
}

export function buildPdfDocument(input: PdfInput): { document: PdfDocument; warnings: string[] } {
  const included = new Set(input.collection ? input.journals.map((j) => j.id) : []);
  const warnings: string[] = [];
  let missingImage = false;
  let figureNumber = 0;

  function render(node: TiptapNode): string {
    const children = () => node.content?.map(render).join('') ?? '';
    switch (node.type) {
      case 'text': {
        let text = html(node.text ?? '');
        for (const mark of node.marks ?? []) {
          switch (mark.type) {
            case 'bold':
              text = `<strong>${text}</strong>`;
              break;
            case 'italic':
              text = `<em>${text}</em>`;
              break;
            case 'underline':
              text = `<u>${text}</u>`;
              break;
            case 'link': {
              const id = journalIdFromHref(mark.attrs?.['href']);
              if (!id) break; // Webadressen bleiben Text.
              const title = input.linkTitles.get(id);
              if (included.has(id)) text = `<a href="#journal-${html(id)}">${text}</a>`;
              else if (title && !node.text?.includes(title)) text += ` (siehe Journal «${html(title)}»)`;
              break;
            }
          }
        }
        return text;
      }
      case 'paragraph':
        return `<p>${children() || '<br>'}</p>`;
      case 'heading': {
        const tag = node.attrs?.['level'] === 3 ? 'h4' : 'h3';
        return `<${tag}>${children()}</${tag}>`;
      }
      case 'hardBreak':
        return '<br>';
      case 'bulletList':
        return `<ul>${children()}</ul>`;
      case 'orderedList': {
        const start = node.attrs?.['start'];
        return `<ol start="${typeof start === 'number' && Number.isSafeInteger(start) ? start : 1}">${children()}</ol>`;
      }
      case 'listItem':
        return `<li>${children()}</li>`;
      case 'table': {
        const rows = node.content ?? [];
        const firstBody = rows.findIndex((row) => !row.content?.every((cell) => cell.type === 'tableHeader'));
        const head = firstBody < 0 ? rows.length : firstBody;
        return `<table>${head ? `<thead>${rows.slice(0, head).map(render).join('')}</thead>` : ''}<tbody>${rows.slice(head).map(render).join('')}</tbody></table>`;
      }
      case 'tableRow':
        return `<tr>${children()}</tr>`;
      case 'tableHeader':
        return `<th scope="col">${children()}</th>`;
      case 'tableCell':
        return `<td>${children()}</td>`;
      case 'figure': {
        const id = String(node.attrs?.['mediaId'] ?? '');
        if (!input.images.has(id)) missingImage = true;
        const caption = String(node.attrs?.['caption'] ?? '').trim();
        const alt = String(node.attrs?.['alt'] ?? '').trim() || caption;
        // Bildbeschriftung (AJ-32): SVG deckungsgleich über dem Foto
        const notes = parseAnnotations(node.attrs?.['annotations']);
        const image = input.images.get(id);
        const fullAlt = notes.length
          ? `${alt}${alt ? ' – ' : ''}Beschriftet: ${describeAnnotations(notes)}`
          : alt;
        const img = `<img src="./image/${encodeURIComponent(id)}" alt="${html(fullAlt)}">`;
        const picture = image
          ? notes.length
            ? `<span class="annotated">${img}${annotationSvg(notes, image.widthPx, image.heightPx).replace('<svg ', '<svg aria-hidden="true" ')}</span>`
            : img
          : '<p>[Bild fehlt]</p>';
        return `<figure>${picture}<figcaption>Abbildung ${++figureNumber}${caption ? `: ${html(caption)}` : ''}</figcaption></figure>`;
      }
      case 'callout': {
        const kind = node.attrs?.['kind'] as CalloutKind;
        const label = CALLOUT_LABELS[kind] ?? 'Merke';
        return `<aside class="callout callout-${html(String(kind))}"><p class="callout-label">${html(label)}</p>${children()}</aside>`;
      }
      case 'taskList':
        return `<ul class="tasks">${children()}</ul>`;
      case 'taskItem':
        return `<li><span class="box">${node.attrs?.['checked'] === true ? '☑' : '☐'}</span><div>${children()}</div></li>`;
      case 'calculation':
        return `<table class="calc"><tbody>${children()}</tbody></table>`;
      case 'calcLine': {
        const role = String(node.attrs?.['role']) as CalcRole;
        return `<tr${role === 'result' ? ' class="result"' : ''}><th scope="row">${html(CALC_LABELS[role] ?? '')}</th><td>${children()}</td></tr>`;
      }
      case 'doc':
        return children();
      default:
        return html(plainText(node));
    }
  }

  const articles = input.journals
    .map((j) => {
      missingImage = false;
      const metadata = journalMetaLines(j, input.author)
        .map(
          (line) =>
            `<p>${line
              .map(([label, value]) =>
                label ? `<strong>${html(label)}:</strong> ${html(value)}` : html(value),
              )
              .join(' · ')}</p>`,
        )
        .join('');
      const sections = j.sections
        .map(({ heading, doc }) => {
          const title = heading ? `<h2>${html(heading)}</h2>` : '';
          const body = hasContent(doc) ? render(doc) : heading ? '<p class="empty">–</p>' : '';
          return `${title}${body}`;
        })
        .join('');
      const title = displayTitle(j.title);
      if (missingImage)
        warnings.push(`«${title}»: Ein Bild wurde nicht gefunden und ist als «[Bild fehlt]» markiert.`);
      return `<article id="journal-${html(j.id)}"><h1>${html(title)}</h1><div class="meta">${metadata}</div>${sections}</article>`;
    })
    .join('');

  const title = input.collection
    ? collectionTitle(input.collection.title)
    : displayTitle(input.journals[0]!.title);
  const cover = input.collection ? renderCover(input.journals, input.author, input.collection) : '';
  return {
    document: {
      html: `<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><title>${html(title)}</title>
      <style>${STYLES}</style></head><body class="${input.collection ? 'collection' : ''}">${cover}${articles}</body></html>`,
      images: input.images,
    },
    warnings,
  };
}

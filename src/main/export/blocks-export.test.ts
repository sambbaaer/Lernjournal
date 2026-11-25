// Neue Editor-Bausteine (AJ-27 bis AJ-33) durch alle Schichten:
// Prüfung (Schema), Klartext (MCP), Suchindex, Word- und PDF-Export.
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { annotatedMediaKey } from '@shared/annotation-key';
import { annotationSvg, parseAnnotations, type Annotation } from '@shared/annotations';
import { InvalidContentError, validateSections } from '@shared/editor-schema';
import { plainTextOf, type Sections } from '@shared/journal';
import { tagLinkHref } from '@shared/links';
import { collectMerkstellen } from '@shared/merkstellen';
import { projectSections } from '../search/projection';
import type { DocxImage, TiptapNode } from './docx-content';
import { buildJournalDocument, packDocx } from './docx-document';
import type { ExportJournal } from './docx-journal';
import { annotatedFigures } from './export-service';
import { AUTHOR, JOURNAL, LINK_TITLES } from './fixtures';
import { buildPdfDocument } from './pdf-document';

const TAG = '7e0c3f5a-1b2d-4c6e-9f80-a1b2c3d4e5f6';
const MERK = 'c4d5e6f7-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const MEDIA = '0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

const t = (text: string, marks?: TiptapNode['marks']): TiptapNode => ({
  type: 'text',
  text,
  ...(marks ? { marks } : {}),
});
const p = (...content: TiptapNode[]): TiptapNode => ({ type: 'paragraph', content });
const notes: Annotation[] = [
  { type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, color: 'rot' },
  { type: 'number', x: 0.7, y: 0.3, n: 1, color: 'gelb' },
  { type: 'text', x: 0.2, y: 0.8, text: 'Farbwerk 4 <neu>', color: 'blau' },
];

// Ein Abschnitt mit allen neuen Bausteinen
const doc: TiptapNode = {
  type: 'doc',
  content: [
    { type: 'callout', attrs: { kind: 'achtung' }, content: [p(t('Hände weg vom laufenden Farbwerk.'))] },
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: true }, content: [p(t('Farbkasten gefüllt'))] },
        { type: 'taskItem', attrs: { checked: false }, content: [p(t('Feuchtung geprüft'))] },
      ],
    },
    {
      type: 'calculation',
      content: [
        { type: 'calcLine', attrs: { role: 'given' }, content: [t('70 × 100 cm, 115 g/m²')] },
        { type: 'calcLine', attrs: { role: 'formula' }, content: [t('Bogengewicht = Fläche × Grammatur')] },
        { type: 'calcLine', attrs: { role: 'steps' }, content: [t('0,7 m² × 115 g/m²')] },
        { type: 'calcLine', attrs: { role: 'result' }, content: [t('80,5 g')] },
      ],
    },
    p(
      t('Siehe '),
      t('Farbmessung', [{ type: 'link', attrs: { href: tagLinkHref(TAG) } }]),
      t(' und die '),
      t('Tonwertzunahme', [{ type: 'merkstelle', attrs: { id: MERK, term: 'Tonwertzunahme' } }]),
      t(' am Bogen.'),
    ),
    { type: 'figure', attrs: { mediaId: MEDIA, caption: 'Druckwerk', alt: 'Druckwerk', annotations: notes } },
  ],
};
const sections: Sections = [{ id: 'auftrag', heading: 'Auftrag', doc: doc as Sections[number]['doc'] }];

describe('Schema: neue Bausteine', () => {
  it('nimmt alle neuen Bausteine an', () => {
    expect(() => validateSections(sections)).not.toThrow();
  });

  const invalid = (node: TiptapNode) =>
    expect(() =>
      validateSections([{ id: 'auftrag', heading: null, doc: { type: 'doc', content: [node] } }]),
    ).toThrow(InvalidContentError);

  it('lehnt unbekannte Hinweisboxen, unvollständige Rechenblöcke und falsche Merkstellen ab', () => {
    invalid({ type: 'callout', attrs: { kind: 'gefahr' }, content: [p(t('x'))] });
    invalid({
      type: 'calculation',
      content: ['given', 'formula', 'steps', 'steps'].map((role) => ({ type: 'calcLine', attrs: { role } })),
    });
    invalid(p(t('x', [{ type: 'merkstelle', attrs: { id: 'keine-uuid', term: 'Begriff' } }])));
    invalid(p(t('x', [{ type: 'merkstelle', attrs: { id: MERK, term: '   ' } }])));
    invalid(p(t('x', [{ type: 'link', attrs: { href: 'lernjournal://tag/nicht-gueltig' } }])));
    invalid({ type: 'figure', attrs: { mediaId: MEDIA, annotations: [{ type: 'arrow', x1: 2 }] } });
  });
});

describe('Klartext und Suche', () => {
  it('Klartext nennt Beschriftungen von Rechenblock, Hinweisbox und Checkliste', () => {
    const text = plainTextOf(doc);
    expect(text).toContain('Achtung:');
    expect(text).toContain('☑ Farbkasten gefüllt');
    expect(text).toContain('☐ Feuchtung geprüft');
    expect(text).toContain('Ergebnis: 80,5 g');
    expect(text).toContain('Farbwerk 4 <neu>');
  });

  it('Suchindex: Rechenzeilen zusammenhängend, Bildbeschriftung bei den Legenden', () => {
    const { body, captions } = projectSections(sections);
    expect(body).toContain('Bogengewicht = Fläche × Grammatur');
    expect(captions).toContain('Farbwerk 4 <neu>');
  });

  it('Merkstellen werden mit Begriff und Absatz gefunden', () => {
    expect(collectMerkstellen(sections)).toEqual([
      {
        id: MERK,
        term: 'Tonwertzunahme',
        text: 'Tonwertzunahme',
        context: 'Siehe Farbmessung und die Tonwertzunahme am Bogen.',
      },
    ]);
  });
});

describe('Word-Export', () => {
  const journal: ExportJournal = { ...JOURNAL, sections: [{ id: 'auftrag', heading: 'Auftrag', doc }] };

  async function document(media: (id: string) => DocxImage | undefined = () => undefined) {
    const { doc: d, warnings } = buildJournalDocument({
      journal,
      author: AUTHOR,
      media,
      linkTitles: LINK_TITLES,
    });
    const zip = unzipSync(await packDocx(d));
    return { xml: strFromU8(zip['word/document.xml']!), warnings };
  }

  it('bildet alle Bausteine ohne Warnung ab', async () => {
    const png: DocxImage = {
      data: new Uint8Array([137, 80, 78, 71]),
      type: 'png',
      widthPx: 800,
      heightPx: 500,
    };
    const { xml, warnings } = await document((id) => (id === MEDIA ? png : undefined));
    expect(warnings).toEqual([]);
    expect(xml).toContain('>Achtung<');
    expect(xml).toContain('☑');
    expect(xml).toContain('☐');
    expect(xml).toContain('>Ergebnis<');
    expect(xml).toContain('80,5 g');
    // Schlagwort-Querverweis und Merkstelle: nur Text, kein Hyperlink
    expect(xml).toContain('Farbmessung');
    expect(xml).not.toContain('lernjournal://');
  });

  it('nimmt für beschriftete Bilder das zusammengerechnete Bild', async () => {
    const key = annotatedMediaKey(MEDIA, notes)!;
    const used: string[] = [];
    const png: DocxImage = {
      data: new Uint8Array([137, 80, 78, 71]),
      type: 'png',
      widthPx: 800,
      heightPx: 500,
    };
    await document((id) => {
      used.push(id);
      return id === key ? png : undefined;
    });
    expect(used[0]).toBe(key);
    expect(annotatedFigures(journal.sections)).toEqual([{ mediaId: MEDIA, annotations: notes }]);
    expect(annotatedMediaKey(MEDIA, [])).toBeNull();
  });
});

describe('PDF-Export', () => {
  it('Hinweisbox, Checkliste, Rechenblock und Beschriftung als SVG über dem Bild', () => {
    const image: DocxImage = { data: new Uint8Array(), type: 'png', widthPx: 800, heightPx: 500 };
    const { document } = buildPdfDocument({
      journals: [{ ...JOURNAL, sections: [{ id: 'auftrag', heading: 'Auftrag', doc }] }],
      author: AUTHOR,
      images: new Map([[MEDIA, image]]),
      linkTitles: LINK_TITLES,
    });
    expect(document.html).toContain('class="callout callout-achtung"');
    expect(document.html).toContain('<ul class="tasks">');
    expect(document.html).toContain('<tr class="result"><th scope="row">Ergebnis</th>');
    expect(document.html).toContain('<span class="annotated">');
    // Text der Beschriftung ist maskiert (kein HTML aus dem Journal)
    expect(document.html).toContain('Farbwerk 4 &lt;neu&gt;');
    expect(document.html).not.toContain('<neu>');
  });
});

describe('Bildbeschriftung', () => {
  it('ungültige Daten ergeben eine leere Liste', () => {
    expect(parseAnnotations([{ type: 'kreis' }])).toEqual([]);
    expect(parseAnnotations(null)).toEqual([]);
    expect(parseAnnotations(notes)).toHaveLength(3);
  });

  it('SVG passt zur Bildgrösse und maskiert Text', () => {
    const svg = annotationSvg(notes, 800, 500);
    expect(svg).toContain('viewBox="0 0 800 500"');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('&lt;neu&gt;');
  });
});

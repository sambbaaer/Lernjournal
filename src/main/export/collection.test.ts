// Tests des Sammel-DOCX (AJ-13): mehrere Journale in einem Word-Dokument.
//
// Abnahme laut Backlog: Auswahl, Reihenfolge, Titelseite, TOC-Feld,
// Seitenumbruch je Journal. Dazu durchlaufende Abbildungsnummern, Sprünge
// zwischen den enthaltenen Journalen und die Prüfung der IPC-Anfrage
// (Anzahl, Doppelte, Titel, bestätigter Exporthinweis R-10).
//
// Golden Files wie beim Einzel-DOCX: `npx vitest run src/main/export -u`
// schreibt sie neu; danach den Git-Diff prüfen.
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateSections } from '@shared/editor-schema';
import { COLLECTION_LIMITS, COLLECTION_TOC_HINT } from '@shared/export';
import { ipcContract } from '@shared/ipc';
import type { LegacySections, Sections } from '@shared/journal';
import { sectionsFromLegacy } from '@shared/journal-templates';
import { journalLinkHref } from '@shared/links';
import { createIpcDispatcher, type Handlers } from '../ipc-handler';
import { JournalService } from '../journal/journal-service';
import { MediaService } from '../media/media-service';
import { ProjectService } from '../project/project-service';
import { bookmarkFor, type DocxImage, type TiptapNode } from './docx-content';
import {
  buildCollectionDocument,
  collectionTitle,
  periodText,
  professionText,
  type CollectionInfo,
} from './docx-collection';
import { packDocx } from './docx-document';
import type { ExportJournal } from './docx-journal';
import { createExportHandlers } from './export-handlers';
import { ExportService } from './export-service';
import { AUTHOR, COLLECTION_2, COLLECTION_3, COLLECTION_IDS, IDS, JOURNAL, LINK_TITLES } from './fixtures';
import { convertWithLibreOffice, count, docxParts, normalize, soffice } from './test-utils';

const PNG = new Uint8Array(readFileSync(path.resolve('e2e/fixtures/screenshot.png'))); // 800 × 500
const pngImage: DocxImage = { data: PNG, type: 'png', widthPx: 800, heightPx: 500 };
const INFO: CollectionInfo = { title: '', createdOn: '2026-11-24', specialization: 'print' };
// Standardauswahl der Tests: bewusst NICHT chronologisch (14.3., 3.2., 20.6.),
// damit sichtbar ist, dass die gewählte Reihenfolge gilt
const THREE = [JOURNAL, COLLECTION_2, COLLECTION_3];

async function collection(
  journals: ExportJournal[] = THREE,
  opts: {
    info?: Partial<CollectionInfo>;
    media?: (id: string) => DocxImage | undefined;
    author?: typeof AUTHOR;
  } = {},
) {
  const { doc, warnings } = buildCollectionDocument({
    journals,
    author: opts.author ?? AUTHOR,
    // Bild von COLLECTION_2 fehlt absichtlich (Hinweis mit Journaltitel)
    media: opts.media ?? ((id) => (id === IDS.image ? pngImage : undefined)),
    linkTitles: LINK_TITLES,
    info: { ...INFO, ...opts.info },
  });
  const p = docxParts(await packDocx(doc));
  const rels = p.get('word/_rels/document.xml.rels');
  // Fusszeilen: welche Datei «default» und welche «first» ist, steht im Dokument
  const footerFile = (type: 'default' | 'first') => {
    const relId = new RegExp(`<w:footerReference w:type="${type}" r:id="([^"]+)"`).exec(p.document)?.[1];
    const target = new RegExp(`Id="${relId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
    return target ? p.get(`word/${target}`) : '';
  };
  return { ...p, warnings, footerDefault: footerFile('default'), footerFirst: footerFile('first') };
}

// Text der Überschriften 1 in Dokumentreihenfolge (= Journaltitel)
function headings1(xml: string): string[] {
  return xml
    .split('<w:p>')
    .filter((x) => x.includes('<w:pStyle w:val="Heading1"/>'))
    .map((x) => [...x.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''));
}

describe('Golden Files: Sammel-DOCX', () => {
  it('Testdaten sind gültiger Editor-Inhalt (echtes Schema)', () => {
    for (const j of [COLLECTION_2, COLLECTION_3])
      expect(() => validateSections(j.sections as unknown as Sections)).not.toThrow();
  });

  it('XML-Teile entsprechen den Referenzdateien', async () => {
    const p = await collection(THREE, { media: (id) => (id === IDS.image ? pngImage : undefined) });
    const [doc, rels] = normalize(`${p.document}\u0000${p.rels}`).split('\u0000');
    await expect(doc).toMatchFileSnapshot('__golden__/sammel.document.xml');
    await expect(rels).toMatchFileSnapshot('__golden__/sammel.document.xml.rels');
    await expect(normalize(p.styles)).toMatchFileSnapshot('__golden__/sammel.styles.xml');
    await expect(normalize(p.footerFirst)).toMatchFileSnapshot('__golden__/sammel.footer-first.xml');
  });

  it('ist deterministisch: zweimal exportiert = gleiches XML (nach Normalisierung)', async () => {
    const a = await collection();
    const b = await collection();
    expect(normalize(b.document)).toBe(normalize(a.document));
  });
});

describe('Aufbau des Sammel-DOCX', () => {
  it('Reihenfolge: Journale stehen genau in der gewählten Reihenfolge', async () => {
    expect(headings1((await collection()).document)).toEqual([
      JOURNAL.title,
      COLLECTION_2.title,
      COLLECTION_3.title,
    ]);
    expect(headings1((await collection([COLLECTION_3, JOURNAL, COLLECTION_2])).document)).toEqual([
      COLLECTION_3.title,
      JOURNAL.title,
      COLLECTION_2.title,
    ]);
  });

  it('Titelseite: Titel, Name, Lehrbetrieb, Beruf/Fachrichtung, Zeitraum, Anzahl, Datum', async () => {
    const p = await collection(THREE, { info: { title: 'Lerndokumentation 2. Lehrjahr' } });
    const title = p.document.split('<w:p>').find((x) => x.includes('<w:pStyle w:val="Title"/>'))!;
    expect(title).toContain('Lerndokumentation 2. Lehrjahr');
    expect(p.document).toMatch(/<w:pStyle w:val="Subtitle"\/>[\s\S]*?Lea Muster/);
    for (const text of [
      'Druckerei Beispiel AG',
      'Medientechnologin/Medientechnologe EFZ, Fachrichtung Print',
      // Zeitraum nach Arbeitsdatum, unabhängig von der gewählten Reihenfolge
      'Zeitraum: 03.02.2026 – 20.06.2026',
      '3 Journale',
      'Erstellt am 24.11.2026 mit Lernjournal (inoffizielles Hilfsmittel)',
    ])
      expect(p.document).toContain(text);
    // Titelseite steht vor dem Inhaltsverzeichnis und vor dem ersten Journal
    expect(p.document.indexOf('Zeitraum:')).toBeLessThan(p.document.indexOf('TOCHeading'));
    // Dateieigenschaft «Titel» = Titel der Titelseite
    expect(p.core).toContain('<dc:title>Lerndokumentation 2. Lehrjahr</dc:title>');
    // Formatvorlagen mit eingebauten Namen → «Titel», «Untertitel» in deutschem Word
    expect(p.styles).toMatch(/w:styleId="Title"[\s\S]*?<w:name w:val="Title"\/>/);
    expect(p.styles).toMatch(/w:styleId="Subtitle"[\s\S]*?<w:name w:val="Subtitle"\/>/);
  });

  it('Titelseite: leerer Titel → «Lerndokumentation», leere Profilangaben entfallen', async () => {
    const p = await collection([COLLECTION_3], {
      author: { displayName: '  ', company: null },
      info: { title: '   ', specialization: null },
    });
    expect(p.core).toContain('<dc:title>Lerndokumentation</dc:title>');
    expect(p.document).not.toContain('w:val="Subtitle"');
    expect(p.document).toContain('>Medientechnologin/Medientechnologe EFZ<');
    expect(p.document).toContain('Zeitraum: 20.06.2026');
    expect(p.document).toContain('1 Journal<');
    expect(p.footerDefault).toContain('>Lerndokumentation<');
  });

  it('Titelseite ohne Fusszeile, ab Seite 2 «Lerndokumentation – Name» mit «Seite X von Y»', async () => {
    const p = await collection();
    expect(p.document).toContain('<w:titlePg/>');
    expect(p.footerFirst).not.toMatch(/PAGE|Lerndokumentation/);
    expect(p.footerDefault).toContain('Lerndokumentation – Lea Muster');
    expect(p.footerDefault).toMatch(/NUMPAGES/);
  });

  it('Inhaltsverzeichnis: echtes TOC-Feld über die Journaltitel, mit Links, auf eigener Seite', async () => {
    const p = await collection();
    expect(p.document).toContain('TOC \\h \\o &quot;1-1&quot;');
    // Vorbefüllt mit je einem Eintrag pro Journal (sichtbar auch ohne Aktualisieren)
    expect(count(p.document, /<w:pStyle w:val="TOC1"\/>/g)).toBe(3);
    expect(count(p.document, /PAGEREF _Toc\d+/g)).toBe(3);
    // Überschrift «Inhaltsverzeichnis» ist KEINE Überschrift 1 (sonst stünde sie im Verzeichnis)
    const heading = p.document.split('<w:p>').find((x) => x.includes('>Inhaltsverzeichnis<'))!;
    expect(heading).toContain('<w:pStyle w:val="TOCHeading"/>');
    expect(heading).toContain('<w:pageBreakBefore/>');
    expect(headings1(p.document)).not.toContain('Inhaltsverzeichnis');
    // Word aktualisiert die Felder beim Öffnen (Seitenzahlen im Verzeichnis)
    expect(p.settings).toMatch(/<w:updateFields( w:val="(true|1|on)")?\/>/);
    expect(p.styles).toMatch(/w:styleId="TOCHeading"[\s\S]*?<w:name w:val="TOC Heading"\/>/);
    // Hinweis für die Oberfläche erklärt «Felder aktualisieren»
    expect(COLLECTION_TOC_HINT).toContain('Felder aktualisieren');
  });

  it('Seitenumbruch je Journal: jeder Journaltitel beginnt auf einer neuen Seite', async () => {
    const p = await collection();
    const titles = p.document.split('<w:p>').filter((x) => x.includes('<w:pStyle w:val="Heading1"/>'));
    expect(titles).toHaveLength(3);
    for (const t of titles) expect(t).toContain('<w:pageBreakBefore/>');
    // + 1 für das Inhaltsverzeichnis; keine leeren Absätze mit harten Umbrüchen
    expect(count(p.document, /<w:pageBreakBefore\/>/g)).toBe(4);
    expect(p.document).not.toContain('<w:br w:type="page"/>');
  });

  it('Links zwischen enthaltenen Journalen werden zu Sprüngen, andere bleiben Text mit Hinweis', async () => {
    const p = await collection();
    // COLLECTION_2 → JOURNAL und COLLECTION_3 → COLLECTION_2: beide im Dokument
    for (const id of [IDS.journal, COLLECTION_IDS.second]) {
      expect(p.document).toContain(`w:anchor="${bookmarkFor(id)}"`);
      expect(p.document).toContain(`w:name="${bookmarkFor(id)}"`);
    }
    // COLLECTION_3 → IDS.linked und JOURNAL → IDS.linked: nicht im Dokument
    expect(p.document).not.toContain(`w:anchor="${bookmarkFor(IDS.linked)}"`);
    expect(count(p.document, /\(siehe Journal «ICC-Profile im Workflow»\)/g)).toBe(2);

    // Ohne JOURNAL in der Auswahl: der Link darauf wird zum Hinweis statt zum Sprung ins Leere
    const { doc } = buildCollectionDocument({
      journals: [COLLECTION_2],
      author: AUTHOR,
      media: () => undefined,
      linkTitles: new Map([[IDS.journal, JOURNAL.title]]),
      info: INFO,
    });
    const xml = docxParts(await packDocx(doc)).document;
    expect(xml).not.toContain(`w:anchor="${bookmarkFor(IDS.journal)}"`);
    expect(xml).toContain(`(siehe Journal «${JOURNAL.title}»)`);
  });

  it('Abbildungsnummern laufen durch das ganze Dokument', async () => {
    const p = await collection([COLLECTION_2, JOURNAL]);
    const numbers = [...p.document.matchAll(/SEQ Abbildung \\\* ARABIC"[\s\S]*?<w:t[^>]*>(\d+)<\/w:t>/g)].map(
      (m) => m[1],
    );
    expect(numbers).toEqual(['1', '2']);
    expect(p.document).toContain(': Belichtete Platte');
    expect(p.document).toContain(': Kontrollstreifen nach dem Einregeln');
  });

  it('Listen: jede nummerierte Liste beginnt auch im Sammel-DOCX neu', async () => {
    const p = await collection();
    // JOURNAL: Aufzählung + 2 nummerierte Listen, COLLECTION_2: 1 nummerierte Liste
    const numIds = new Set([...p.document.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]));
    expect(numIds.size).toBe(4);
  });

  it('Hinweise nennen das betroffene Journal', async () => {
    const p = await collection();
    expect(p.warnings).toEqual([
      '«Druckplatte belichten (CtP)»: Ein Bild wurde nicht gefunden und ist im Dokument als «[Bild fehlt]» markiert.',
    ]);
  });

  it('Hilfsfunktionen: Titel, Zeitraum, Beruf', () => {
    expect(collectionTitle('  ')).toBe('Lerndokumentation');
    expect(collectionTitle(' Semester 3 ')).toBe('Semester 3');
    expect(periodText([])).toBeNull();
    expect(periodText([{ workDate: '2026-06-20' }, { workDate: '2025-09-01' }])).toBe(
      '01.09.2025 – 20.06.2026',
    );
    expect(professionText('siebdruck')).toBe(
      'Medientechnologin/Medientechnologe EFZ, Fachrichtung Siebdruck',
    );
  });
});

describe('Sammel-DOCX mit echter Projektdatenbank und IPC', () => {
  let root: string;
  let projects: ProjectService;
  let media: MediaService;
  let journals: JournalService;
  let service: ExportService;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'lj-c-'));
    projects = new ProjectService({
      appVersion: '0.1.0',
      env: {},
      lockEnv: { pid: 1, hostname: 'PC', isProcessAlive: () => true, now: () => new Date() },
    });
    await projects.create({
      dir: path.join(root, 'p'),
      title: 'P',
      profile: {
        displayName: 'Lea Muster',
        company: 'Druckerei Beispiel AG',
        apprenticeshipStart: '2024-08-01',
        specialization: 'printmediatechnik',
      },
      seedCategories: false,
    });
    media = new MediaService(
      () => projects.db,
      () => projects.dir,
    );
    journals = new JournalService(
      () => projects.db,
      () => projects.dir,
      () => new Date(),
      media,
    );
    service = new ExportService(
      () => projects.db,
      journals,
      media,
      async () => PNG,
      () => new Date(2026, 10, 24, 9, 30), // 24.11.2026 (lokale Zeit)
    );
  });
  afterEach(() => {
    projects.close();
    rmSync(root, { recursive: true, force: true });
  });

  const para = (...content: TiptapNode[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
  const linkTo = (text: string, id: string): TiptapNode => ({
    type: 'text',
    text,
    marks: [{ type: 'link', attrs: { href: journalLinkHref(id) } }],
  });

  // Drei Journale: B verlinkt auf A, jedes mit einem Bild
  function seed() {
    const a = journals.create({ title: 'A Farbmessung', workDate: '2026-03-14' });
    const b = journals.create({ title: 'B Platte', workDate: '2026-02-03' });
    const c = journals.create({ title: 'C Papier', workDate: '2026-06-20' });
    for (const j of [a, b, c]) {
      const m = media.add({ journalId: j.id, data: PNG, originalName: 'x.png' });
      journals.updateSections(
        j.id,
        sectionsFromLegacy('report', {
          auftrag: { type: 'doc', content: [{ type: 'paragraph' }] },
          durchfuehrung: {
            type: 'doc',
            content: [{ type: 'figure', attrs: { mediaId: m.id, caption: `Bild ${j.title}`, alt: '' } }],
          },
          reflexion: (j === b
            ? para({ type: 'text', text: 'Siehe ' }, linkTo('Messung', a.id))
            : para()) as LegacySections['reflexion'],
        }),
      );
    }
    return { a, b, c };
  }

  it('Dienst: Reihenfolge wie gewählt, Bilder aller Journale, Sprung, Profil auf der Titelseite', async () => {
    const { a, b, c } = seed();
    const { data, warnings } = await service.collectionDocx([c.id, a.id, b.id], 'Semesterbericht');
    expect(warnings).toEqual([]);
    const p = docxParts(data);
    expect(headings1(p.document)).toEqual(['C Papier', 'A Farbmessung', 'B Platte']);
    expect(count(p.document, /<w:drawing>/g)).toBe(3);
    expect(p.document).toContain(`w:anchor="${bookmarkFor(a.id)}"`);
    for (const text of [
      'Semesterbericht',
      'Druckerei Beispiel AG',
      'Fachrichtung Printmediatechnik',
      'Zeitraum: 03.02.2026 – 20.06.2026',
      'Erstellt am 24.11.2026',
    ])
      expect(p.document).toContain(text);
    expect(service.suggestedCollectionName('Semesterbericht')).toBe('2026-11-24 Semesterbericht.docx');
    expect(service.suggestedCollectionName(' ')).toBe('2026-11-24 Lerndokumentation.docx');
  });

  it('Dienst: gelöschtes Journal → verständliche Meldung', async () => {
    const { a } = seed();
    const gone = '00000000-0000-4000-8000-000000000000';
    expect(() => service.assertJournalsExist([a.id, gone])).toThrow(/gibt es nicht mehr/);
    await expect(service.collectionDocx([a.id, gone], '')).rejects.toThrow(/gibt es nicht mehr/);
  });

  it('IPC: Anfrage wird geprüft (Anzahl, Doppelte, IDs, Titel, Hinweis R-10)', async () => {
    const { a, b } = seed();
    let dialogs = 0;
    const handlers = createExportHandlers({
      service,
      printPdf: async () => {
        throw new Error('Unerwarteter PDF-Aufruf');
      },
      chooseSavePath: async () => {
        dialogs++;
        return null;
      },
      showInFolder: () => {},
    });
    const dispatch = createIpcDispatcher(handlers as unknown as Handlers, () => true);
    const ev = { senderFrame: { url: 'app://lernjournal/index.html' } };
    const call = (req: unknown) => dispatch('export:collectionDocx', ev, req);
    const ok = { ids: [a.id, b.id], title: 'X', noticeAccepted: true };

    const tooMany = Array.from(
      { length: COLLECTION_LIMITS.maxJournals + 1 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    for (const bad of [
      { ...ok, noticeAccepted: false }, // Hinweis nicht bestätigt
      { ids: ok.ids, title: 'X' }, // Hinweis fehlt
      { ...ok, ids: [] }, // keine Auswahl
      { ...ok, ids: [a.id, b.id, a.id] }, // Dublette
      { ...ok, ids: [a.id, '../../etc/passwd'] }, // keine gültige ID
      { ...ok, ids: tooMany }, // zu viele
      { ...ok, title: 'x'.repeat(COLLECTION_LIMITS.maxTitleLength + 1) }, // Titel zu lang
      { ...ok, ids: a.id }, // keine Liste
    ]) {
      const r = await call(bad);
      expect(r.ok, JSON.stringify(bad).slice(0, 80)).toBe(false);
    }
    expect(dialogs).toBe(0);
    // Unbekanntes Journal: Meldung VOR dem Speichern-Dialog
    const unknown = await call({ ...ok, ids: [a.id, '00000000-0000-4000-8000-000000000000'] });
    expect(!unknown.ok && unknown.error).toEqual({
      code: 'INVALID_REQUEST',
      message: 'Ein ausgewähltes Journal gibt es nicht mehr. Bitte die Auswahl prüfen.',
    });
    expect(dialogs).toBe(0);
    // Titel mit Leerzeichen am Rand ist erlaubt (wird gekürzt); Abbrechen = kein Fehler
    expect(await call({ ...ok, title: `  ${'x'.repeat(COLLECTION_LIMITS.maxTitleLength)}  ` })).toEqual({
      ok: true,
      data: { status: 'canceled' },
    });
    expect(dialogs).toBe(1);
  });

  it('IPC: Speichern-Dialog mit Vorschlag, Datei geschrieben, «Im Ordner anzeigen»', async () => {
    const { a, b, c } = seed();
    let suggested = '';
    const shown: string[] = [];
    const handlers = createExportHandlers({
      service,
      printPdf: async () => {
        throw new Error('Unerwarteter PDF-Aufruf');
      },
      chooseSavePath: async (s) => {
        suggested = s;
        return path.join(root, 'Sammlung');
      },
      showInFolder: (f) => shown.push(f),
    });
    const dispatch = createIpcDispatcher(handlers as unknown as Handlers, () => true);
    const ev = { senderFrame: { url: 'app://lernjournal/index.html' } };
    const r = await dispatch('export:collectionDocx', ev, {
      ids: [b.id, a.id, c.id],
      title: ' Besprechung Februar–Juni ',
      noticeAccepted: true,
    });
    expect(suggested).toBe('2026-11-24 Besprechung Februar–Juni.docx');
    expect(r.ok && r.data).toMatchObject({ status: 'saved', fileName: 'Sammlung.docx', warnings: [] });
    const result = ipcContract['export:collectionDocx'].response.parse(r.ok && r.data);
    const file = path.join(root, 'Sammlung.docx');
    expect(statSync(file).size).toBe(result.status === 'saved' ? result.bytes : -1);
    const p = docxParts(new Uint8Array(readFileSync(file)));
    expect(headings1(p.document)).toEqual(['B Platte', 'A Farbmessung', 'C Papier']);
    expect(p.core).toContain('<dc:title>Besprechung Februar–Juni</dc:title>');
    expect(await dispatch('export:showFile', ev, undefined)).toEqual({ ok: true, data: { shown: true } });
    expect(shown).toEqual([file]);
  });
});

// Gegenprobe mit einer zweiten Office-Software. Läuft nur, wenn LibreOffice
// installiert ist (lokal unter Linux; in der Windows-CI übersprungen).
describe.skipIf(!soffice)('LibreOffice', () => {
  it('öffnet das Sammel-DOCX und erzeugt ein PDF', { timeout: 180_000 }, async () => {
    expect(convertWithLibreOffice((await collection()).bytes, 'sammel')).toBeGreaterThan(10_000);
  });
});

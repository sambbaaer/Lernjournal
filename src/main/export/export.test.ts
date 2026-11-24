// Tests des Word-Exports (AJ-12).
//
// Ein DOCX ist ein ZIP mit XML-Dateien. Wir entpacken es und prüfen:
//  1. Golden Files: die relevanten XML-Teile (Inhalt, Formatvorlagen,
//     Nummerierung, Fusszeile, Beziehungen) Zeichen für Zeichen gegen
//     Referenzdateien in __golden__/. So fällt jede ungewollte Änderung auf –
//     auch nach einem Update der Bibliothek `docx`.
//     Absichtliche Änderung? `npx vitest run -u` schreibt die Referenzen neu;
//     danach den Unterschied im Git-Diff prüfen.
//  2. Gezielte Regeln (Listen, Bilder, Links, ungültige Zeichen …)
//  3. Den Exportdienst mit echter Projektdatenbank und die IPC-Handler
//  4. Gegenprobe mit LibreOffice, falls installiert
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateSections } from '@shared/editor-schema';
import { EXPORT_NOTICE, formatFileSize } from '@shared/export';
import { ipcContract } from '@shared/ipc';
import type { Sections } from '@shared/journal';
import { journalLinkHref } from '@shared/links';
import { createIpcDispatcher, type Handlers } from '../ipc-handler';
import { JournalService } from '../journal/journal-service';
import { sniffImage } from '../media/image-info';
import { MediaService } from '../media/media-service';
import { ProjectService } from '../project/project-service';
import { TaxonomyService } from '../taxonomy/taxonomy-service';
import {
  bookmarkFor,
  cleanText,
  fitImage,
  formatDateCH,
  hasContent,
  type DocxImage,
  type TiptapNode,
} from './docx-content';
import { buildJournalDocument, packDocx } from './docx-document';
import { schoolYearText, type ExportJournal } from './docx-journal';
import { createExportHandlers } from './export-handlers';
import { ExportService, suggestFileName, withDocxExtension, writeFileAtomic } from './export-service';
import { AUTHOR, IDS, JOURNAL, LINK_TITLES } from './fixtures';

const fixture = (n: string) => new Uint8Array(readFileSync(path.resolve('e2e/fixtures', n)));
const PNG = fixture('screenshot.png'); // 800 × 500
const pngImage: DocxImage = { data: PNG, type: 'png', widthPx: 800, heightPx: 500 };

// DOCX bauen und die XML-Teile als Text liefern
async function parts(
  journal: ExportJournal = JOURNAL,
  media = (id: string) => (id === IDS.image ? pngImage : undefined),
) {
  const { doc, warnings } = buildJournalDocument({ journal, author: AUTHOR, media, linkTitles: LINK_TITLES });
  const bytes = await packDocx(doc);
  const zip = unzipSync(bytes);
  const get = (name: string) => (zip[name] ? strFromU8(zip[name]) : '');
  return {
    bytes,
    zip,
    warnings,
    document: get('word/document.xml'),
    styles: get('word/styles.xml'),
    numbering: get('word/numbering.xml'),
    footer: get('word/footer1.xml'),
    rels: get('word/_rels/document.xml.rels'),
    settings: get('word/settings.xml'),
    core: get('docProps/core.xml'),
  };
}
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const withSection = (key: keyof ExportJournal['sections'], doc: TiptapNode): ExportJournal => ({
  ...JOURNAL,
  sections: { ...JOURNAL.sections, [key]: doc },
});
const para = (text: string, marks?: TiptapNode['marks']): TiptapNode => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] }],
});

// Golden-File-Vergleich: Werte, die `docx` zufällig oder prozessweit zählend
// vergibt (Beziehungs-IDs, Textmarken-/Bild-IDs), werden in der Reihenfolge
// ihres Auftretens durchnummeriert – die Struktur bleibt so vollständig
// vergleichbar. Ein Tag pro Zeile macht Unterschiede im Diff lesbar.
function normalize(xml: string): string {
  const maps = new Map<string, Map<string, string>>();
  const stable = (family: string, value: string) => {
    let m = maps.get(family);
    if (!m) maps.set(family, (m = new Map()));
    if (!m.has(value)) m.set(value, `${family}${m.size + 1}`);
    return m.get(value)!;
  };
  return xml
    .replace(/\b(r:id|r:embed|Id)="([^"]+)"/g, (_, a: string, v: string) => `${a}="${stable('rel', v)}"`)
    .replace(
      /<(w:bookmark(?:Start|End))([^>]*?) w:id="(\d+)"/g,
      (_, tag: string, rest: string, v: string) => `<${tag}${rest} w:id="${stable('bm', v)}"`,
    )
    .replace(/<wp:docPr id="(\d+)"/g, (_, v: string) => `<wp:docPr id="${stable('pr', v)}"`)
    .replace(/></g, '>\n<');
}

describe('Golden Files: Einzel-DOCX', () => {
  it('Testdaten sind gültiger Editor-Inhalt (echtes Schema)', () => {
    expect(() => validateSections(JOURNAL.sections as unknown as Sections)).not.toThrow();
  });

  it('XML-Teile entsprechen den Referenzdateien', async () => {
    const p = await parts();
    expect(p.warnings).toEqual([]);
    // Beziehungen: IDs werden für beide Dateien gemeinsam stabilisiert
    const [doc, rels] = normalize(`${p.document}\u0000${p.rels}`).split('\u0000');
    await expect(doc).toMatchFileSnapshot('__golden__/einzel.document.xml');
    await expect(rels).toMatchFileSnapshot('__golden__/einzel.document.xml.rels');
    await expect(normalize(p.styles)).toMatchFileSnapshot('__golden__/einzel.styles.xml');
    await expect(normalize(p.numbering)).toMatchFileSnapshot('__golden__/einzel.numbering.xml');
    await expect(normalize(p.footer)).toMatchFileSnapshot('__golden__/einzel.footer1.xml');
  });

  it('ist deterministisch: zweimal exportiert = gleiches XML (nach Normalisierung)', async () => {
    const a = await parts();
    const b = await parts();
    expect(normalize(b.document)).toBe(normalize(a.document));
  });
});

describe('Abbildung der Inhalte', () => {
  it('native Formatvorlagen: Titel = Überschrift 1, Abschnitte = Überschrift 2, Editor-H2/H3 = 3/4', async () => {
    const p = await parts();
    expect(count(p.document, /<w:pStyle w:val="Heading1"\/>/g)).toBe(1);
    expect(count(p.document, /<w:pStyle w:val="Heading2"\/>/g)).toBe(3);
    expect(count(p.document, /<w:pStyle w:val="Heading3"\/>/g)).toBe(1);
    expect(count(p.document, /<w:pStyle w:val="Heading4"\/>/g)).toBe(1);
    expect(count(p.document, /<w:pStyle w:val="Caption"\/>/g)).toBe(1);
    // Eingebaute Namen → deutsches Word zeigt «Überschrift 1», «Beschriftung»
    expect(p.styles).toMatch(/w:styleId="Heading1"[\s\S]*?<w:name w:val="Heading 1"\/>/);
    expect(p.styles).toMatch(/w:styleId="Caption"[\s\S]*?<w:name w:val="caption"\/>/);
    expect(p.styles).toMatch(/<w:lang w:val="de-CH"/);
  });

  it('Kopfblock: Name, Lehrbetrieb, Datum, Lehrjahr/Semester, Lernort, Kategorien, Schlagwörter', async () => {
    const p = await parts();
    for (const text of [
      'Lea Muster',
      'Druckerei Beispiel AG',
      '14.03.2026',
      '2. Lehrjahr, 1. Semester',
      'Betrieb',
      'e – Ausführen von Druckaufträgen',
      'Farbmessung, ISO 12647-2, Spektralfotometer',
    ])
      expect(p.document).toContain(text);
    // Leeres Profil, ohne Lehrjahr: keine leeren Zeilen
    const { doc } = buildJournalDocument({
      journal: { ...JOURNAL, schoolYear: null, semester: null, categories: [], tags: [] },
      author: { displayName: '', company: null },
      media: () => undefined,
    });
    const xml = strFromU8(unzipSync(await packDocx(doc))['word/document.xml']!);
    expect(xml).not.toMatch(/Name: |Lehrbetrieb: |Kategorien: |Schlagwörter: |Lehrjahr/);
    expect(xml).toContain('Arbeitsdatum: ');
  });

  it('Listen: echte Word-Nummerierung, jede Liste neu, Startwert, Folgeabsatz ohne Nummer', async () => {
    const p = await parts();
    const numIds = new Set([...p.document.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]));
    // Aufzählung + zwei nummerierte Listen (die zweite beginnt bei 3)
    expect(numIds.size).toBe(3);
    expect(p.numbering).toMatch(/<w:start w:val="3"\/>/);
    // «Dabei auf trockene Farbe geachtet.» steht eingerückt, aber ohne eigene Nummer
    const para = p.document.split('<w:p>').find((x) => x.includes('trockene Farbe'))!;
    expect(para).not.toContain('<w:numPr>');
    expect(para).toContain('<w:ind w:left="720"/>');
  });

  it('Tabelle: Kopfzeile wiederholt, feste Breiten, Kopfzellen fett', async () => {
    const p = await parts();
    expect(p.document).toContain('<w:tblHeader/>');
    expect(p.document).toMatch(/<w:gridCol w:w="\d+"\/>/);
    const header = p.document.split('<w:tc>').find((x) => x.includes('>Farbe<'))!;
    expect(header).toContain('<w:b/>');
  });

  it('Bild: echte Grafik, auf den Satzspiegel verkleinert, mit nummerierter Legende', async () => {
    const p = await parts();
    expect(count(p.document, /<w:drawing>/g)).toBe(1);
    expect(Object.keys(p.zip).some((n) => /^word\/media\/.+\.png$/.test(n))).toBe(true);
    // 800 px > 16 cm (605 px) → verkleinert; 1 px = 9525 EMU
    const cx = Number(/<wp:extent cx="(\d+)"/.exec(p.document)![1]);
    expect(Math.round(cx / 9525)).toBe(605);
    // SEQ-Feld mit vorberechneter Nummer + Legendentext
    expect(p.document).toMatch(/w:instr="SEQ Abbildung \\\* ARABIC"[\s\S]*?<w:t[^>]*>1<\/w:t>/);
    expect(p.document).toContain(': Kontrollstreifen nach dem Einregeln');
    // Bild und Legende bleiben zusammen
    expect(p.document).toMatch(/<w:keepNext\/>[\s\S]*?<w:drawing>/);
  });

  it('fehlendes Bild: Platzhalter und Hinweis statt Absturz, Legende bleibt', async () => {
    const p = await parts(JOURNAL, () => undefined);
    expect(p.document).toContain('[Bild fehlt]');
    expect(p.document).toContain('Kontrollstreifen nach dem Einregeln');
    expect(p.warnings).toHaveLength(1);
  });

  it('Links: Weblink als echter Hyperlink, Journal-Link als Text mit Hinweis auf den Titel', async () => {
    const p = await parts();
    expect(p.rels).toMatch(/Target="https:\/\/fogra.org" TargetMode="External"/);
    expect(p.document).toContain('(siehe Journal «ICC-Profile im Workflow»)');
    // Kein interner Sprung ins Leere: Ziel steht nicht in diesem Dokument
    expect(p.document).not.toMatch(/w:anchor=/);
  });

  it('Journal-Link: kein Hinweis, wenn der Text den Titel schon nennt', async () => {
    const href = journalLinkHref(IDS.linked);
    const p = await parts(
      withSection('reflexion', para('ICC-Profile im Workflow', [{ type: 'link', attrs: { href } }])),
    );
    // Nur der Hinweis aus «Durchführung» (Text «Farbprofil»), keiner in «Reflexion»
    expect(count(p.document, /siehe Journal/g)).toBe(1);
  });

  it('Link auf ein Journal im selben Dokument wird zum Sprung zur Textmarke (für AJ-13)', async () => {
    const href = journalLinkHref(JOURNAL.id);
    const p = await parts(withSection('reflexion', para('oben', [{ type: 'link', attrs: { href } }])));
    expect(p.document).toContain(`w:anchor="${bookmarkFor(JOURNAL.id)}"`);
    expect(p.document).toContain(`w:name="${bookmarkFor(JOURNAL.id)}"`);
  });

  it('unzulässige Link-Ziele werden nie verlinkt', async () => {
    const p = await parts(
      withSection('reflexion', para('Klick', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
    );
    expect(p.rels).not.toContain('javascript:');
    expect(p.document).toContain('Klick');
    expect(p.warnings).toHaveLength(1);
  });

  it('unbekannte Knoten: Text bleibt erhalten, Hinweis wird gemeldet', async () => {
    const p = await parts(
      withSection('reflexion', {
        type: 'doc',
        content: [{ type: 'blockquote', content: [para('Wichtiger Gedanke').content![0]!] }],
      }),
    );
    expect(p.document).toContain('Wichtiger Gedanke');
    expect(p.warnings).toEqual(['Ein unbekannter Inhalt («blockquote») wurde als normaler Text übernommen.']);
  });

  it('in XML verbotene Steuerzeichen werden entfernt (sonst meldet Word einen Fehler)', async () => {
    const p = await parts(withSection('reflexion', para('Farb\u0001zone\u000b 3 \uD800ok')));
    expect(p.document).toContain('Farbzone 3 ok');
    expect(p.document.includes('\u0001') || p.document.includes('\u000b')).toBe(false);
  });

  it('leere Abschnitte: grauer Strich, Hilfetexte erscheinen nie', async () => {
    const p = await parts();
    expect(p.document).toMatch(/<w:color w:val="808080"\/>[\s\S]*?<w:t[^>]*>–<\/w:t>/);
    expect(p.document).not.toContain('Was lief gut');
  });

  it('Seite A4, Fusszeile mit «Seite X von Y», keine Feldaktualisierung nötig', async () => {
    const p = await parts();
    expect(p.document).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(p.footer).toContain('Lerndokumentation – Lea Muster');
    expect(p.footer).toMatch(/PAGE/);
    expect(p.footer).toMatch(/NUMPAGES/);
    expect(p.settings).not.toMatch(/<w:updateFields( w:val="(true|1|on)")?\/>/);
    expect(p.core).toContain('<dc:title>Farbmessung und Volltondichte am Druckbogen</dc:title>');
    expect(p.core).toContain('<dc:creator>Lea Muster</dc:creator>');
  });
});

describe('Hilfsfunktionen', () => {
  it('Datum, Textmarke, Lehrjahr, Inhalt, Zeichen, Bildgrösse', () => {
    expect(formatDateCH('2026-03-14')).toBe('14.03.2026');
    const b = bookmarkFor('3f2a9c1e-6b7d-4e21-9a4f-0c5d8e7b1a23');
    expect(b.length).toBeLessThanOrEqual(40);
    expect(b).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
    expect(schoolYearText(2, 1)).toBe('2. Lehrjahr, 1. Semester');
    expect(schoolYearText(3, null)).toBe('3. Lehrjahr');
    expect(schoolYearText(null, null)).toBeNull();
    expect(hasContent({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(false);
    expect(hasContent({ type: 'doc', content: [{ type: 'figure', attrs: { mediaId: 'x' } }] })).toBe(true);
    expect(cleanText('a\u0000b😀')).toBe('ab😀'); // gültige Emoji (Surrogat-Paar) bleiben
    expect(fitImage(800, 500, 605, 453)).toEqual({ width: 605, height: 378 });
    expect(fitImage(1600, 2400, 605, 453)).toEqual({ width: 302, height: 453 }); // Hochformat: Höhe begrenzt
    expect(fitImage(200, 100, 605, 453)).toEqual({ width: 200, height: 100 }); // nie vergrössern
  });

  it('Dateiname: Datum + Titel, ohne verbotene Zeichen', () => {
    expect(suggestFileName('Farbmessung: CMYK/Sonderfarben?', '2026-03-14')).toBe(
      '2026-03-14 Farbmessung CMYK Sonderfarben.docx',
    );
    expect(suggestFileName('  ', '2026-03-14')).toBe('2026-03-14 Ohne Titel.docx');
    expect(suggestFileName('Plattenbelichter...', '2026-03-14')).toBe('2026-03-14 Plattenbelichter.docx');
    expect(withDocxExtension('C:\\x\\Bericht')).toBe('C:\\x\\Bericht.docx');
    expect(withDocxExtension('Bericht.DOCX')).toBe('Bericht.DOCX');
  });

  it('Exporthinweis (R-10) nennt Geschäftsgeheimnisse, Kundendaten, Personen auf Bildern', () => {
    const labels = EXPORT_NOTICE.points.map((x) => x.label);
    expect(labels).toEqual(['Geschäftsgeheimnisse', 'Kundendaten', 'Personen auf Bildern']);
    expect(JSON.stringify(EXPORT_NOTICE)).not.toContain('ß');
  });

  it('Dateigrösse lesbar', () => {
    expect(formatFileSize(850)).toBe('850 Bytes');
    expect(formatFileSize(48 * 1024)).toBe('48 KB');
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe('2,4 MB');
  });
});

describe('Exportdienst mit echter Projektdatenbank', () => {
  let root: string;
  let projects: ProjectService;
  let media: MediaService;
  let journals: JournalService;
  let taxonomy: TaxonomyService;
  let converted: number;
  let service: ExportService;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'lj-x-'));
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
        company: null,
        apprenticeshipStart: '2024-08-01',
        specialization: 'print',
      },
      seedCategories: true,
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
    taxonomy = new TaxonomyService(
      () => projects.db,
      () => new Date(),
    );
    converted = 0;
    // Attrappe für die WebP-Umwandlung (echte Umwandlung: E2E-Test)
    service = new ExportService(
      () => projects.db,
      journals,
      media,
      async () => {
        converted++;
        return PNG;
      },
    );
  });
  afterEach(() => {
    projects.close();
    rmSync(root, { recursive: true, force: true });
  });

  const figure = (mediaId: string, caption: string): TiptapNode => ({
    type: 'figure',
    attrs: { mediaId, caption, alt: '' },
  });

  it('exportiert Metadaten, Zuordnungen und Bilder (PNG direkt, WebP umgewandelt)', async () => {
    const j = journals.create({ title: 'Druckplatte belichten', workDate: '2026-03-14' });
    journals.updateMeta(j.id, {
      title: j.title,
      workDate: j.workDate,
      learningPlace: 'uek',
      schoolYearOverride: null,
    });
    const cat = taxonomy.list().categories[0]!;
    taxonomy.setJournalCategories(j.id, [cat.id]);
    taxonomy.setJournalTags(j.id, ['CtP']);
    const png = media.add({ journalId: j.id, data: PNG, originalName: 'a.png' });
    const webp = media.add({ journalId: j.id, data: fixture('bild.webp'), originalName: 'b.webp' });
    journals.updateSections(j.id, {
      ...j.sections,
      durchfuehrung: { type: 'doc', content: [figure(png.id, 'Belichter'), figure(webp.id, 'Platte')] },
    });

    const { data, warnings } = await service.journalDocx(j.id);
    expect(warnings).toEqual([]);
    expect(converted).toBe(1);
    const zip = unzipSync(data);
    const xml = strFromU8(zip['word/document.xml']!);
    expect(count(xml, /<w:drawing>/g)).toBe(2);
    // Eingebettete Bilder sind PNG – kein WebP im Dokument
    const embedded = Object.keys(zip).filter((n) => n.startsWith('word/media/'));
    expect(embedded.every((n) => n.endsWith('.png'))).toBe(true);
    for (const text of [
      'Druckplatte belichten',
      'Lea Muster',
      '2. Lehrjahr, 2. Semester', // Lehrbeginn 1.8.2024, Arbeitsdatum 14.3.2026 (19 Monate)
      'überbetrieblicher Kurs (üK)',
      cat.name,
      'CtP',
      'Abbildung ',
    ])
      expect(xml).toContain(text);
    expect(service.suggestedName(j.id)).toBe('2026-03-14 Druckplatte belichten.docx');
  });

  it('manuell gesetztes Lehrjahr: ohne Semester', async () => {
    const j = journals.create({ title: 'X', workDate: '2026-03-14' });
    journals.updateMeta(j.id, {
      title: 'X',
      workDate: j.workDate,
      learningPlace: 'betrieb',
      schoolYearOverride: 3,
    });
    const e = service.loadJournal(j.id);
    expect([e.schoolYear, e.semester]).toEqual([3, null]);
  });

  it('Titel verlinkter Journale für den Hinweis im Text', () => {
    const target = journals.create({ title: 'ICC-Profile', workDate: '2026-03-01' });
    const j = journals.create({ title: 'Mit Link', workDate: '2026-03-14' });
    journals.updateSections(j.id, {
      ...j.sections,
      reflexion: para('Profil', [{ type: 'link', attrs: { href: journalLinkHref(target.id) } }]) as never,
    });
    expect(service.linkTitles(service.loadJournal(j.id))).toEqual(new Map([[target.id, 'ICC-Profile']]));
  });

  it('fehlende Bilddatei oder gescheiterte Umwandlung: Export gelingt mit Hinweis', async () => {
    const j = journals.create({ title: 'B', workDate: '2026-03-14' });
    const png = media.add({ journalId: j.id, data: PNG, originalName: 'a.png' });
    const webp = media.add({ journalId: j.id, data: fixture('bild.webp'), originalName: 'b.webp' });
    journals.updateSections(j.id, {
      ...j.sections,
      durchfuehrung: { type: 'doc', content: [figure(png.id, 'weg'), figure(webp.id, 'kaputt')] },
    });
    rmSync(media.resolve(png.id)!.file);
    const failing = new ExportService(
      () => projects.db,
      journals,
      media,
      async () => {
        throw new Error('kaputt');
      },
    );
    const { data, warnings } = await failing.journalDocx(j.id);
    expect(count(strFromU8(unzipSync(data)['word/document.xml']!), /\[Bild fehlt\]/g)).toBe(2);
    expect(warnings).toHaveLength(1); // gleicher Hinweis nur einmal
  });

  it('schreibt atomar; eine bestehende Datei bleibt bei einem Fehler unverändert', async () => {
    const j = journals.create({ title: 'A', workDate: '2026-03-14' });
    const target = path.join(root, 'A.docx');
    const r = await service.exportJournalDocx(j.id, target);
    expect(statSync(target).size).toBe(r.bytes);
    expect(strFromU8(unzipSync(readFileSync(target))['word/document.xml']!)).toContain('>A<');
    // Ziel in einem nicht vorhandenen Ordner → verständliche Meldung, keine Temp-Reste
    await expect(writeFileAtomic(path.join(root, 'fehlt', 'x.docx'), new Uint8Array(1))).rejects.toThrow(
      /noch erreichbar/,
    );
    writeFileSync(target, 'alt');
    await expect(writeFileAtomic(path.join(target, 'x.docx'), new Uint8Array(1))).rejects.toThrow();
    expect(readFileSync(target, 'utf8')).toBe('alt');
  });

  it('IPC: Hinweis muss bestätigt sein, Abbrechen, Speichern, Im Ordner anzeigen', async () => {
    const j = journals.create({ title: 'IPC', workDate: '2026-03-14' });
    let answer: string | null = null;
    let suggested = '';
    const shown: string[] = [];
    const handlers = createExportHandlers({
      service,
      chooseSavePath: async (s) => {
        suggested = s;
        return answer;
      },
      showInFolder: (f) => shown.push(f),
    });
    const dispatch = createIpcDispatcher(handlers as unknown as Handlers, () => true);
    const ev = { senderFrame: { url: 'app://lernjournal/index.html' } };

    // Ohne bestätigten Exporthinweis (R-10) wird nichts exportiert
    expect((await dispatch('export:journalDocx', ev, { id: j.id })).ok).toBe(false);
    expect((await dispatch('export:journalDocx', ev, { id: j.id, noticeAccepted: false })).ok).toBe(false);
    // Dialog abgebrochen
    expect(await dispatch('export:journalDocx', ev, { id: j.id, noticeAccepted: true })).toEqual({
      ok: true,
      data: { status: 'canceled' },
    });
    expect(suggested).toBe('2026-03-14 IPC.docx');
    expect(await dispatch('export:showFile', ev, undefined)).toEqual({ ok: true, data: { shown: false } });
    // Gespeichert (Endung ergänzt)
    answer = path.join(root, 'Bericht');
    const r = await dispatch('export:journalDocx', ev, { id: j.id, noticeAccepted: true });
    expect(r.ok && r.data).toMatchObject({ status: 'saved', fileName: 'Bericht.docx', warnings: [] });
    expect(ipcContract['export:journalDocx'].response.safeParse(r.ok && r.data).success).toBe(true);
    expect(existsSync(path.join(root, 'Bericht.docx'))).toBe(true);
    expect(await dispatch('export:showFile', ev, undefined)).toEqual({ ok: true, data: { shown: true } });
    expect(shown).toEqual([path.join(root, 'Bericht.docx')]);
    // Datei gesperrt (z. B. in Word geöffnet) → Meldung für Lernende
    answer = path.join(root, 'fehlt', 'x.docx');
    const locked = await dispatch('export:journalDocx', ev, { id: j.id, noticeAccepted: true });
    expect(locked.ok).toBe(false);
    expect(!locked.ok && locked.error.code).toBe('INVALID_REQUEST');
  });
});

// Gegenprobe mit einer zweiten Office-Software. Läuft nur, wenn LibreOffice
// installiert ist (lokal unter Linux; in der Windows-CI übersprungen).
const soffice = ['soffice', 'libreoffice'].find((cmd) => {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});
describe.skipIf(!soffice)('LibreOffice', () => {
  it('öffnet das Einzel-DOCX und erzeugt ein PDF', { timeout: 180_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lj-lo-'));
    try {
      const file = path.join(dir, 'einzel.docx');
      writeFileSync(file, (await parts()).bytes);
      execFileSync(soffice!, ['--headless', '--convert-to', 'pdf', '--outdir', dir, file], {
        stdio: 'ignore',
        timeout: 170_000,
      });
      const pdf = path.join(dir, 'einzel.pdf');
      expect(existsSync(pdf) && statSync(pdf).size > 10_000).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Bild im Test wirklich PNG? (Schutz gegen versehentlich getauschte Testdaten)
it('Testbild ist ein PNG 800 × 500', () => {
  expect(sniffImage(PNG)).toEqual({ mime: 'image/png', width: 800, height: 500 });
});

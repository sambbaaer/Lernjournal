// Automatisierte Prüfung des DOCX-Exports:  npm test
// Wir entpacken das DOCX (ist ein ZIP) und prüfen das WordprocessingML-XML
// auf die Elemente, die SPEC «Word-Export» verlangt. So merken wir sofort,
// wenn eine Bibliotheks-Aktualisierung etwas kaputt macht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { Packer } from 'docx';
import { journals, JOURNAL_IDS, type Journal } from '../src/fixtures.ts';
import { validateDoc } from '../src/schema.ts';
import { bookmarkFor, exportCollection, exportSingle, formatDateCH } from '../src/to-docx.ts';
import { resolveMedia } from '../src/media.ts';

const opts = { authorName: 'Muster Lernende', resolveMedia };

// Hilfsfunktion: DOCX erzeugen und die wichtigsten XML-Teile als Text liefern
async function parts(doc: Parameters<typeof Packer.toBuffer>[0]) {
  const zip = unzipSync(new Uint8Array(await Packer.toBuffer(doc)));
  const get = (name: string) => (zip[name] ? strFromU8(zip[name]) : '');
  const footers = Object.keys(zip).filter((n) => /^word\/footer\d*\.xml$/.test(n)).map(get).join('');
  return { zip, document: get('word/document.xml'), settings: get('word/settings.xml'), rels: get('word/_rels/document.xml.rels'), footers };
}
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

test('Testdaten sind gültiges Tiptap-JSON (Whitelist-Schema)', () => {
  for (const j of journals) for (const s of Object.values(j.sections)) validateDoc(s);
});

test('Schema lehnt nicht erlaubte Knoten ab (z. B. Code-Block)', () => {
  assert.throws(() => validateDoc({ type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }] }));
});

test('Sammel-DOCX: Überschriften, Listen, Tabelle, Bilder, Legenden, Links', async () => {
  const { doc, warnings } = exportCollection('Test', journals, opts);
  const p = await parts(doc);
  assert.deepEqual(warnings, []);
  // Native Formatvorlagen statt direkter Formatierung
  assert.equal(count(p.document, /<w:pStyle w:val="Heading1"\/>/g), 3, 'je Journal eine Überschrift 1');
  assert.equal(count(p.document, /<w:pStyle w:val="Heading2"\/>/g), 9, 'je Journal drei Abschnitte');
  // Tabelle mit wiederholter Kopfzeile
  assert.match(p.document, /<w:tbl>/);
  assert.match(p.document, /<w:tblHeader\/>/);
  // Zwei Bilder als echte Grafiken, zwei Legenden mit SEQ-Feld und vorberechneter Nummer
  assert.equal(count(p.document, /<w:drawing>/g), 2);
  assert.match(p.document, /SEQ Abbildung[^"]*"[^>]*>[\s\S]*?<w:t[^>]*>1<\/w:t>/);
  assert.match(p.document, /SEQ Abbildung[^"]*"[^>]*>[\s\S]*?<w:t[^>]*>2<\/w:t>/);
  // Inhaltsverzeichnis-Feld + Word soll Felder beim Öffnen aktualisieren
  assert.match(p.document, /TOC \\h/);
  // <w:updateFields/> ohne val bedeutet in OOXML «true»
  assert.match(p.settings, /<w:updateFields( w:val="(true|1|on)")?\/>/);
  // Seitenzahlen «Seite X von Y» in der Fusszeile
  assert.match(p.footers, /PAGE/);
  assert.match(p.footers, /NUMPAGES/);
  // Interne Links springen zu Textmarken der Journale
  assert.match(p.document, new RegExp(`<w:bookmarkStart[^>]*w:name="${bookmarkFor(JOURNAL_IDS.platte)}"`));
  assert.match(p.document, new RegExp(`<w:hyperlink[^>]*w:anchor="${bookmarkFor(JOURNAL_IDS.platte)}"`));
  // Link auf Journal ausserhalb des Exports → Text mit Hinweis, kein toter Link
  assert.match(p.document, /nicht in diesem Export/);
  assert.doesNotMatch(p.document, /w:anchor="j_00000000/);
  // Externer Link als echter Hyperlink
  assert.match(p.rels, /Target="https:\/\/fogra.org"[^>]*TargetMode="External"/);
});

test('Zweite nummerierte Liste beginnt wieder bei 1 (eigene numId)', async () => {
  const falz = journals.find((j) => j.id === JOURNAL_IDS.falz)!;
  const p = await parts(exportSingle(falz, opts).doc);
  const numIds = new Set([...p.document.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]));
  assert.equal(numIds.size, 2, `erwartet zwei Listen-Instanzen, gefunden: ${[...numIds]}`);
});

test('Unbekannter Knoten: Text bleibt erhalten, Warnung wird gemeldet', async () => {
  const j: Journal = structuredClone(journals[1]);
  j.sections.reflexion = { type: 'doc', content: [{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wichtiger Gedanke' }] }] }] };
  const { doc, warnings } = exportSingle(j, opts);
  const p = await parts(doc);
  assert.match(p.document, /Wichtiger Gedanke/);
  assert.equal(warnings.length, 1);
});

test('Unsichere Link-Ziele (javascript:, file:) werden nicht verlinkt', async () => {
  const j: Journal = structuredClone(journals[1]);
  j.sections.reflexion = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Klick', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] };
  const { doc, warnings } = exportSingle(j, opts);
  const p = await parts(doc);
  assert.doesNotMatch(p.rels, /javascript:/);
  assert.match(p.document, /Klick/);
  assert.equal(warnings.length, 1);
});

test('Fehlendes Bild: Platzhalter statt Absturz', async () => {
  const j: Journal = structuredClone(journals[1]);
  j.sections.reflexion = { type: 'doc', content: [{ type: 'figure', attrs: { mediaId: 'gibt-es-nicht', caption: 'x', alt: '' } }] };
  const { doc, warnings } = exportSingle(j, opts);
  assert.match((await parts(doc)).document, /Bild fehlt/);
  assert.equal(warnings.length, 1);
});

test('Hilfsfunktionen: Schweizer Datum, gültige Textmarken', () => {
  assert.equal(formatDateCH('2026-03-14'), '14.03.2026');
  const b = bookmarkFor('3f2a9c1e-6b7d-4e21-9a4f-0c5d8e7b1a23');
  assert.ok(b.length <= 40 && /^[A-Za-z][A-Za-z0-9_]*$/.test(b));
});

// Gegenprobe mit einer zweiten Office-Software. Läuft nur, wenn LibreOffice installiert ist.
const soffice = ['soffice', 'libreoffice'].find((cmd) => {
  try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; }
});
test('LibreOffice öffnet das Sammel-DOCX und erzeugt ein PDF', { skip: !soffice && 'LibreOffice nicht installiert', timeout: 180000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aj00b-'));
  const file = path.join(dir, 'sammel.docx');
  fs.writeFileSync(file, await Packer.toBuffer(exportCollection('Test', journals, opts).doc));
  execFileSync(soffice!, ['--headless', '--convert-to', 'pdf', '--outdir', dir, file], { stdio: 'ignore', timeout: 170000 });
  const pdf = path.join(dir, 'sammel.pdf');
  assert.ok(fs.existsSync(pdf) && fs.statSync(pdf).size > 10000, 'PDF fehlt oder ist leer');
});

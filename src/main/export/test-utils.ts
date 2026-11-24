// Hilfen für die Tests des Word-Exports (Einzel- und Sammel-DOCX). Nur von
// *.test.ts genutzt; liegt neben den Tests, damit beide Dateien dieselbe
// Normalisierung der Golden Files verwenden.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';

// Golden-File-Vergleich: Werte, die `docx` zufällig oder prozessweit zählend
// vergibt (Beziehungs-IDs, Textmarken-/Bild-IDs, Namen der Verzeichnis-
// Textmarken «_TocN»), werden in der Reihenfolge ihres Auftretens
// durchnummeriert – die Struktur bleibt so vollständig vergleichbar. Ein Tag
// pro Zeile macht Unterschiede im Diff lesbar.
export function normalize(xml: string): string {
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
    .replace(/_Toc(\d+)/g, (_, v: string) => stable('_Toc', v))
    .replace(/></g, '>\n<');
}

// Entpacktes DOCX: XML-Teile als Text (fehlender Teil = leerer Text)
export function docxParts(bytes: Uint8Array) {
  const zip = unzipSync(bytes);
  const get = (name: string) => (zip[name] ? strFromU8(zip[name]) : '');
  return {
    bytes,
    zip,
    get,
    document: get('word/document.xml'),
    styles: get('word/styles.xml'),
    numbering: get('word/numbering.xml'),
    rels: get('word/_rels/document.xml.rels'),
    settings: get('word/settings.xml'),
    core: get('docProps/core.xml'),
  };
}

export const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

// --- Gegenprobe mit LibreOffice ---------------------------------------------

// LibreOffice, falls installiert (lokal unter Linux; in der Windows-CI fehlt es)
export const soffice = ['soffice', 'libreoffice'].find((cmd) => {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});

// DOCX → PDF mit LibreOffice; liefert die Grösse des PDF (0 = nicht erzeugt).
// Eigenes Benutzerprofil je Aufruf: Vitest führt Testdateien parallel aus, und
// zwei LibreOffice-Prozesse mit demselben Profil behindern sich gegenseitig.
export function convertWithLibreOffice(docx: Uint8Array, name: string): number {
  const dir = mkdtempSync(path.join(tmpdir(), 'lj-lo-'));
  try {
    const file = path.join(dir, `${name}.docx`);
    writeFileSync(file, docx);
    execFileSync(
      soffice!,
      [
        `-env:UserInstallation=${pathToFileURL(path.join(dir, 'profil')).href}`,
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        dir,
        file,
      ],
      { stdio: 'ignore', timeout: 170_000 },
    );
    const pdf = path.join(dir, `${name}.pdf`);
    return existsSync(pdf) ? statSync(pdf).size : 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

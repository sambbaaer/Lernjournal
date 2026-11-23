// Erzeugt die Beispiel-Exporte:  npm run build
//   out/einzel.docx  – ein Journal
//   out/sammel.docx  – drei Journale mit Titelseite und Inhaltsverzeichnis
import fs from 'node:fs';
import path from 'node:path';
import { Packer } from 'docx';
import { journals } from './fixtures.ts';
import { validateDoc } from './schema.ts';
import { exportCollection, exportSingle } from './to-docx.ts';
import { resolveMedia } from './media.ts';

const root = path.resolve(import.meta.dirname, '..');

// 1) Testdaten gegen das echte Tiptap-Schema prüfen
for (const j of journals) for (const s of Object.values(j.sections)) validateDoc(s);

// 2) Exportieren
const opts = { authorName: 'Muster Lernende', resolveMedia };
const outDir = path.join(root, 'out');
fs.mkdirSync(outDir, { recursive: true });

const single = exportSingle(journals[0], opts);
fs.writeFileSync(path.join(outDir, 'einzel.docx'), await Packer.toBuffer(single.doc));

const coll = exportCollection('Lerndokumentation 2. Lehrjahr', journals, opts);
fs.writeFileSync(path.join(outDir, 'sammel.docx'), await Packer.toBuffer(coll.doc));

console.log('Schema ok, geschrieben nach', outDir);
console.log('Warnungen:', [...single.warnings, ...coll.warnings]);

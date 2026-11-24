// Gibt die Store-Identität aus, mit der electron-builder das MSIX baut
// (AJ-16b): aus den Umgebungsvariablen LERNJOURNAL_STORE_* oder – ohne sie –
// die Platzhalter für Testbuilds. Als JSON, damit die CI daraus das
// Testzertifikat (Subject = Publisher) erzeugen und das installierte Paket
// finden kann. Eine Quelle für alles: electron-builder.ts.
//
//   node scripts/store-identity.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
try {
  // Dynamisch: Schon das Laden von electron-builder.ts prüft die Identität und
  // kann mit einer verständlichen Meldung abbrechen
  const { storeIdentity, storeVersion } = await import('../electron-builder.ts');
  console.log(JSON.stringify({ ...storeIdentity(process.env), version: storeVersion(version) }, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

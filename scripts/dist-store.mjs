// Store-Paket bauen (AJ-16b, docs/STORE.md): nur das MSIX, mit der echten
// Identität aus Partner Center, unsigniert – der Microsoft Store signiert das
// Paket bei der Einreichung selbst.
//
//   npm run dist:store     (unter Windows; vorher LERNJOURNAL_STORE_* setzen)
//
// Warum ein eigenes Skript statt nur «electron-builder --win appx»?
//   1. Es verlangt die Identität (LERNJOURNAL_REQUIRE_STORE_IDENTITY=1): Mit
//      Platzhaltern bricht es ab, bevor gebaut wird.
//   2. Es prüft die Version: vierteilig mit 0 am Schluss, keine Vorabversion.
//   3. Es entfernt die Signing-Variablen (CSC_LINK, Azure …) für diesen Build:
//      Ein eigenes Zertifikat passt nie zur Store-Identität (Publisher), und
//      electron-builder würde das MSIX damit signieren wollen.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
// Partner-Center-Standardwerte (per Umgebungsvariable überschreibbar)
import { PARTNER_CENTER_DEFAULTS } from './store-defaults.mjs';

const root = path.resolve(import.meta.dirname, '..');
const { version, productName } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

// Dynamisch, damit auch ein Fehler beim Laden (Identität ungültig) nur als Meldung erscheint
const builderConfig = await import('../electron-builder.ts').catch((err) => {
  console.error(`Abbruch: ${err.message}`);
  process.exit(1);
});
const { AZURE_SIGN_ENV, REQUIRE_STORE_IDENTITY_ENV, storeIdentity, storeVersion } = builderConfig;

const env = { ...PARTNER_CENTER_DEFAULTS, ...process.env, [REQUIRE_STORE_IDENTITY_ENV]: '1' };
for (const name of [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'LERNJOURNAL_REQUIRE_SIGNING',
  ...Object.values(AZURE_SIGN_ENV),
]) {
  delete env[name];
}

let identity;
let msixVersion;
try {
  identity = storeIdentity(env);
  msixVersion = storeVersion(version);
} catch (err) {
  console.error(`Abbruch: ${err.message}`);
  process.exit(1);
}
console.log(`Store-Paket ${msixVersion} für ${identity.identityName} (${identity.publisher})`);

const run = (command, args) => {
  const r = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
// 1) Programm bauen, 2) nur das MSIX paketieren
run('npm', ['run', 'build']);
const cli = createRequire(import.meta.url).resolve('electron-builder/cli.js');
run(process.execPath, [cli, '--win', 'appx', '--x64', '--publish', 'never']);

const file = path.join(root, 'dist', `${productName}-Store-${version}.msix`);
if (!existsSync(file)) {
  console.error(`Erwartete Datei fehlt: ${file}`);
  process.exit(1);
}
console.log(`\nFertig: ${file}`);
console.log('Prüfen: npm run verify:store – dann in Partner Center hochladen (docs/STORE.md).');

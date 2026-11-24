// Prüft das fertige Paket in dist/ (AJ-16):
//   - Fuses in der EXE entsprechen electron-builder.ts
//   - app.asar enthält den gebauten Code und genau die Laufzeitabhängigkeiten –
//     keine Quellen, Tests, Spikes, Golden Files, Dokumentation, Dev-Pakete
//   - nichts ausgepackt, keine Update-Konfiguration, nur die gewählten Sprachen
//   - Installer und portable EXE verlangen keine Adminrechte (Manifest asInvoker)
//   - MSIX (Microsoft Store, AJ-16b): AppxManifest.xml mit Identität, Version
//     (vierteilig, letzte Stelle 0), Sprachen, nur runFullTrust, nur der
//     Befehlszeilen-Aufruf; eigene Logos statt Beispielbilder; Programm darin mit
//     denselben Fuses und genau derselben app.asar wie win-unpacked
// Optional: SHA-256-Prüfsummen der EXE- und MSIX-Dateien nach dist/SHA256SUMS.txt (IT-Merkblatt).
//
//   node scripts/verify-package.mjs [--dist dist] [--require-installers] [--checksums]
// --require-installers verlangt Testinstaller, portable EXE und MSIX.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { unzipSync } from 'fflate';
import config, { storeVersion } from '../electron-builder.ts';
import { APPX_LOGOS } from './appx-assets.ts';
import {
  checkAppFiles,
  checkAppxAssets,
  checkAppxManifest,
  checkExecutionLevel,
  checkFuses,
  listAsarFiles,
  productionPackages,
  readFuseWire,
} from './package-checks.ts';

const root = path.resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  options: {
    dist: { type: 'string', default: path.join(root, 'dist') },
    'require-installers': { type: 'boolean', default: false },
    checksums: { type: 'boolean', default: false },
  },
});
const dist = path.resolve(values.dist);
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const productName = config.productName;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const problems = [];
const report = (label, list) => {
  console.log(`${list.length ? 'FEHLER' : 'OK    '} ${label}`);
  for (const p of list) console.log(`         ${p}`);
  problems.push(...list);
};

const unpacked = [
  { dir: 'win-unpacked', exe: `${productName}.exe` },
  { dir: 'linux-unpacked', exe: 'lernjournal' },
].filter((u) => existsSync(path.join(dist, u.dir)));
if (unpacked.length === 0) {
  console.error(`Kein entpacktes Paket in ${dist} (zuerst npm run dist:win oder npm run dist:dir)`);
  process.exit(2);
}

const packages = productionPackages(root);
console.log(`Laufzeitabhängigkeiten: ${[...packages.production].sort().join(', ')}`);

for (const u of unpacked) {
  const base = path.join(dist, u.dir);
  const exe = path.join(base, u.exe);
  console.log(`\n${u.dir}`);
  if (!existsSync(exe)) {
    report('Programmdatei', [`Fehlt: ${exe}`]);
    continue;
  }
  report('Electron-Fuses', checkFuses(readFuseWire(readFileSync(exe)), config.electronFuses ?? {}));
  if (u.exe.endsWith('.exe'))
    report('Programm ohne Adminrechte', checkExecutionLevel(readFileSync(exe), u.exe));

  const asarPath = path.join(base, 'resources', 'app.asar');
  const files = existsSync(asarPath) ? listAsarFiles(readFileSync(asarPath)) : [];
  report(
    `Inhalt von app.asar (${files.length} Dateien, ${existsSync(asarPath) ? mb(statSync(asarPath).size) : '–'})`,
    existsSync(asarPath) ? checkAppFiles(files, packages) : ['app.asar fehlt (asar: true?)'],
  );

  // elevate.exe: electron-builder legt sein Hilfsprogramm zum Anfordern von
  // Adminrechten immer in die portable EXE (dort gibt es keine Einstellung dafür)
  // und kopiert es danach nach win-unpacked. Lernjournal ruft es nie auf; der
  // Installer hat es nicht (packElevateHelper: false, in der CI geprüft).
  const known = u.dir === 'win-unpacked' ? ['elevate.exe'] : [];
  const resources = readdirSync(path.join(base, 'resources'));
  for (const f of resources.filter((r) => known.includes(r))) {
    console.log(`HINWEIS ${f} neben app.asar (aus der portablen EXE, wird nie aufgerufen)`);
  }
  report(
    'Ordner resources',
    resources
      .filter((f) => f !== 'app.asar' && !known.includes(f))
      .map((f) => `Unerwartet neben app.asar: ${f} (Update-Konfiguration? ausgepackt?)`),
  );

  const languages = [config.electronLanguages ?? []].flat();
  const locales = existsSync(path.join(base, 'locales')) ? readdirSync(path.join(base, 'locales')) : [];
  report(
    `Sprachdateien (${locales.join(', ')})`,
    languages.length
      ? [
          ...locales
            .filter((f) => !languages.includes(f.replace(/\.pak$/, '')))
            .map((f) => `Nicht gewählt: ${f}`),
          ...languages.filter((l) => !locales.includes(`${l}.pak`)).map((l) => `Fehlt: ${l}.pak`),
        ]
      : [],
  );
}

// Windows-Artefakte: Testinstaller (NSIS) und portable EXE
const artifacts = [
  { label: 'Installer', file: path.join(dist, `${productName}-Setup-${version}.exe`) },
  { label: 'Portable EXE', file: path.join(dist, `${productName}-Portable-${version}.exe`) },
];
const present = artifacts.filter((a) => existsSync(a.file));
if (present.length || values['require-installers']) console.log('\nWindows-Artefakte');
for (const a of artifacts) {
  if (!existsSync(a.file)) {
    if (values['require-installers']) report(a.label, [`Fehlt: ${path.basename(a.file)}`]);
    continue;
  }
  report(
    `${a.label} ohne Adminrechte (${path.basename(a.file)}, ${mb(statSync(a.file).size)})`,
    checkExecutionLevel(readFileSync(a.file), a.label),
  );
}

// MSIX für den Microsoft Store
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const msixFile = path.join(dist, `${productName}-Store-${version}.msix`);
if (existsSync(msixFile)) {
  console.log(`\nMSIX (${path.basename(msixFile)}, ${mb(statSync(msixFile).size)})`);
  const exeEntry = `app/${productName}.exe`;
  const asarEntry = 'app/resources/app.asar';
  // Nur die Dateien entpacken, die wir prüfen (das Paket ist gross)
  const names = [];
  const files = unzipSync(readFileSync(msixFile), {
    filter: (f) => {
      names.push(f.name);
      return ['AppxManifest.xml', exeEntry, asarEntry].includes(f.name);
    },
  });
  const appx = config.appx ?? {};
  const manifest = files['AppxManifest.xml'] ? Buffer.from(files['AppxManifest.xml']).toString('utf8') : '';
  report(
    'AppxManifest.xml (Identität, Version, Sprachen, nur runFullTrust)',
    manifest
      ? checkAppxManifest(manifest, {
          identityName: appx.identityName,
          publisher: appx.publisher,
          publisherDisplayName: appx.publisherDisplayName,
          displayName: appx.displayName,
          applicationId: appx.applicationId,
          version: storeVersion(version),
          languages: [appx.languages ?? []].flat(),
          executable: `app\\${productName}.exe`,
          minVersion: appx.minVersion,
        })
      : ['AppxManifest.xml fehlt'],
  );
  if (/PLATZHALTER/.test(manifest))
    console.log('HINWEIS Identität mit Platzhaltern – nur zum Testen, nicht für den Store (docs/STORE.md)');
  report(
    'Logos (eigene, alle Standardgrössen)',
    checkAppxAssets(
      names,
      APPX_LOGOS.filter((l) => l.required).map((l) => l.name),
    ),
  );
  if (files[exeEntry]) {
    report(
      'Programm im MSIX: Electron-Fuses',
      checkFuses(readFuseWire(files[exeEntry]), config.electronFuses ?? {}),
    );
  } else report('Programm im MSIX', [`Fehlt: ${exeEntry}`]);
  const unpackedAsar = path.join(dist, 'win-unpacked', 'resources', 'app.asar');
  report(
    'app.asar im MSIX gleich wie in win-unpacked',
    !files[asarEntry]
      ? [`Fehlt: ${asarEntry}`]
      : existsSync(unpackedAsar) && sha256(files[asarEntry]) !== sha256(readFileSync(unpackedAsar))
        ? ['app.asar im MSIX weicht von win-unpacked ab']
        : [],
  );
} else if (values['require-installers']) {
  report('MSIX', [`Fehlt: ${path.basename(msixFile)}`]);
}

if (values.checksums) {
  const exes = readdirSync(dist).filter((f) => f.endsWith('.exe') || f.endsWith('.msix'));
  const lines = exes.map(
    (f) =>
      `${createHash('sha256')
        .update(readFileSync(path.join(dist, f)))
        .digest('hex')}  ${f}`,
  );
  const winExe = path.join(dist, 'win-unpacked', `${productName}.exe`);
  if (existsSync(winExe)) {
    // Die installierte bzw. entpackte Programmdatei (für Hash-Regeln, IT-Merkblatt)
    lines.push(
      `${createHash('sha256').update(readFileSync(winExe)).digest('hex')}  win-unpacked/${productName}.exe`,
    );
  }
  writeFileSync(path.join(dist, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
  console.log(`\nPrüfsummen: ${path.join(dist, 'SHA256SUMS.txt')}\n${lines.join('\n')}`);
}

console.log(problems.length ? `\n${problems.length} Problem(e) gefunden.` : '\nPaket in Ordnung.');
process.exit(problems.length ? 1 : 0);

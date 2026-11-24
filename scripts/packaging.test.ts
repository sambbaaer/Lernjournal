// Tests für die Paketierung (AJ-16): Konfiguration von electron-builder,
// Prüfungen am fertigen Paket, Netzwerkprotokoll, Programmsymbol.
// Das echte Paket prüfen scripts/verify-package.mjs und scripts/self-test.mjs (CI).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NsisOptions, PortableOptions, TargetConfiguration } from 'electron-builder';
import defaultConfig, { AZURE_SIGN_ENV, createConfig, signingOptions } from '../electron-builder';
import { encodeIco, parseIco } from './icon';
import {
  checkAppFiles,
  checkExecutionLevel,
  checkFuses,
  externalNetworkActivity,
  FUSE_INDEX,
  FUSE_SENTINEL,
  listAsarFiles,
  productionPackages,
  readFuseWire,
  REQUIRED_APP_FILES,
  type AsarFile,
} from './package-checks';

const root = path.resolve(import.meta.dirname, '..');

describe('electron-builder.ts', () => {
  const config = createConfig({});
  const nsis = config.nsis as NsisOptions;
  const portable = config.portable as PortableOptions;

  it('baut Installer und portable EXE für x64', () => {
    expect(config.win?.target).toEqual<TargetConfiguration[]>([
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ]);
    expect(nsis.artifactName).toBe('${productName}-Setup-${version}.${ext}');
    expect(portable.artifactName).toBe('${productName}-Portable-${version}.${ext}');
  });

  it('Installer pro Benutzer ohne Adminrechte, ohne Hilfsprogramm zum Erhöhen', () => {
    expect(nsis.perMachine).toBe(false);
    expect(nsis.oneClick).toBe(true);
    expect(nsis.packElevateHelper).toBe(false);
    expect(portable.requestExecutionLevel).toBe('user');
    expect(config.win?.requestedExecutionLevel).toBe('asInvoker');
  });

  it('Deinstallation löscht keine Daten der Lernenden', () => {
    expect(nsis.deleteAppDataOnUninstall).toBe(false);
  });

  it('Installer auf Deutsch, Verknüpfungen im Startmenü und auf dem Desktop', () => {
    expect(nsis.installerLanguages).toEqual(['de_DE']);
    expect(nsis.language).toBe('1031');
    expect(nsis.createStartMenuShortcut).toBe(true);
    expect(nsis.createDesktopShortcut).toBe(true);
  });

  it('kein Auto-Update, keine Dateizuordnung, keine nativen Module', () => {
    expect(config.publish).toBeNull();
    expect(nsis.differentialPackage).toBe(false);
    expect(config.fileAssociations).toBeUndefined();
    expect(config.win?.fileAssociations).toBeUndefined();
    expect(config.npmRebuild).toBe(false);
  });

  it('packt nur den gebauten Code in app.asar', () => {
    expect(config.asar).toBe(true);
    const files = config.files as string[];
    expect(files).toContain('out/**');
    expect(files).toContain('package.json');
    // Nichts aus den Projektordnern wird ausdrücklich aufgenommen
    for (const pattern of files.filter((f) => !f.startsWith('!'))) {
      expect(pattern).toMatch(/^(out\/\*\*|package\.json)$/);
    }
    expect(files).toContain('!out/**/*.map');
  });

  it('setzt die Sicherheits-Fuses (SPEC, ADR 0003)', () => {
    expect(config.electronFuses).toEqual({
      runAsNode: false,
      enableNodeCliInspectArguments: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      enableCookieEncryption: true,
      grantFileProtocolExtraPrivileges: false,
    });
  });

  it('Produktname, App-ID und Symbol', () => {
    expect(config.productName).toBe('Lernjournal');
    expect(config.appId).toBe('ch.lernjournal.app');
    expect(config.win?.icon).toBe('build/icon.ico');
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.productName).toBe(config.productName);
  });

  it('Standardexport entspricht der Konfiguration ohne Signing-Variablen', () => {
    // Die Testumgebung setzt keine Signing-Variablen
    if (!process.env['LERNJOURNAL_REQUIRE_SIGNING'] && !process.env[AZURE_SIGN_ENV.endpoint]) {
      expect(defaultConfig).toEqual(config);
    }
  });
});

describe('Code-Signing', () => {
  const azureEnv = {
    [AZURE_SIGN_ENV.endpoint]: 'https://weu.codesigning.azure.net',
    [AZURE_SIGN_ENV.codeSigningAccountName]: 'konto',
    [AZURE_SIGN_ENV.certificateProfileName]: 'profil',
    [AZURE_SIGN_ENV.publisherName]: 'Lernjournal',
  };

  it('ohne Variablen: signtool mit SHA-256 und Zeitstempel (signiert nur mit CSC_LINK)', () => {
    expect(signingOptions({})).toEqual({
      signtoolOptions: {
        signingHashAlgorithms: ['sha256'],
        rfc3161TimeStampServer: 'http://timestamp.digicert.com',
      },
    });
    expect(createConfig({}).forceCodeSigning).toBe(false);
  });

  it('Azure Trusted Signing, wenn alle vier Angaben gesetzt sind', () => {
    const options = signingOptions(azureEnv);
    expect(options.signtoolOptions).toBeUndefined();
    expect(options.azureSignOptions).toEqual({
      endpoint: 'https://weu.codesigning.azure.net',
      codeSigningAccountName: 'konto',
      certificateProfileName: 'profil',
      publisherName: 'Lernjournal',
    });
  });

  it('unvollständige Azure-Angaben brechen mit verständlicher Meldung ab', () => {
    expect(() => signingOptions({ [AZURE_SIGN_ENV.endpoint]: 'https://x' })).toThrow(
      /unvollständig, es fehlt: LERNJOURNAL_AZURE_SIGN_ACCOUNT, LERNJOURNAL_AZURE_SIGN_PROFILE/,
    );
  });

  it('Release-Build verlangt eine Signatur', () => {
    expect(createConfig({ LERNJOURNAL_REQUIRE_SIGNING: '1' }).forceCodeSigning).toBe(true);
  });

  it('keine Zertifikate oder Passwörter in der Konfiguration', () => {
    const text = JSON.stringify(createConfig(azureEnv));
    expect(text).not.toMatch(/certificatePassword|certificateFile|cscLink|cscKeyPassword|\.pfx/i);
  });
});

describe('Fuses lesen', () => {
  const exeWith = (states: string, version = 1) =>
    Buffer.concat([
      Buffer.from('MZ…Programmcode…'),
      Buffer.from(FUSE_SENTINEL, 'latin1'),
      Buffer.from([version, states.length]),
      Buffer.from(states, 'latin1'),
      Buffer.from('…Rest'),
    ]);
  const expected = createConfig({}).electronFuses as Record<keyof typeof FUSE_INDEX, boolean>;
  // Reihenfolge laut FUSE_INDEX: runAsNode, cookie, nodeOptions, inspect, asarIntegrity, onlyAsar, snapshot, file
  const good = '01001100';

  it('liest den Fuse-Block und bestätigt die Konfiguration', () => {
    const wire = readFuseWire(exeWith(good));
    expect(wire?.version).toBe(1);
    expect(checkFuses(wire, expected)).toEqual([]);
  });

  it('meldet jede abweichende Fuse', () => {
    expect(checkFuses(readFuseWire(exeWith('11011000')), expected)).toEqual([
      'Fuse runAsNode ist an, erwartet aus',
      'Fuse enableNodeCliInspectArguments ist an, erwartet aus',
      'Fuse onlyLoadAppFromAsar ist aus, erwartet an',
    ]);
  });

  it('meldet fehlenden Block, fremde Version und unbekannte Zustände', () => {
    expect(checkFuses(readFuseWire(Buffer.from('keine Fuses hier')), expected)).toEqual([
      'Kein Fuse-Block in der EXE gefunden',
    ]);
    expect(checkFuses(readFuseWire(exeWith(good, 2)), expected)).toEqual(['Unbekannte Fuse-Version 2']);
    expect(checkFuses(readFuseWire(exeWith('0100')), expected)[0]).toMatch(
      /enableEmbeddedAsarIntegrityValidation: unbekannter Zustand/,
    );
  });
});

// app.asar von Hand bauen: Pickle-Kopf mit JSON, danach die Dateiinhalte
function makeAsar(tree: object): Buffer {
  const json = Buffer.from(JSON.stringify({ files: tree }));
  const padded = Math.ceil(json.length / 4) * 4;
  const head = Buffer.alloc(16);
  head.writeUInt32LE(4, 0);
  head.writeUInt32LE(padded + 8, 4);
  head.writeUInt32LE(padded + 4, 8);
  head.writeUInt32LE(json.length, 12);
  return Buffer.concat([head, json, Buffer.alloc(padded - json.length), Buffer.from('inhalt')]);
}

describe('Inhalt von app.asar', () => {
  const file = (size = 1) => ({ size, offset: '0' });
  const goodTree = {
    'package.json': file(),
    out: {
      files: {
        main: { files: { 'index.js': file(100) } },
        preload: { files: { 'index.cjs': file() } },
        renderer: { files: { 'index.html': file(), assets: { files: { 'index-abc.js': file() } } } },
      },
    },
    node_modules: {
      files: {
        zod: { files: { 'package.json': file(), 'index.js': file() } },
        docx: { files: { 'package.json': file(), dist: { files: { 'index.mjs': file() } } } },
        '@types': { files: { node: { files: { 'package.json': file() } } } },
      },
    },
  };
  const packages = {
    production: new Set(['zod', 'docx', '@types/node']),
    devOnly: new Set(['react', 'vitest', 'electron']),
  };

  it('liest die Dateiliste aus dem Kopf', () => {
    const files = listAsarFiles(makeAsar(goodTree));
    expect(files.map((f) => f.path)).toEqual(
      expect.arrayContaining(['package.json', 'out/main/index.js', 'node_modules/@types/node/package.json']),
    );
    expect(files.find((f) => f.path === 'out/main/index.js')?.size).toBe(100);
  });

  it('lehnt kaputte Dateien ab', () => {
    expect(() => listAsarFiles(Buffer.from('nicht asar'))).toThrow(/Keine gültige app.asar/);
    const broken = makeAsar(goodTree);
    broken.writeUInt32LE(10_000_000, 12);
    expect(() => listAsarFiles(broken)).toThrow(/beschädigt/);
  });

  it('akzeptiert gebauten Code mit Laufzeitabhängigkeiten', () => {
    expect(checkAppFiles(listAsarFiles(makeAsar(goodTree)), packages)).toEqual([]);
  });

  it('meldet fehlende Pflichtdateien', () => {
    expect(checkAppFiles([], packages)).toEqual(REQUIRED_APP_FILES.map((f) => `Fehlt im Paket: ${f}`));
  });

  it.each([
    ['src/main/index.ts', /Projektordner/],
    ['spikes/aj-00a-sqlite/main.js', /Projektordner/],
    ['e2e/smoke.test.mjs', /Projektordner/],
    ['docs/SPEC.md', /Projektordner/],
    ['out/main/__golden__/einzel.document.xml', /Golden File/],
    ['out/main/export.test.js', /Testdatei/],
    ['out/main/index.js.map', /Source Map/],
    ['node_modules/zod/src/index.ts', /TypeScript-Quelle/],
    ['out/.env', /Umgebungsdatei/],
    ['electron-builder.ts', /Build-Konfiguration/],
    ['out/zertifikat.pfx', /Schlüssel oder Zertifikat/],
  ])('lehnt %s ab', (p, reason) => {
    const files: AsarFile[] = [...listAsarFiles(makeAsar(goodTree)), { path: p, size: 1, unpacked: false }];
    const problems = checkAppFiles(files, packages);
    expect(problems.some((x) => reason.test(x) && x.includes(p))).toBe(true);
  });

  it('meldet Dev-Pakete, fremde Pakete, Dateien ausserhalb von out/ und Ausgepacktes', () => {
    const base = listAsarFiles(makeAsar(goodTree));
    const extra: AsarFile[] = [
      { path: 'node_modules/react/index.js', size: 1, unpacked: false },
      { path: 'node_modules/docx/node_modules/fremd/index.js', size: 1, unpacked: false },
      { path: 'README.txt', size: 1, unpacked: false },
      { path: 'node_modules/zod/native.node', size: 1, unpacked: true },
    ];
    expect(checkAppFiles([...base, ...extra], packages)).toEqual([
      'Unerwartete Datei im Paket: README.txt',
      'Ausgepackt statt in app.asar: node_modules/zod/native.node',
      'Keine Laufzeitabhängigkeit, aber im Paket: react',
      'Keine Laufzeitabhängigkeit, aber im Paket: fremd',
    ]);
  });

  it('ermittelt die Laufzeitabhängigkeiten aus node_modules', () => {
    const { production, devOnly } = productionPackages(root);
    expect(production).toContain('docx');
    expect(production).toContain('zod');
    // fflate ist Testabhängigkeit, aber auch Abhängigkeit von docx → darf rein
    expect(production).toContain('fflate');
    expect(devOnly).not.toContain('fflate');
    for (const dev of ['electron', 'electron-builder', 'react', 'vitest', 'playwright', '@tiptap/core']) {
      expect(devOnly).toContain(dev);
      expect(production).not.toContain(dev);
    }
  });
});

describe('Rechte im Manifest', () => {
  const manifest = (level: string) =>
    Buffer.from(`MZ…<requestedPrivileges><requestedExecutionLevel level="${level}" uiAccess="false"/>…`);

  it('asInvoker = ohne Adminrechte', () => {
    expect(checkExecutionLevel(manifest('asInvoker'), 'Installer')).toEqual([]);
  });

  it('meldet erhöhte Rechte und fehlendes Manifest', () => {
    expect(checkExecutionLevel(manifest('requireAdministrator'), 'Installer')).toEqual([
      'Installer verlangt erhöhte Rechte (requireAdministrator)',
    ]);
    expect(checkExecutionLevel(manifest('highestAvailable'), 'Portable EXE')[0]).toMatch(/highestAvailable/);
    expect(checkExecutionLevel(Buffer.from('MZ ohne Manifest'), 'Installer')[0]).toMatch(/kein Manifest/);
  });
});

describe('Netzwerkprotokoll', () => {
  const constants = {
    logEventTypes: {
      URL_REQUEST_START_JOB: 1,
      TCP_CONNECT: 2,
      HOST_RESOLVER_MANAGER_REQUEST: 3,
      DNS_CONFIG_CHANGED: 4,
      HOST_RESOLVER_MANAGER_IPV6_REACHABILITY_CHECK: 5,
    },
  };
  const log = (events: object[]) => JSON.stringify({ constants, events });

  it('nur eigenes Protokoll und Loopback: nichts zu melden', () => {
    const text = log([
      { type: 1, params: { url: 'app://lernjournal/index.html' } },
      { type: 1, params: { url: 'http://127.0.0.1:5173/' } },
      { type: 2, params: { address_list: ['127.0.0.1:5173'] } },
      { type: 2, params: {} },
      { type: 4, params: { nameservers: ['10.0.0.1:53'] } },
    ]);
    expect(externalNetworkActivity(text)).toEqual([]);
  });

  it('meldet Anfragen, Namensauflösung und Verbindungen ins Netz', () => {
    const text = log([
      { type: 1, params: { url: 'https://redirector.gvt1.com/edgedl/chrome/dict/de-de-3-0.bdic' } },
      { type: 3, params: { host: 'https://redirector.gvt1.com' } },
      { type: 2, params: { address_list: ['142.250.1.1:443'] } },
      { type: 5, params: { cached: false } },
    ]);
    expect(externalNetworkActivity(text)).toEqual([
      'URL_REQUEST_START_JOB: https://redirector.gvt1.com',
      'HOST_RESOLVER_MANAGER_REQUEST: https://redirector.gvt1.com',
      'TCP_CONNECT: 142.250.1.1:443',
      'HOST_RESOLVER_MANAGER_IPV6_REACHABILITY_CHECK: {"cached":false}',
    ]);
  });

  it('liest auch abgebrochene Protokolle (ohne Abschluss «]}»)', () => {
    const full = log([{ type: 1, params: { url: 'https://example.com/' } }]);
    const truncated = full.slice(0, full.lastIndexOf(']')) + ',\n';
    expect(externalNetworkActivity(truncated)).toEqual(['URL_REQUEST_START_JOB: https://example.com']);
  });
});

describe('Programmsymbol', () => {
  it('ICO schreiben und lesen: 256 px als PNG, kleinere als Bitmap mit Maske', () => {
    const rgba = (size: number) => new Uint8Array(size * size * 4).fill(255);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const transparent = new Uint8Array(16 * 16 * 4); // alles durchsichtig
    const ico = encodeIco([
      { size: 256, rgba: rgba(256), png },
      { size: 16, rgba: transparent },
      { size: 32, rgba: rgba(32) },
    ]);
    const entries = parseIco(ico);
    expect(entries.map((e) => [e.width, e.format, e.bitCount])).toEqual([
      [16, 'bmp', 32],
      [32, 'bmp', 32],
      [256, 'png', 32],
    ]);
    expect(entries[2]!.data.equals(png)).toBe(true);
    const bmp16 = entries[0]!.data;
    expect(bmp16.readInt32LE(8)).toBe(32); // Höhe doppelt (Bild + Maske)
    // Maske: durchsichtige Pixel als 1
    expect(bmp16.subarray(40 + 16 * 16 * 4)[0]).toBe(0xff);
  });

  it('lehnt falsche Daten ab', () => {
    expect(() => encodeIco([{ size: 16, rgba: new Uint8Array(3) }])).toThrow(/passen nicht/);
    expect(() => parseIco(Buffer.from('kein Symbol'))).toThrow(/Keine ICO-Datei/);
  });

  it('build/icon.ico enthält alle Grössen, die Windows und der Installer brauchen', () => {
    const entries = parseIco(readFileSync(path.join(root, 'build/icon.ico')));
    const sizes = entries.map((e) => e.width);
    for (const size of [16, 24, 32, 48, 64, 256]) expect(sizes).toContain(size);
    expect(entries.find((e) => e.width === 256)?.format).toBe('png');
    const png = readFileSync(path.join(root, 'build/icon.png'));
    expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(512); // Breite laut PNG-Kopf
  });
});

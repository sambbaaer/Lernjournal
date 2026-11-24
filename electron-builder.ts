// Paketierung für Windows (SPEC «Betrieb unter Windows», AJ-16/AJ-16b, ADR 0007/0008),
// alle Ziele x64:
//   - MSIX für den Microsoft Store (Hauptweg; der Store signiert das Paket selbst)
//   - portable EXE (Release-Ziel ohne Store, z. B. für gesperrte Schulgeräte)
//   - NSIS-Installer pro Benutzer ohne Adminrechte (Testinstaller/Alternative)
// electron-builder findet diese Datei selbst (electron-builder.ts im Projekt).
//
// Code-Signing wird nur über Umgebungsvariablen eingeschaltet, nie über
// Dateien im Repository (siehe signingOptions und docs/ENTWICKLUNG.md):
//   CSC_LINK, CSC_KEY_PASSWORD        Zertifikat (.pfx) – electron-builder liest sie selbst
//   LERNJOURNAL_AZURE_SIGN_*          Azure Trusted Signing (statt Zertifikat)
//   LERNJOURNAL_REQUIRE_SIGNING=1     Build bricht ab, wenn nicht signiert wird (Release)
// Ohne diese Variablen entsteht ein unsignierter Build – ohne Fehler.
//
// Store-Identität (aus Partner Center, siehe storeIdentity und docs/STORE.md):
//   LERNJOURNAL_STORE_IDENTITY_NAME, …_PUBLISHER, …_PUBLISHER_DISPLAY_NAME
//   LERNJOURNAL_STORE_DISPLAY_NAME    nur nötig, wenn der reservierte Name nicht «Lernjournal» ist
//   LERNJOURNAL_REQUIRE_STORE_IDENTITY=1  Build bricht ab, solange Platzhalter gelten (Store-Release,
//                                     setzt scripts/dist-store.mjs selbst)
// Ohne diese Variablen entsteht ein MSIX mit klar erkennbaren Platzhaltern – nur
// zum Testen (die CI signiert es mit einem selbst erzeugten Testzertifikat).
import type { AppXOptions, Configuration, WindowsConfiguration } from 'electron-builder';

type Env = Readonly<Record<string, string | undefined>>;

// ---------------------------------------------------------------------------
// Microsoft Store (MSIX): Identität aus Partner Center
// ---------------------------------------------------------------------------

// Partner Center → App → «Produktidentität» (Product identity). Die drei Werte
// gehören zusammen: Der Store nimmt nur Pakete an, deren Identität genau passt.
export const STORE_IDENTITY_ENV = {
  identityName: 'LERNJOURNAL_STORE_IDENTITY_NAME', // Package/Identity/Name, z. B. 12345Beispiel.Lernjournal
  publisher: 'LERNJOURNAL_STORE_PUBLISHER', // Package/Identity/Publisher, «CN=…»
  publisherDisplayName: 'LERNJOURNAL_STORE_PUBLISHER_DISPLAY_NAME', // Package/Properties/PublisherDisplayName
} as const;
// Anzeigename = reservierter App-Name in Partner Center. Standard «Lernjournal»;
// nur setzen, wenn ein anderer Name reserviert wurde.
export const STORE_DISPLAY_NAME_ENV = 'LERNJOURNAL_STORE_DISPLAY_NAME';
// Store-Release: Abbruch, solange Platzhalter gelten (analog LERNJOURNAL_REQUIRE_SIGNING)
export const REQUIRE_STORE_IDENTITY_ENV = 'LERNJOURNAL_REQUIRE_STORE_IDENTITY';

// Platzhalter für Testbuilds. Absichtlich auffällig («PLATZHALTER»), damit ein
// solches Paket nie mit einem Store-Paket verwechselt wird. Der Publisher ist
// zugleich der Antragsteller (Subject) des Testzertifikats der CI.
export const STORE_PLACEHOLDER = {
  identityName: 'PLATZHALTER.Lernjournal.Testbuild',
  publisher: 'CN=PLATZHALTER-Lernjournal-Testbuild',
  publisherDisplayName: 'PLATZHALTER Lernjournal (Testbuild)',
} as const;
const PLACEHOLDER_MARK = /PLATZHALTER/i;

// Application-Id im Manifest: kommt nicht aus Partner Center, sondern ist frei
// wählbar. Sie bildet mit der Paketfamilie die App-Kennung (AUMID) – angeheftete
// Startmenü-Einträge hängen daran. Darum fest und nie ändern.
export const STORE_APPLICATION_ID = 'Lernjournal';
export const STORE_DISPLAY_NAME = 'Lernjournal';

export type StoreIdentity = {
  identityName: string;
  publisher: string;
  publisherDisplayName: string;
  displayName: string;
  applicationId: string;
  // true = Platzhalter (Testbuild), false = Werte aus Partner Center
  placeholder: boolean;
};

export class StoreIdentityError extends Error {}

// Liest die Store-Identität aus den Umgebungsvariablen und prüft sie so weit,
// wie es ohne Partner Center geht (Format laut AppxManifest-Schema).
export function storeIdentity(env: Env): StoreIdentity {
  const value = (name: string) => env[name]?.trim() || undefined;
  const given = Object.fromEntries(
    Object.entries(STORE_IDENTITY_ENV).map(([key, name]) => [key, value(name)]),
  ) as Record<keyof typeof STORE_IDENTITY_ENV, string | undefined>;
  const count = Object.values(given).filter(Boolean).length;
  const displayName = value(STORE_DISPLAY_NAME_ENV) ?? STORE_DISPLAY_NAME;
  const required = env[REQUIRE_STORE_IDENTITY_ENV] === '1';

  if (count > 0 && count < Object.keys(STORE_IDENTITY_ENV).length) {
    const missing = Object.entries(STORE_IDENTITY_ENV)
      .filter(([key]) => !given[key as keyof typeof given])
      .map(([, name]) => name);
    throw new StoreIdentityError(`Store-Identität unvollständig, es fehlt: ${missing.join(', ')}`);
  }
  if (count === 0) {
    if (required) {
      throw new StoreIdentityError(
        `Store-Release ohne Identität aus Partner Center: ${Object.values(STORE_IDENTITY_ENV).join(', ')} setzen (docs/STORE.md)`,
      );
    }
    return { ...STORE_PLACEHOLDER, displayName, applicationId: STORE_APPLICATION_ID, placeholder: true };
  }

  const identity = given as Record<keyof typeof STORE_IDENTITY_ENV, string>;
  const problems: string[] = [];
  // Identity/Name: 3–50 Zeichen, nur Buchstaben, Ziffern, Punkt, Bindestrich
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(identity.identityName))
    problems.push(`${STORE_IDENTITY_ENV.identityName}: 3–50 Zeichen aus A–Z, a–z, 0–9, «.» und «-»`);
  // Identity/Publisher: Distinguished Name, aus Partner Center immer «CN=…»
  if (!/^CN=[^,]+/.test(identity.publisher) || identity.publisher.length > 8192)
    problems.push(`${STORE_IDENTITY_ENV.publisher}: muss mit «CN=» beginnen (genau wie in Partner Center)`);
  if (identity.publisherDisplayName.length > 256)
    problems.push(`${STORE_IDENTITY_ENV.publisherDisplayName}: höchstens 256 Zeichen`);
  if (displayName.length > 256) problems.push(`${STORE_DISPLAY_NAME_ENV}: höchstens 256 Zeichen`);
  // Platzhalter dürfen nie als «echte» Werte durchgehen
  for (const [key, v] of Object.entries(identity)) {
    if (PLACEHOLDER_MARK.test(v))
      problems.push(`${STORE_IDENTITY_ENV[key as keyof typeof STORE_IDENTITY_ENV]}: enthält den Platzhalter`);
  }
  if (problems.length) throw new StoreIdentityError(`Store-Identität ungültig: ${problems.join('; ')}`);
  return { ...identity, displayName, applicationId: STORE_APPLICATION_ID, placeholder: false };
}

// Paketversion für MSIX: vierteilig, die letzte Stelle muss 0 sein (im Store
// reserviert). Aus «1.2.3» wird «1.2.3.0». Vorabversionen («1.2.3-beta.1»)
// lehnen wir ab: electron-builder würde sie still zu «1.2.3.0» machen, und zwei
// verschiedene Stände hätten dieselbe Store-Version.
export function storeVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m)
    throw new StoreIdentityError(`Version ${version}: für den Store nur «Major.Minor.Patch» ohne Zusatz`);
  const parts = m.slice(1, 4).map(Number);
  if (parts.some((p) => p > 65535))
    throw new StoreIdentityError(`Version ${version}: jede Stelle höchstens 65535`);
  if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0)
    throw new StoreIdentityError('Version 0.0.0 ist für den Store ungültig');
  return `${parts.join('.')}.0`;
}

// MSIX-Konfiguration (Ziel «appx» von electron-builder, Dateiendung .msix)
export function appxOptions(identity: StoreIdentity): AppXOptions {
  return {
    artifactName: '${productName}-Store-${version}.msix',
    identityName: identity.identityName,
    publisher: identity.publisher,
    publisherDisplayName: identity.publisherDisplayName,
    displayName: identity.displayName,
    applicationId: identity.applicationId,
    // Erste Sprache = Standardsprache. Die Oberfläche ist Schweizer Hochdeutsch.
    languages: ['de-CH', 'de'],
    // Hintergrund der Kacheln (Windows 10) – Farbe aus build/icon.svg
    backgroundColor: '#0E5A66',
    showNameOnTiles: false,
    // Nur «runFullTrust» (Pflicht für Desktop-Apps wie Electron). Kein
    // internetClient o. Ä.: Lernjournal ist offline (SPEC).
    capabilities: ['runFullTrust'],
    // Windows 10 2004 (Basis von 22H2) bis Windows 11 24H2 / Server 2025 (CI)
    minVersion: '10.0.19041.0',
    maxVersionTested: '10.0.26100.0',
    // Vierte Stelle bleibt 0 (Store-Pflicht), siehe storeVersion
    setBuildNumber: false,
    // Kein Autostart, keine Update-Infos (kein Auto-Update durch die App)
    addAutoLaunchExtension: false,
    electronUpdaterAware: false,
    // Eigene Manifest-Vorlage (build/appxmanifest.xml) – wie die von
    // electron-builder, zusätzlich mit dem Namensraum uap3 für den Befehlszeilen-
    // Aufruf «lernjournal» (build/appx-extensions.xml). Darüber startet die CI
    // das installierte Paket samt Paketidentität für den Selbsttest.
    customManifestPath: 'appxmanifest.xml',
    customExtensionsPath: 'build/appx-extensions.xml',
  };
}

// Azure Trusted Signing: alle vier Angaben zusammen (keine Geheimnisse – die
// Anmeldung läuft über AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET).
export const AZURE_SIGN_ENV = {
  endpoint: 'LERNJOURNAL_AZURE_SIGN_ENDPOINT', // z. B. https://weu.codesigning.azure.net
  codeSigningAccountName: 'LERNJOURNAL_AZURE_SIGN_ACCOUNT',
  certificateProfileName: 'LERNJOURNAL_AZURE_SIGN_PROFILE',
  publisherName: 'LERNJOURNAL_AZURE_SIGN_PUBLISHER', // genau wie im Zertifikat (CN)
} as const;

export function signingOptions(env: Env): Pick<WindowsConfiguration, 'azureSignOptions' | 'signtoolOptions'> {
  const azure = Object.fromEntries(
    Object.entries(AZURE_SIGN_ENV).map(([key, name]) => [key, env[name]?.trim() || undefined]),
  ) as Record<keyof typeof AZURE_SIGN_ENV, string | undefined>;
  const given = Object.values(azure).filter(Boolean).length;
  if (given > 0 && given < Object.keys(AZURE_SIGN_ENV).length) {
    const missing = Object.entries(AZURE_SIGN_ENV)
      .filter(([key]) => !azure[key as keyof typeof azure])
      .map(([, name]) => name);
    throw new Error(`Azure Trusted Signing unvollständig, es fehlt: ${missing.join(', ')}`);
  }
  if (given > 0) {
    return {
      azureSignOptions: {
        endpoint: azure.endpoint!,
        codeSigningAccountName: azure.codeSigningAccountName!,
        certificateProfileName: azure.certificateProfileName!,
        publisherName: azure.publisherName!,
      },
    };
  }
  // Zertifikat über CSC_LINK/CSC_KEY_PASSWORD (oder WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD).
  // Fehlen sie, überspringt electron-builder das Signieren mit einem Hinweis.
  return {
    signtoolOptions: {
      signingHashAlgorithms: ['sha256'], // SHA-1 ist veraltet
      rfc3161TimeStampServer: 'http://timestamp.digicert.com', // Signatur bleibt nach Ablauf gültig
    },
  };
}

export function createConfig(env: Env): Configuration {
  const store = storeIdentity(env);
  return {
    appId: 'ch.lernjournal.app',
    productName: 'Lernjournal',
    copyright: 'Lernjournal',
    directories: { output: 'dist', buildResources: 'build' },
    // Ins Paket kommt nur der gebaute Code (out/) und package.json; electron-builder
    // ergänzt die Laufzeitabhängigkeiten (dependencies) aus node_modules. Quellen,
    // Tests, Spikes, Golden Files und Dokumentation bleiben draussen – das prüft
    // scripts/verify-package.mjs am fertigen Paket.
    files: [
      'out/**',
      '!out/**/*.map',
      'package.json',
      // Ballast der Abhängigkeiten, den das Programm nie lädt
      '!**/node_modules/**/*.{d.ts,d.cts,d.mts,map,md}',
      '!**/node_modules/docx/dist/*.{iife.js,umd.cjs}', // Browser-Fassungen von docx
      '!**/node_modules/zod/src/**', // TypeScript-Quellen von zod
    ],
    asar: true,
    // Keine nativen Module (ADR 0001) – nichts neu zu kompilieren
    npmRebuild: false,
    // Kein Auto-Update (SPEC: offline, Update = neue Version installieren).
    // null verhindert auch die Datei app-update.yml im Paket.
    publish: null,
    // Oberfläche ist Deutsch; Englisch bleibt als Rückfall von Chromium
    electronLanguages: ['de', 'en-US'],
    // Release-Builds: lieber abbrechen als unbemerkt unsigniert ausliefern
    forceCodeSigning: env['LERNJOURNAL_REQUIRE_SIGNING'] === '1',

    // Electron-Fuses: Schalter, die fest in die EXE geschrieben werden.
    // Sie verhindern, dass jemand die installierte App als allgemeine
    // Node.js-Laufzeit missbraucht oder ihren Code unbemerkt austauscht.
    electronFuses: {
      runAsNode: false, // ELECTRON_RUN_AS_NODE wirkungslos
      enableNodeCliInspectArguments: false, // kein --inspect (Debugger) im fertigen Programm
      enableNodeOptionsEnvironmentVariable: false, // NODE_OPTIONS wird ignoriert
      enableEmbeddedAsarIntegrityValidation: true, // app.asar wird beim Start geprüft
      onlyLoadAppFromAsar: true, // Code nur aus app.asar laden
      enableCookieEncryption: true,
      grantFileProtocolExtraPrivileges: false, // file:// ohne Sonderrechte (wir nutzen app://)
    },

    win: {
      // Ohne Angabe auf der Befehlszeile alle drei (npm run dist:win, CI).
      // Einzeln: npm run dist:store (MSIX), npm run dist:exe (portable + NSIS).
      target: [
        { target: 'appx', arch: ['x64'] },
        { target: 'portable', arch: ['x64'] },
        { target: 'nsis', arch: ['x64'] },
      ],
      icon: 'build/icon.ico',
      artifactName: '${productName}-${version}-${arch}.${ext}',
      requestedExecutionLevel: 'asInvoker', // Programm selbst nie mit Adminrechten
      ...signingOptions(env),
    },

    // MSIX für den Microsoft Store (AJ-16b, ADR 0008). Installiert nach
    // C:\Program Files\WindowsApps (schreibgeschützt, ohne Adminrechte).
    // Schreibzugriffe auf %APPDATA%/%LOCALAPPDATA% leitet Windows in den
    // Paketordner um und löscht sie beim Deinstallieren – betrifft nur die
    // Zuletzt-Liste und Chromium-Zwischenspeicher. Projektordner (Vorschlag
    // Dokumente\Lernjournal) samt Sicherungen liegen ausserhalb und bleiben.
    appx: appxOptions(store),

    // Testinstaller/Alternative ohne Store (ADR 0008): Installer pro Benutzer,
    // ohne Adminrechte (Schul- und Firmengeräte):
    // installiert nach %LOCALAPPDATA%\Programs\Lernjournal, Einträge nur unter
    // HKEY_CURRENT_USER. Ein Klick, keine Ordnerwahl (Einfachheit; die Daten
    // liegen ohnehin im Projektordner, nicht im Programmordner).
    nsis: {
      oneClick: true,
      perMachine: false,
      packElevateHelper: false, // kein Hilfsprogramm zum Anfordern von Adminrechten
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Lernjournal',
      runAfterFinish: true,
      // Deinstallieren entfernt nur das Programm. Projektordner der Lernenden
      // liegen ausserhalb und werden nie berührt; die App-Daten (Zuletzt-Liste)
      // bleiben ebenfalls, damit eine Neuinstallation nahtlos weiterläuft.
      deleteAppDataOnUninstall: false,
      installerLanguages: ['de_DE'],
      language: '1031', // Deutsch
      multiLanguageInstaller: false,
      differentialPackage: false, // nur für Auto-Updates nötig
      artifactName: '${productName}-Setup-${version}.${ext}',
    },

    // Portable EXE (Release-Ziel neben dem Store): entpackt sich bei jedem Start nach %TEMP%\Lernjournal-Portable
    // und räumt beim Beenden auf. Fester Ordnername, damit die Schul-IT eine
    // Regel dafür formulieren kann (IT-Merkblatt).
    portable: {
      artifactName: '${productName}-Portable-${version}.${ext}',
      unpackDirName: 'Lernjournal-Portable',
      requestExecutionLevel: 'user',
    },

    // Nur für Prüfungen unter Linux (scripts/verify-package.mjs, Selbsttest)
    linux: {
      target: 'dir',
      icon: 'build/icon.png',
    },
  };
}

export default createConfig(process.env);

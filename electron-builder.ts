// Paketierung für Windows (SPEC «Betrieb unter Windows», AJ-16, ADR 0007):
// Installer pro Benutzer ohne Adminrechte und portable EXE, beide x64.
// electron-builder findet diese Datei selbst (electron-builder.ts im Projekt).
//
// Code-Signing wird nur über Umgebungsvariablen eingeschaltet, nie über
// Dateien im Repository (siehe signingOptions und docs/ENTWICKLUNG.md):
//   CSC_LINK, CSC_KEY_PASSWORD        Zertifikat (.pfx) – electron-builder liest sie selbst
//   LERNJOURNAL_AZURE_SIGN_*          Azure Trusted Signing (statt Zertifikat)
//   LERNJOURNAL_REQUIRE_SIGNING=1     Build bricht ab, wenn nicht signiert wird (Release)
// Ohne diese Variablen entsteht ein unsignierter Build – ohne Fehler.
import type { Configuration, WindowsConfiguration } from 'electron-builder';

type Env = Readonly<Record<string, string | undefined>>;

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
      target: [
        { target: 'nsis', arch: ['x64'] },
        { target: 'portable', arch: ['x64'] },
      ],
      icon: 'build/icon.ico',
      artifactName: '${productName}-${version}-${arch}.${ext}',
      requestedExecutionLevel: 'asInvoker', // Programm selbst nie mit Adminrechten
      ...signingOptions(env),
    },

    // Installer pro Benutzer, ohne Adminrechte (Schul- und Firmengeräte):
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

    // Portable EXE: entpackt sich bei jedem Start nach %TEMP%\Lernjournal-Portable
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

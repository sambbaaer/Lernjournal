// Electron-Hauptprozess: startet die App, erstellt das Fenster und ist der
// einzige Teil mit Zugriff auf Dateien (später auch auf die Datenbank).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, protocol, session, type WebContents } from 'electron';
import { ipcContract } from '@shared/ipc';
import { createIpcDispatcher } from './ipc-handler';
import {
  APP_ORIGIN,
  APP_SCHEME,
  contentSecurityPolicy,
  isTrustedUrl,
  mimeTypeFor,
  resolveAppFile,
  secureWebPreferences,
} from './security';

// Während `npm run dev` setzt electron-vite diese Variable auf den Vite-Server.
// Im fertigen Programm ist sie nicht gesetzt (und wird dann ignoriert).
const devServerUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined;
const rendererDir = path.join(import.meta.dirname, '../renderer');
const preloadPath = path.join(import.meta.dirname, '../preload/index.cjs');
const trusted = (url: string) => isTrustedUrl(url, devServerUrl);

// Sandbox: Jedes Fenster wird mit sandbox:true erstellt (secureWebPreferences),
// weitere Fenster und <webview> sind blockiert (hardenWebContents). Auf das
// globale app.enableSandbox() verzichten wir: Es zwingt auch den Netzwerkdienst
// in die Sandbox und bricht damit Tests in Linux-Containern ab, ohne für die
// Oberfläche mehr Schutz zu bringen. Der E2E-Test prüft sandbox:true.

// Das eigene Protokoll muss VOR app.ready als «sicher» registriert werden.
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Nur eine Instanz: Ein zweiter Start holt das bestehende Fenster nach vorne.
// Verhindert zwei Prozesse, die gleichzeitig dieselbe Datenbank öffnen.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(startup);
}

function startup() {
  registerAppProtocol();
  lockDownSession();
  registerIpc();
  // Kein Standard-Menü: Die Office-ähnliche Menüleiste baut die Oberfläche
  // selbst (AJ-02). Nebeneffekt: Ctrl+R (Neu laden) ist im fertigen Programm aus.
  Menu.setApplicationMenu(null);
  createMainWindow();
}

// app://lernjournal/… liefert Dateien aus dem Renderer-Ordner mit CSP-Header.
function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppFile(rendererDir, request.url);
    if (!file) return new Response('Nicht gefunden', { status: 404 });
    try {
      const body = await readFile(file);
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': mimeTypeFor(file),
          'Content-Security-Policy': contentSecurityPolicy(),
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Nicht gefunden', { status: 404 });
    }
  });
}

function lockDownSession() {
  const ses = session.defaultSession;
  // Kamera, Mikrofon, Standort, Benachrichtigungen … braucht die App nicht.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  // In der Entwicklung kommt die Seite vom Vite-Server: CSP per Header setzen.
  if (devServerUrl) {
    ses.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [contentSecurityPolicy(devServerUrl)],
        },
      });
    });
  }
  // Keine Verbindungen ins Internet (offline-first, SPEC: kein Remote-Content).
  // Erlaubt bleiben nur das eigene Protokoll, devtools und der lokale Dev-Server.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const u = details.url;
    const allowed =
      u.startsWith(`${APP_ORIGIN}/`) ||
      u.startsWith('devtools://') ||
      u.startsWith('data:') ||
      u.startsWith('blob:') ||
      (devServerUrl !== undefined &&
        (u.startsWith(devServerUrl) || u.startsWith(devServerUrl.replace(/^http/, 'ws'))));
    callback({ cancel: !allowed });
  });
}

function registerIpc() {
  const dispatch = createIpcDispatcher(
    {
      'app:getInfo': () => ({
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
        versions: {
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
        },
      }),
    },
    trusted,
  );
  for (const channel of Object.keys(ipcContract)) {
    ipcMain.handle(channel, (event, raw) => dispatch(channel, event, raw));
  }
}

// Jede WebContents (Fenster, später evtl. Druckvorschau) bekommt dieselben Schranken.
function hardenWebContents(contents: WebContents) {
  // Keine Navigation weg von der eigenen Oberfläche (z. B. Klick auf einen Link im Journal)
  contents.on('will-navigate', (event, url) => {
    if (!trusted(url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!trusted(url)) event.preventDefault();
  });
  // Keine neuen Fenster. Externe Links öffnen wir später gezielt nach Bestätigung (SPEC).
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Kein <webview>
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

app.on('web-contents-created', (_e, contents) => hardenWebContents(contents));

function createMainWindow() {
  const win = new BrowserWindow({
    title: 'Lernjournal',
    width: 1280,
    height: 800,
    minWidth: 1024, // SPEC: Fenster ab 1024 × 640 px
    minHeight: 640,
    show: false, // erst zeigen, wenn fertig gezeichnet → kein weisses Aufblitzen
    backgroundColor: '#f3f3f3',
    webPreferences: secureWebPreferences(preloadPath),
  });

  win.once('ready-to-show', () => {
    if (process.env['LERNJOURNAL_SMOKE_TEST'] !== '1') win.show();
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadURL(`${APP_ORIGIN}/index.html`);
  }

  // Rauchtest für das gepackte Programm (CI): prüft die Brücke und beendet sich.
  // Nötig, weil Testwerkzeuge sich wegen der abgeschalteten Debug-Fuses nicht
  // mit dem gepackten Programm verbinden können. Tut sonst nichts.
  if (process.env['LERNJOURNAL_SMOKE_TEST'] === '1') {
    win.webContents.once('did-finish-load', async () => {
      const result = await win.webContents
        .executeJavaScript(
          `(async () => {
             const info = await window.lernjournal.app.getInfo();
             return { noRequire: typeof require === 'undefined', noProcess: typeof process === 'undefined', ok: info.ok };
           })()`,
        )
        .catch(() => null);
      const pass = Boolean(result && result.noRequire && result.noProcess && result.ok);
      console.log(`[smoke] ${pass ? 'OK' : 'FEHLER'} ${JSON.stringify(result)}`);
      app.exit(pass ? 0 : 1);
    });
  }
}

app.on('window-all-closed', () => app.quit());

// Electron-Hauptprozess: startet die App, erstellt das Fenster und ist der
// einzige Teil mit Zugriff auf Dateien (später auch auf die Datenbank).
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  protocol,
  screen,
  session,
  shell,
  systemPreferences,
  type WebContents,
} from 'electron';
import windowIcon from '../../build/icon.png?asset';
import { ipcContract } from '@shared/ipc';
import { BACKUP_POLICY } from '@shared/backup';
import { createArchiveHandlers } from './archive/archive-handlers';
import { ArchiveService } from './archive/archive-service';
import { createBackupHandlers } from './backup/backup-handlers';
import { BackupService } from './backup/backup-service';
import { createCloseGuard } from './close-guard';
import { detectDistribution } from './distribution';
import { createExportHandlers } from './export/export-handlers';
import { ExportService } from './export/export-service';
import { convertWebpToPng } from './export/image-convert';
import { printPdf } from './export/pdf-print';
import { createIpcDispatcher } from './ipc-handler';
import { createJournalHandlers } from './journal/journal-handlers';
import { JournalService } from './journal/journal-service';
import { createLinkHandlers } from './links/link-handlers';
import { LinkService } from './links/link-service';
import { MediaService } from './media/media-service';
import { McpAccessStore } from './mcp/access';
import { claudeCodeCommand, httpClientJson, writeMcpb } from './mcp/client-config';
import { LocalMcpServer } from './mcp/local-server';
import { createProjectHandlers, OpenedProjects } from './project/project-handlers';
import { createTaxonomyHandlers } from './taxonomy/taxonomy-handlers';
import { TaxonomyService } from './taxonomy/taxonomy-service';
import { ProjectService } from './project/project-service';
import { createSearchHandlers } from './search/search-handlers';
import { SearchIndex } from './search/search-index';
import {
  buildReport,
  checkDocxFile,
  checkPdfFile,
  findArchive,
  readSelfTestConfig,
  rendererScript,
  reportFile,
  SELF_TEST_TIMEOUT_MS,
  SelfTestRun,
  type FlowResult,
} from './self-test';
import {
  APP_ORIGIN,
  APP_SCHEME,
  contentSecurityPolicy,
  isTrustedUrl,
  mimeTypeFor,
  resolveAppFile,
  secureWebPreferences,
} from './security';
import { loadWindowBounds, saveWindowBounds, type WindowBounds } from './window-state';

// Während `npm run dev` setzt electron-vite diese Variable auf den Vite-Server.
// Im fertigen Programm ist sie nicht gesetzt (und wird dann ignoriert).
const devServerUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined;
const rendererDir = path.join(import.meta.dirname, '../renderer');
const preloadPath = path.join(import.meta.dirname, '../preload/index.cjs');
const trusted = (url: string) => isTrustedUrl(url, devServerUrl);
// Microsoft Store, portable, installiert oder Entwicklung (nur Anzeige, ADR 0008)
const distribution = detectDistribution({
  isPackaged: app.isPackaged,
  windowsStore: process.windowsStore,
  portableExecutableDir: process.env['PORTABLE_EXECUTABLE_DIR'],
});

// Nur für automatische Tests der ungepackten App: eigene Verzeichnisse für
// Benutzerdaten und «Dokumente», damit Tests nie echte Daten berühren.
// Im gepackten Programm wirkungslos.
const e2eDir = !app.isPackaged ? process.env['LERNJOURNAL_E2E_DIR'] : undefined;
if (e2eDir) {
  app.setPath('userData', path.join(e2eDir, 'userData'));
  app.setPath('documents', path.join(e2eDir, 'Dokumente'));
}

// Selbsttest (self-test.ts, AJ-16): nur mit LERNJOURNAL_SMOKE_TEST, auch im
// gepackten Programm – dort kann sich kein Testwerkzeug verbinden. Benutzerdaten
// und «Dokumente» liegen dann im angegebenen Arbeitsordner.
let selfTest: SelfTestRun | null = null;
try {
  const config = readSelfTestConfig(process.env);
  if (config) selfTest = new SelfTestRun(config);
} catch (err) {
  console.error(`[selbsttest] ${(err as Error).message}`);
  process.exit(2);
}
if (selfTest?.config.dir) {
  app.setPath('userData', path.join(selfTest.config.dir, 'userData'));
  app.setPath('documents', path.join(selfTest.config.dir, 'Dokumente'));
}

// Sicheres Schliessen des Hauptfensters (siehe close-guard.ts)
let closeGuard: ReturnType<typeof createCloseGuard> | null = null;

// Höchstens ein geöffnetes Projekt pro App-Instanz
// Beim Öffnen eines Projekts verwaiste Bilder aufräumen (älter als 1 Stunde),
// den Suchindex prüfen (unvollständig → neu aufbauen, AJ-11) und im
// Hintergrund sichern, falls sich seit der neuesten Sicherung etwas geändert
// hat (AJ-15). Vor dem Schliessen sichern, falls in der Sitzung geändert.
const projects: ProjectService = new ProjectService({
  appVersion: app.getVersion(),
  afterOpen: () => {
    const r = media.collectGarbage();
    if (r.rows || r.files) console.log(`[medien] aufgeräumt: ${r.rows} Einträge, ${r.files} Dateien`);
    if (search.ensureComplete()) console.log('[suche] Suchindex war unvollständig und wurde neu aufgebaut');
    backups.afterOpen();
    // Opt-in «automatisch aktivieren»: eingerichtete MCP-Clients verbinden sich
    // sofort, ohne dass die Freigabe nach jedem Start neu geklickt werden muss.
    if (mcpAccess.autoStart)
      void mcp.start().catch((err: Error) => console.error(`[mcp] Autostart: ${err.message}`));
  },
  beforeClose: () => backups.beforeClose(),
  afterClose: () => {
    mcp.stop();
  },
});
const search = new SearchIndex(() => projects.db);
const media = new MediaService(
  () => projects.db,
  () => projects.dir,
);
const links = new LinkService(() => projects.db);
const journals = new JournalService(
  () => projects.db,
  () => projects.dir,
  () => new Date(),
  media,
  links,
  search,
);
const taxonomy = new TaxonomyService(
  () => projects.db,
  () => new Date(),
  search,
);
// Zugangsschlüssel und «automatisch aktivieren» bleiben über Neustarts erhalten
const mcpAccess = new McpAccessStore(path.join(app.getPath('userData'), 'mcp.json'));
const mcp = new LocalMcpServer({
  version: app.getVersion(),
  access: mcpAccess,
  journals,
  links,
  search,
  projectIdentity: () => (projects.isOpen ? projects.db : null),
  changed: () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.isDestroyed()) win.webContents.send('lj:mcp-changed');
    }
  },
});
// Word-Export (AJ-12): WebP-Bilder wandelt ein verborgenes Fenster in PNG um
const exporter = new ExportService(() => projects.db, journals, media, convertWebpToPng);
// Sicherungen im Projektordner (AJ-15)
const backups = new BackupService({ projects, appVersion: app.getVersion() });
// Projektübergabe .ajournal (AJ-14)
const archives = new ArchiveService({
  getDb: () => projects.db,
  projectDir: () => projects.dir,
  appVersion: app.getVersion(),
  inspectFolder: (dir) => projects.inspectFolder(dir),
});

// Sandbox: Jedes Fenster wird mit sandbox:true erstellt (secureWebPreferences),
// weitere Fenster und <webview> sind blockiert (hardenWebContents). Auf das
// globale app.enableSandbox() verzichten wir: Es zwingt auch den Netzwerkdienst
// in die Sandbox und bricht damit Tests in Linux-Containern ab, ohne für die
// Oberfläche mehr Schutz zu bringen. Der E2E-Test prüft sandbox:true.

// Oberfläche ist Schweizer Hochdeutsch: Chromium-Sprache fest auf de-CH, damit
// Datumsfelder (TT.MM.JJJJ), Rechtschreibprüfung und Zahlenformate passen –
// auch auf Geräten mit englischem Windows.
app.commandLine.appendSwitch('lang', 'de-CH');
// AppUserModelId für Windows 10/11 setzen, damit Taskleiste und native
// Windows-Toast-Benachrichtigungen auch in der Portable-EXE zuverlässig
// zugeordnet werden.
if (process.platform === 'win32') {
  app.setAppUserModelId('ch.lernjournal.app');
}
// Kein Proxy (offline-first, AJ-16): Sonst sucht Chromium unter Windows über
// «Einstellungen automatisch erkennen» (WPAD) einen Proxy und schickt dafür eine
// DNS-Anfrage nach «wpad» ins Netz – gefunden im Netzwerkprotokoll der Windows-CI.
// Die App braucht kein Netz; Anfragen nach aussen sind ohnehin blockiert.
app.commandLine.appendSwitch('no-proxy-server');

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
  // «Mindestens täglich nach Änderungen» (AJ-15): regelmässig prüfen, ob die
  // tägliche Sicherung fällig ist. unref: hält das Programm nicht am Leben.
  setInterval(() => void backups.tick(), BACKUP_POLICY.checkEveryMs).unref();
  // Kein Standard-Menü: Die Office-ähnliche Menüleiste baut die Oberfläche
  // selbst (AJ-02). Nebeneffekt: Ctrl+R (Neu laden) ist im fertigen Programm aus.
  Menu.setApplicationMenu(null);
  createMainWindow();
}

// app://lernjournal/… liefert Dateien aus dem Renderer-Ordner mit CSP-Header.
function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    // Bilder des geöffneten Projekts: app://lernjournal/media/<uuid>
    // Aufgelöst über die Datenbank (nie über Pfade aus der URL).
    const mediaMatch = /^app:\/\/lernjournal\/media\/([0-9a-f-]{36})$/i.exec(request.url);
    if (mediaMatch) {
      const found = projects.isOpen ? media.resolve(mediaMatch[1]!) : null;
      if (!found) return new Response('Nicht gefunden', { status: 404 });
      try {
        return new Response(await readFile(found.file), {
          status: 200,
          headers: {
            'Content-Type': found.mime,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store',
          },
        });
      } catch {
        return new Response('Nicht gefunden', { status: 404 });
      }
    }
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
    if (!allowed) selfTest?.blockedRequests.push(u);
    callback({ cancel: !allowed });
  });
  // Rechtschreibprüfung: Wo Chromium Hunspell-Wörterbücher verwendet, lädt es
  // sie sonst von einem Google-Server – an session.webRequest vorbei (gefunden
  // mit dem Netzwerkprotokoll des Selbsttests, AJ-16). Die Adresse zeigt darum
  // auf das eigene Protokoll; dort gibt es keine Wörterbücher, es entsteht
  // keine Verbindung ins Netz. Auch unter Windows will Electron Hunspell laden
  // (Selbsttest-Bericht der CI, Feld «spellcheck»); ohne Wörterbuch bleibt die
  // Rechtschreibprüfung im Editor darum vorerst stumm (ADR 0007).
  ses.setSpellCheckerDictionaryDownloadURL(`${APP_ORIGIN}/spellcheck/`);
  if (selfTest) {
    const note = (what: string) => (_e: unknown, lang: string) =>
      selfTest?.spellcheck.push(`${what} ${lang}`);
    ses.on('spellcheck-dictionary-download-begin', note('download-begin'));
    ses.on('spellcheck-dictionary-download-success', note('download-success'));
    ses.on('spellcheck-dictionary-download-failure', note('download-failure'));
    ses.on('spellcheck-dictionary-initialized', note('initialized'));
  }
}

// Native Dialoge. Im Selbsttest bestätigt ein Speichern-Dialog den Vorschlag,
// ohne sich zu zeigen, und ein Öffnen-Dialog gilt als abgebrochen.
async function chooseSavePath(options: Electron.SaveDialogOptions): Promise<string | null> {
  if (selfTest) {
    const chosen = options.defaultPath ?? null;
    if (chosen) selfTest.saved.push(chosen);
    return chosen;
  }
  const win = mainWindow();
  const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  return r.canceled || !r.filePath ? null : r.filePath;
}

async function chooseOpenPath(options: Electron.OpenDialogOptions): Promise<string | null> {
  if (selfTest) return null;
  const win = mainWindow();
  const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return r.canceled ? null : (r.filePaths[0] ?? null);
}

// Hauptfenster (es gibt nur eines) – Ziel für Dialoge und Fortschrittsmeldungen
function mainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

// Fortschritt an Oberfläche UND an das Windows-11-Taskleisten-Icon melden
function sendArchiveProgress(p: { step: string; percent: number | null }) {
  const win = mainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('lj:archive-progress', p);
  if (p.percent === null || p.percent >= 100) {
    win.setProgressBar(-1);
  } else {
    win.setProgressBar(Math.max(0.05, Math.min(0.99, p.percent / 100)));
  }
}

// Aktive Windows-Toast-Instanz festhalten, damit der Garbage Collector sie
// nicht verwirft, bevor Lernende darauf klicken.
let activeReminderToast: Notification | null = null;

function registerIpc() {
  // Zuletzt-Liste und Pfad-Freigabe: gemeinsam für «Öffnen» und den Import (AJ-14)
  const opened = new OpenedProjects(path.join(app.getPath('userData'), 'recent-projects.json'));
  const dispatch = createIpcDispatcher(
    {
      'app:getInfo': () => ({
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
        distribution,
        versions: {
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
        },
      }),
      ...createProjectHandlers({
        service: projects,
        opened,
        recentFile: path.join(app.getPath('userData'), 'recent-projects.json'),
        documentsDir: app.getPath('documents'),
        // Nativer Windows-Dialog (SPEC). Der gewählte Pfad wird freigegeben.
        chooseFolder: (purpose) =>
          chooseOpenPath({
            title:
              purpose === 'create' ? 'Ordner für das neue Lernjournal wählen' : 'Lernjournal-Projekt öffnen',
            buttonLabel: purpose === 'create' ? 'Ordner wählen' : 'Öffnen',
            defaultPath: app.getPath('documents'),
            properties: ['openDirectory', 'createDirectory'],
          }),
        showFolder: (dir) => {
          void shell.openPath(dir);
        },
      }),
      'app:closeReady': async ({ saved }) => {
        await closeGuard?.onFlushResult(saved);
        return { ok: true };
      },
      'app:pasteInEditor': (req) => {
        const win = BrowserWindow.getFocusedWindow() ?? mainWindow();
        if (!projects.isOpen || !win) return false;
        // Chromium löst den normalen Paste-Event aus (oder pasteAndMatchStyle
        // für reinen Text ohne fremde Formatierung). Die Bridge gibt keine
        // Zwischenablagedaten zurück, und der Editor bereinigt den Inhalt.
        if (req?.plainText) win.webContents.pasteAndMatchStyle();
        else win.webContents.paste();
        return true;
      },
      'app:notifyJournalReminder': ({ body }) => {
        if (selfTest || !projects.isOpen || !Notification.isSupported()) return { shown: false };
        try {
          activeReminderToast?.close();
          const toastXml =
            process.platform === 'win32'
              ? `<toast launch="lernjournal:reminder">
  <visual>
    <binding template="ToastGeneric">
      <text>Zeit für ein neues Journal</text>
      <text>${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
    </binding>
  </visual>
  <actions>
    <action content="Neues Journal" arguments="new-journal" activationType="foreground"/>
    <action content="Nicht jetzt" arguments="snooze" activationType="foreground"/>
  </actions>
</toast>`
              : undefined;
          const n = new Notification({
            title: 'Zeit für ein neues Journal',
            body,
            icon: windowIcon,
            ...(toastXml ? { toastXml } : {}),
          });
          const trigger = (action: 'new-journal' | 'snooze') => {
            const win = mainWindow();
            if (!win || win.isDestroyed()) return;
            if (action === 'new-journal') {
              if (win.isMinimized()) win.restore();
              win.focus();
            }
            win.webContents.send('lj:reminder-action', action);
          };
          n.on('click', () => trigger('new-journal'));
          n.on('action', (_e, index) => trigger(index === 1 ? 'snooze' : 'new-journal'));
          activeReminderToast = n;
          n.show();
          return { shown: true };
        } catch {
          return { shown: false };
        }
      },
      ...createJournalHandlers(journals),
      ...createTaxonomyHandlers(taxonomy, journals),
      ...createLinkHandlers(links, journals),
      ...createSearchHandlers(search),
      'mcp:status': () => mcp.status(),
      'mcp:setActive': ({ enabled }) => (enabled ? mcp.start() : mcp.stop()),
      'mcp:setDrafts': ({ allowed }) => mcp.setDrafts(allowed),
      'mcp:copy': ({ field }) => {
        const target = { ...mcp.target(), version: app.getVersion() };
        const text = {
          endpoint: target.endpoint,
          token: target.token,
          claudeCode: claudeCodeCommand(target),
          httpJson: httpClientJson(target),
        }[field];
        clipboard.writeText(text);
        return true;
      },
      'mcp:decide': ({ id, apply }) => mcp.decide(id, apply),
      'mcp:setAutoStart': ({ enabled }) => mcp.setAutoStart(enabled),
      'mcp:renewToken': () => mcp.renewToken(),
      // Claude-Desktop-Erweiterung speichern (Vorschlag: «Downloads»). Doppelklick
      // auf die Datei öffnet in Claude Desktop den Installationsdialog.
      'mcp:saveClaudeExtension': async () => {
        const file = await chooseSavePath({
          title: 'Erweiterung für Claude Desktop speichern',
          defaultPath: path.join(app.getPath('downloads'), 'Lernjournal.mcpb'),
          filters: [{ name: 'Claude-Desktop-Erweiterung', extensions: ['mcpb'] }],
          properties: ['showOverwriteConfirmation'],
        });
        if (!file) return false;
        await writeMcpb(file, { ...mcp.target(), version: app.getVersion() });
        return true;
      },
      'media:add': ({ journalId, data, originalName }) => media.add({ journalId, data, originalName }),
      ...createExportHandlers({
        service: exporter,
        printPdf,
        // Nativer Speichern-Dialog, Vorschlag im Ordner «exports» des Projekts.
        // showOverwriteConfirmation: bestehende Datei nie still überschreiben.
        chooseSavePath: (suggested, format) =>
          chooseSavePath({
            title: format === 'pdf' ? 'Als PDF speichern' : 'Als Word-Dokument speichern',
            buttonLabel: 'Speichern',
            defaultPath: path.join(projects.dir, 'exports', suggested),
            filters: [{ name: format === 'pdf' ? 'PDF-Dokument' : 'Word-Dokument', extensions: [format] }],
            properties: ['showOverwriteConfirmation', 'createDirectory'],
          }),
        showInFolder: (file) => shell.showItemInFolder(file),
      }),
      ...createArchiveHandlers({
        service: archives,
        projects,
        opened,
        documentsDir: app.getPath('documents'),
        // Vorschlag «Dokumente»: Lernende wählen dort meist den USB-Stick o. Ä.
        // Eine Kopie im Projektordner selbst würde vor Geräteverlust nicht schützen.
        chooseExportPath: (suggested) =>
          chooseSavePath({
            title: 'Projekt übergeben (.ajournal)',
            buttonLabel: 'Speichern',
            defaultPath: path.join(app.getPath('documents'), suggested),
            filters: [{ name: 'Lernjournal-Projekt', extensions: ['ajournal'] }],
            properties: ['showOverwriteConfirmation', 'createDirectory'],
          }),
        chooseArchiveFile: () =>
          chooseOpenPath({
            title: 'Projekt importieren (.ajournal)',
            buttonLabel: 'Prüfen',
            defaultPath: app.getPath('documents'),
            filters: [{ name: 'Lernjournal-Projekt', extensions: ['ajournal'] }],
            properties: ['openFile'],
          }),
        chooseImportFolder: () =>
          chooseOpenPath({
            title: 'Ordner für das importierte Lernjournal wählen',
            buttonLabel: 'Ordner wählen',
            defaultPath: app.getPath('documents'),
            properties: ['openDirectory', 'createDirectory'],
          }),
        showInFolder: (file) => shell.showItemInFolder(file),
        progress: (p) => sendArchiveProgress(p),
      }),
      ...createBackupHandlers({
        service: backups,
        projects,
        opened,
        documentsDir: app.getPath('documents'),
        chooseRestoreFolder: () =>
          chooseOpenPath({
            title: 'Ordner für die wiederhergestellte Sicherung wählen',
            buttonLabel: 'Ordner wählen',
            defaultPath: app.getPath('documents'),
            properties: ['openDirectory', 'createDirectory'],
          }),
        // Gleicher Fortschritts-Kanal wie die Projektübergabe (archive.onProgress)
        progress: (p) => sendArchiveProgress(p),
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
  // Natives Rechtsklick-Kontextmenü für Textfelder und Abschnitts-Editoren
  // (vertraut wie in Word/Windows: Ausschneiden, Kopieren, Einfügen, Nur Text übernehmen).
  contents.on('context-menu', (_event, params) => {
    const hasSelection = params.selectionText.trim().length > 0;
    if (!params.isEditable && !hasSelection) return;
    const win = BrowserWindow.fromWebContents(contents);
    const items: Electron.MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      items.push(
        {
          label: 'Rückgängig',
          accelerator: 'CmdOrCtrl+Z',
          enabled: params.editFlags.canUndo,
          click: () => contents.undo(),
        },
        {
          label: 'Wiederholen',
          accelerator: 'CmdOrCtrl+Y',
          enabled: params.editFlags.canRedo,
          click: () => contents.redo(),
        },
        { type: 'separator' },
        {
          label: 'Ausschneiden',
          accelerator: 'CmdOrCtrl+X',
          enabled: params.editFlags.canCut,
          click: () => contents.cut(),
        },
      );
    }
    items.push({
      label: 'Kopieren',
      accelerator: 'CmdOrCtrl+C',
      enabled: params.editFlags.canCopy,
      click: () => contents.copy(),
    });
    if (params.isEditable) {
      items.push(
        {
          label: 'Einfügen',
          accelerator: 'CmdOrCtrl+V',
          enabled: params.editFlags.canPaste,
          click: () => contents.paste(),
        },
        {
          label: 'Nur Text übernehmen',
          accelerator: 'CmdOrCtrl+Shift+V',
          enabled: params.editFlags.canPaste,
          click: () => contents.pasteAndMatchStyle(),
        },
      );
      // Nativer Windows-11-Emoji- und Symbol-Picker (Win+.)
      if (process.platform === 'win32') {
        items.push({
          label: 'Emoji und Symbole (Win+.)',
          click: () => {
            if (typeof (app as unknown as { showEmojiPanel?: () => void }).showEmojiPanel === 'function') {
              (app as unknown as { showEmojiPanel: () => void }).showEmojiPanel();
            }
          },
        });
      }
    }
    if (params.editFlags.canSelectAll) {
      items.push(
        { type: 'separator' },
        {
          label: 'Alles markieren',
          accelerator: 'CmdOrCtrl+A',
          click: () => contents.selectAll(),
        },
      );
    }
    Menu.buildFromTemplate(items).popup(win ? { window: win } : undefined);
  });
}

app.on('web-contents-created', (_e, contents) => hardenWebContents(contents));

function titleBarOverlay() {
  const contrast = nativeTheme.shouldUseHighContrastColors;
  return {
    height: 40,
    color: contrast ? systemPreferences.getColor('window') : '#4e4e5e',
    symbolColor: contrast ? systemPreferences.getColor('window-text') : '#eae2d6',
  };
}

function createMainWindow() {
  const windows = process.platform === 'win32';
  const windowStateFile = path.join(app.getPath('userData'), 'window-state.json');
  const displays = screen.getAllDisplays().map((d) => d.workArea);
  const savedBounds: WindowBounds =
    selfTest || e2eDir
      ? { width: 1280, height: 800, maximized: false }
      : loadWindowBounds(windowStateFile, displays);

  const win = new BrowserWindow({
    title: 'Lernjournal',
    icon: windowIcon,
    ...(savedBounds.x !== undefined && savedBounds.y !== undefined
      ? { x: savedBounds.x, y: savedBounds.y }
      : {}),
    width: savedBounds.width,
    height: savedBounds.height,
    minWidth: 760,
    minHeight: 480,
    titleBarStyle: windows ? 'hidden' : 'default',
    titleBarOverlay: windows ? titleBarOverlay() : false,
    ...(windows ? { backgroundMaterial: 'mica' as const } : {}),
    show: false, // erst zeigen, wenn fertig gezeichnet → kein weisses Aufblitzen
    backgroundColor: '#f4f3f6',
    webPreferences: secureWebPreferences(preloadPath),
  });
  if (windows) {
    const updateTitleBar = () => win.setTitleBarOverlay(titleBarOverlay());
    nativeTheme.on('updated', updateTitleBar);
    win.once('closed', () => nativeTheme.removeListener('updated', updateTitleBar));
  }

  // Letzte normale Fenstergrösse merken (auch wenn maximiert geschlossen wird)
  let lastNormalBounds: WindowBounds = {
    ...(savedBounds.x !== undefined && savedBounds.y !== undefined
      ? { x: savedBounds.x, y: savedBounds.y }
      : {}),
    width: savedBounds.width,
    height: savedBounds.height,
    maximized: savedBounds.maximized,
  };
  const rememberBounds = () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const maximized = win.isMaximized();
    if (!maximized) {
      const b = win.getBounds();
      lastNormalBounds = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: false };
    } else {
      lastNormalBounds = { ...lastNormalBounds, maximized: true };
    }
  };
  win.on('resize', rememberBounds);
  win.on('move', rememberBounds);
  win.on('maximize', rememberBounds);
  win.on('unmaximize', rememberBounds);

  win.once('ready-to-show', () => {
    if (!selfTest) {
      if (savedBounds.maximized) win.maximize();
      win.show();
    }
  });

  // Vor dem Schliessen: Oberfläche speichern lassen, bei Fehler nachfragen
  closeGuard = createCloseGuard({
    requestFlush: () => win.webContents.send('lj:before-close'),
    close: () => win.close(),
    confirmCloseUnsaved: async () => {
      const r = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Lernjournal',
        message: 'Einige Änderungen konnten nicht gespeichert werden.',
        detail:
          'Wenn du jetzt schliesst, gehen diese Änderungen verloren. Prüfe, ob der Projektordner erreichbar ist (USB-Stick, Netzlaufwerk) und versuche es erneut.',
        buttons: ['Abbrechen', 'Ohne Speichern schliessen'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      return r.response === 1;
    },
  });
  win.on('close', (event) => {
    if (!selfTest && !e2eDir) {
      rememberBounds();
      saveWindowBounds(windowStateFile, lastNormalBounds);
    }
    if (closeGuard?.onCloseRequested()) event.preventDefault();
  });
  // Oberfläche abgestürzt: nichts mehr zu speichern, Schliessen nicht blockieren
  win.webContents.on('render-process-gone', () => closeGuard?.allowClose());

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadURL(`${APP_ORIGIN}/index.html`);
  }

  // Selbsttest (self-test.ts): läuft nach dem Laden der Oberfläche und beendet
  // das Programm. Tut ohne LERNJOURNAL_SMOKE_TEST nichts.
  if (selfTest) {
    const run = selfTest;
    win.webContents.once('did-finish-load', () => void runSelfTest(win, run));
  }
}

async function runSelfTest(win: BrowserWindow, run: SelfTestRun) {
  const { mode, dir } = run.config;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>(
    (resolve) => (timer = setTimeout(() => resolve(null), SELF_TEST_TIMEOUT_MS)),
  );
  const flow = await Promise.race([
    win.webContents.executeJavaScript(rendererScript(mode)).catch((err: unknown): FlowResult => ({
      steps: {},
      problems: [`Skriptfehler: ${(err as Error).message}`],
    })) as Promise<FlowResult>,
    timeout,
  ]);
  clearTimeout(timer);
  const extra: string[] = [];
  try {
    if (mode === 'create') {
      extra.push(...checkDocxFile(run.saved.find((f) => f.endsWith('.docx'))));
      extra.push(...checkPdfFile(run.saved.find((f) => f.endsWith('.pdf'))));
    }
    if (mode === 'reopen' && dir) {
      // Projektübergabe auf einen «zweiten Computer»: .ajournal aus dem ersten
      // Durchgang vollständig prüfen und in einen neuen Ordner importieren
      const file = findArchive(app.getPath('documents'));
      if (!file) extra.push('.ajournal-Datei aus dem ersten Durchgang fehlt');
      else {
        const imported = await archives.importTo(file, path.join(dir, 'Import'));
        if (imported.journals !== 1 || imported.media !== 1) extra.push('Import: nicht 1 Journal und 1 Bild');
      }
    }
  } catch (err) {
    extra.push(`Prüfung im Hauptprozess: ${(err as Error).message}`);
  }
  const ses = session.defaultSession;
  const report = buildReport(run, flow, extra, {
    packaged: app.isPackaged,
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    locale: app.getLocale(),
    portable: Boolean(process.env['PORTABLE_EXECUTABLE_DIR']),
    // «store», wenn das Programm aus dem installierten MSIX läuft (CI prüft das)
    distribution,
    windowsStore: process.windowsStore === true,
    execPath: process.execPath,
    userData: app.getPath('userData'),
    spellcheckerLanguages: ses.getSpellCheckerLanguages(),
  });
  if (dir) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(reportFile(dir, mode), JSON.stringify(report, null, 2));
    } catch (err) {
      console.error('[selbsttest] Bericht nicht geschrieben:', err);
    }
  }
  console.log(`[smoke] ${report.pass ? 'OK' : 'FEHLER'} ${mode} ${JSON.stringify(report.problems)}`);
  app.exit(report.pass ? 0 : 1);
}

app.on('window-all-closed', () => app.quit());

// Beim Beenden Projekt sauber schliessen: zuerst sichern, falls in dieser
// Sitzung etwas geändert wurde (SPEC «bei Programmende», AJ-15), dann WAL
// zurückschreiben und Sperre freigeben. Die Sicherung ist asynchron: Beenden
// anhalten, sichern (höchstens quitTimeoutMs), dann wirklich beenden. Eine
// abgebrochene Sicherung hinterlässt keine halbe Datei (fs-atomic.ts).
let quitPrepared = false;
app.on('will-quit', (event) => {
  mcp.stop();
  if (!quitPrepared && projects.isOpen) {
    event.preventDefault();
    quitPrepared = true;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>(
      (resolve) => (timer = setTimeout(resolve, BACKUP_POLICY.quitTimeoutMs)),
    );
    void Promise.race([backups.beforeClose(), timeout])
      .catch((err: unknown) => console.error('[sicherung] Sicherung beim Beenden:', err))
      .finally(() => {
        clearTimeout(timer);
        app.quit();
      });
    return;
  }
  try {
    projects.close();
  } catch (err) {
    console.error('[projekt] Schliessen beim Beenden fehlgeschlagen:', err);
  }
});

// Ende-zu-Ende-Rauchtest: startet die gebaute App (out/) mit Playwright und
// prüft die Sicherheitsgrenzen von aussen – so, wie ein Angreifer im Renderer
// sie sehen würde.  Ausführen:  npm run test:e2e
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from './helpers.mjs';

let app;
let page;

before(async () => {
  ({ app, page } = await launchApp());
});

after(async () => {
  await app?.close();
});

test('Fenster zeigt Lernjournal und lädt über das eigene Protokoll', async () => {
  assert.match(await page.title(), /– Lernjournal$/);
  assert.match(page.url(), /^app:\/\/lernjournal\//);
  await page.getByText('Version 0.1.0').waitFor();
});

test('Renderer hat keinen Zugriff auf Node.js oder Electron', async () => {
  const r = await page.evaluate(() => ({
    require: typeof globalThis.require,
    process: typeof globalThis.process,
    module: typeof globalThis.module,
    ipcRenderer: typeof globalThis.ipcRenderer,
    bridgeKeys: Object.keys(globalThis.lernjournal),
  }));
  assert.deepEqual(r, {
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    ipcRenderer: 'undefined',
    bridgeKeys: ['app', 'project', 'profile', 'media', 'journal', 'search', 'export', 'archive', 'taxonomy'],
  });
});

test('Fenster läuft mit sicheren webPreferences', async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      sandbox: p.sandbox,
      webSecurity: p.webSecurity,
    };
  });
  assert.deepEqual(prefs, {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  });
});

test('CSP verbietet Inline-Skripte und eval', async () => {
  // Hinweis: eval() direkt in page.evaluate testen geht nicht – Code aus dem
  // DevTools-Protokoll ist von der CSP-Eval-Sperre ausgenommen. Darum prüfen wir
  // (a) den tatsächlich ausgelieferten Header und (b) Ausführung im Seitenkontext.
  const r = await page.evaluate(async () => {
    const res = await fetch('app://lernjournal/index.html');
    const csp = res.headers.get('content-security-policy') ?? '';
    const s = document.createElement('script');
    s.textContent = 'window.__inline = true';
    document.body.appendChild(s);
    // String-Timer ist eine Form von eval und läuft im Seitenkontext
    try {
      setTimeout('window.__timer = true', 0);
    } catch {
      /* ignoriert */
    }
    await new Promise((ok) => setTimeout(ok, 100));
    return { csp, inlineRan: window.__inline === true, timerRan: window.__timer === true };
  });
  assert.match(r.csp, /script-src 'self'(;|$)/);
  assert.doesNotMatch(r.csp, /unsafe-eval/);
  assert.equal(r.inlineRan, false);
  assert.equal(r.timerRan, false);
});

test('Navigation zu fremden Seiten und neue Fenster werden blockiert', async () => {
  const before = page.url();
  await page.evaluate(() => {
    window.open('https://example.com');
    window.location.href = 'https://example.com';
  });
  await page.waitForTimeout(500);
  assert.equal(page.url(), before);
  assert.equal(app.windows().length, 1);
});

test('Netzwerkzugriffe ins Internet werden blockiert (offline-first)', async () => {
  const r = await page.evaluate(async () => {
    try {
      await fetch('https://example.com');
      return 'erreicht';
    } catch {
      return 'blockiert';
    }
  });
  assert.equal(r, 'blockiert');
});

test('Brücke liefert App-Infos als Ergebnisobjekt', async () => {
  const r = await page.evaluate(() => window.lernjournal.app.getInfo());
  assert.equal(r.ok, true);
  assert.equal(r.data.name, 'Lernjournal');
});

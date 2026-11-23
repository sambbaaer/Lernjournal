// E2E: Office-ähnliche App-Shell (AJ-02) – Navigation, Tastatur, Fokus,
// Barrierefreiheit und Fenstergrössen.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { focusedRegion, launchApp, runAxe } from './helpers.mjs';

let app;
let page;

before(async () => {
  ({ app, page } = await launchApp());
});
after(async () => {
  await app?.close();
});

// Vor jedem Test in einen definierten Zustand: Datei-Menü zu, Startansicht.
async function reset() {
  if (await page.locator('[role="dialog"][aria-label="Datei"]').count()) await page.keyboard.press('Escape');
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Start' })
    .click();
}

test('Navigation wechselt Ansicht und Fenstertitel', async () => {
  await reset();
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await nav.getByRole('button', { name: 'Journale' }).click();
  await page.getByRole('heading', { level: 1, name: 'Journale' }).waitFor();
  assert.equal(await page.title(), 'Journale – Lernjournal');
  assert.equal(await nav.getByRole('button', { name: 'Journale' }).getAttribute('aria-current'), 'page');
  // Electron übernimmt den Seitentitel in die Windows-Titelleiste
  const winTitle = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
  assert.equal(winTitle, 'Journale – Lernjournal');
});

test('Pfeiltasten wandern in der Navigation', async () => {
  await reset();
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Start' })
    .focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { level: 1, name: 'Fachbuch' }).waitFor();
});

test('Strg+Umschalt+F öffnet das Fachbuch mit Fokus im Suchfeld', async () => {
  await reset();
  await page.keyboard.press('Control+Shift+F');
  await page.getByRole('heading', { level: 1, name: 'Fachbuch' }).waitFor();
  const focusedId = await page.evaluate(() => document.activeElement?.id);
  assert.equal(focusedId, 'fachbuch-search');
});

test('F6 springt zwischen Menüband, Navigation, Dokument und Statusleiste', async () => {
  await reset();
  await page.evaluate(() => document.activeElement?.blur());
  const order = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('F6');
    order.push(await focusedRegion(page));
  }
  assert.deepEqual(order, ['ribbon', 'navigation', 'document', 'statusbar', 'ribbon']);
  await page.keyboard.press('Shift+F6');
  assert.equal(await focusedRegion(page), 'statusbar');
});

test('Register im Menüband mit Pfeiltasten wechseln', async () => {
  await reset();
  await page.getByRole('tab', { name: 'Start' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'Einfügen' }).getAttribute('aria-selected'), 'true');
  await page.getByRole('tabpanel').getByRole('button', { name: 'Bild' }).waitFor();
  await page.keyboard.press('End');
  assert.equal(await page.getByRole('tab', { name: 'Exportieren' }).getAttribute('aria-selected'), 'true');
  await page.getByRole('tab', { name: 'Start' }).click();
});

test('Nicht verfügbare Befehle erklären den Grund und tun nichts', async () => {
  await reset();
  const bold = page.getByRole('tabpanel').getByRole('button', { name: 'Fett' });
  assert.equal(await bold.getAttribute('aria-disabled'), 'true');
  assert.match(await bold.getAttribute('title'), /Strg\+B.*Nur in einem geöffneten Journal/);
  await bold.click({ force: true }); // bewusst trotz aria-disabled klicken
  assert.equal(await page.title(), 'Start – Lernjournal');
});

test('Datei-Menü: Alt+D öffnet, Esc schliesst, Fokus zurück auf «Datei»', async () => {
  await reset();
  await page.keyboard.press('Alt+D');
  const dialog = page.getByRole('dialog', { name: 'Datei' });
  await dialog.waitFor();
  assert.equal(await page.title(), 'Datei – Lernjournal');
  // Fokus liegt im Menü, Tab bleibt im Menü gefangen
  for (let i = 0; i < 10; i++) await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), true);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Datei');
});

test('Strg+S behauptet ohne Änderungen nie «Gespeichert»', async () => {
  await reset();
  await page.keyboard.press('Control+S');
  const live = page.getByTestId('statusbar-live');
  await live.getByText('Nichts zu speichern', { exact: false }).waitFor();
  assert.doesNotMatch(await live.textContent(), /Gespeichert/);
});

test('Barrierefreiheit (axe, WCAG 2.2 AA): Start, Fachbuch, Datei-Menü ohne Verstösse', async () => {
  await reset();
  const results = {};
  results.start = await runAxe(page);
  await page.keyboard.press('Control+Shift+F');
  results.fachbuch = await runAxe(page);
  await page.keyboard.press('Alt+D');
  await page.getByRole('button', { name: 'Info' }).click();
  results.datei = await runAxe(page);
  await page.keyboard.press('Escape');
  for (const [view, violations] of Object.entries(results)) {
    assert.deepEqual(violations, [], `${view}: ${JSON.stringify(violations, null, 2)}`);
  }
});

test('Mindestgrösse 1024 × 640 und 150 % Zoom ohne horizontales Scrollen', async () => {
  await reset();
  const noHorizontalScroll = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1024, 640));
  await page.waitForTimeout(300);
  assert.equal(await noHorizontalScroll(), true, 'bei 1024 × 640');
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setContentSize(1600, 960);
    w.webContents.setZoomFactor(1.5);
  });
  await page.waitForTimeout(300);
  assert.equal(await noHorizontalScroll(), true, 'bei 150 % Zoom');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
});

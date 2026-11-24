// E2E: P0-Abnahme (AJ-17) – Ablauf einer lernenden Person in einem Stück,
// für die Punkte der SPEC «P0-Abnahme», die andere E2E-Tests nur in Teilen
// zeigen (Zuordnung aller elf Punkte: docs/ABNAHME.md):
//   1  Projekt mit Profil (Fachrichtung Print als Standard, Lehrbeginn) anlegen,
//      neues Journal mit EINEM Klick und Titel, nach Neustart von selbst offen
//   2  drei Abschnitte, mehrere Bilder mit Legenden, Lernort und Metadaten
//      bleiben dauerhaft gespeichert; Lehrjahr aus Lehrbeginn abgeleitet
//   3  Duplizieren kopiert die Bilder, Löschen fragt nach und räumt die
//      Bilddateien des gelöschten Journals mit auf
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { launchApp, runAxe, waitForNewSave } from './helpers.mjs';

let app;
let page;
let dir;
const fixture = (n) => path.resolve('e2e/fixtures', n);
const editor = (name) => page.getByRole('textbox', { name, exact: true });
const nav = (name) =>
  page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name, exact: true });
const title = () => page.getByLabel('Titel des Journals');
// Text der Option «Automatisch (n. Lehrjahr)» im Feld «Lehrjahr»
const lehrjahrAuto = () => page.getByLabel('Lehrjahr').locator('option[value="auto"]');
const mediaFiles = () => readdirSync(path.join(dir, 'Dokumente', 'Lernjournal', 'media')).sort();

before(async () => {
  ({ app, page, dir } = await launchApp({ withProject: false }));
});
after(async () => {
  await app?.close();
});

// Bild über den Dateidialog einfügen und Legende eintragen: Nach dem Einfügen
// steht der Cursor im Legendenfeld des NEUEN Bildes – dort tippen
async function insertImage(file, caption) {
  const before = await page.getByLabel('Bildlegende').count();
  await page.getByRole('tab', { name: 'Einfügen', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('tabpanel').getByRole('button', { name: 'Bild' }).click();
  await (await chooser).setFiles(fixture(file));
  await page.waitForFunction(
    (n) =>
      document.querySelectorAll('[aria-label="Bildlegende"]').length === n + 1 &&
      document.activeElement?.getAttribute('aria-label') === 'Bildlegende',
    before,
  );
  await waitForNewSave(page, () => page.keyboard.type(caption));
}

test('P0-1: Projekt mit Profil anlegen (Print vorgewählt, Lehrbeginn), Journal mit einem Klick und Titel', async () => {
  await page.getByRole('button', { name: /Neues Lernjournal anlegen/ }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  assert.equal(await page.getByRole('radio', { name: 'Print', exact: true }).isChecked(), true);
  await page.getByLabel('Dein Name').fill('Lea Muster');
  await page.getByLabel(/Lehrbeginn/).fill('2025-08-04');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Lernjournal anlegen' }).click();
  await page.getByRole('heading', { level: 1, name: 'Willkommen, Lea' }).waitFor();

  // Ein Klick auf «Neues Journal» (Startseite), dann nur noch den Titel tippen
  await page.getByRole('main').getByRole('button', { name: 'Neues Journal' }).click();
  await title().waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'journal-title');
  await waitForNewSave(page, () => page.keyboard.type('Farbmessung am Druckbogen'));
});

test('P0-2: drei Abschnitte, zwei Bilder mit Legenden, Lernort, Arbeitsdatum; Lehrjahr abgeleitet', async () => {
  // Lehrbeginn 4.8.2025: am 10.9.2026 im 2. Lehrjahr, am 1.3.2026 im 1. Lehrjahr
  await waitForNewSave(page, async () => {
    await page.getByLabel('Arbeitsdatum').fill('2026-03-01');
    await page.getByLabel('Arbeitsdatum').blur();
  });
  assert.match(await lehrjahrAuto().textContent(), /Automatisch \(1\. Lehrjahr\)/);
  await waitForNewSave(page, async () => {
    await page.getByLabel('Arbeitsdatum').fill('2026-09-10');
    await page.getByLabel('Arbeitsdatum').blur();
  });
  assert.match(await lehrjahrAuto().textContent(), /Automatisch \(2\. Lehrjahr\)/);
  await waitForNewSave(page, () => page.getByLabel('Lernort').selectOption('uek'));

  await waitForNewSave(page, async () => {
    await editor('Auftrag / Ausgangslage').click();
    await page.keyboard.type('Farbe nach Proof abstimmen.');
  });
  await waitForNewSave(page, async () => {
    await editor('Durchführung').click();
    await page.keyboard.type('Mit dem Spektralfotometer gemessen.');
  });
  await insertImage('screenshot.png', 'Kontrollstreifen am Bogen');
  await page.keyboard.press('Enter');
  await insertImage('bild.webp', 'Druckbogen von oben');
  await waitForNewSave(page, async () => {
    await editor('Reflexion').click();
    await page.keyboard.type('Nächstes Mal früher messen.');
  });
  assert.equal(mediaFiles().length, 2);
  assert.deepEqual(await runAxe(page), []);

  // Neustart: Projekt öffnet von selbst, alles ist noch da
  await app.close();
  ({ app, page } = await launchApp({ dir, withProject: false }));
  await page.getByRole('heading', { level: 1, name: 'Willkommen, Lea' }).waitFor();
  await nav('Journale').click();
  await page.getByRole('row', { name: /Farbmessung am Druckbogen/ }).dblclick();
  await editor('Reflexion').waitFor();
  assert.equal(await title().inputValue(), 'Farbmessung am Druckbogen');
  assert.equal(await page.getByLabel('Arbeitsdatum').inputValue(), '2026-09-10');
  assert.equal(await page.getByLabel('Lernort').inputValue(), 'uek');
  assert.match(await lehrjahrAuto().textContent(), /2\. Lehrjahr/);
  assert.match(await editor('Auftrag / Ausgangslage').textContent(), /Farbe nach Proof abstimmen\./);
  assert.match(await editor('Durchführung').textContent(), /Spektralfotometer gemessen\./);
  assert.match(await editor('Reflexion').textContent(), /Nächstes Mal früher messen\./);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.lj-figure img').length === 2 &&
      [...document.querySelectorAll('.lj-figure img')].every((i) => i.complete && i.naturalWidth > 0),
  );
  const captions = page.getByLabel('Bildlegende');
  assert.deepEqual(
    [await captions.nth(0).inputValue(), await captions.nth(1).inputValue()],
    ['Kontrollstreifen am Bogen', 'Druckbogen von oben'],
  );
});

test('P0-3: Duplizieren kopiert Bilder; Löschen mit Bestätigung räumt die Bilddateien auf', async () => {
  await page
    .getByRole('toolbar', { name: 'Journal-Aktionen' })
    .getByRole('button', { name: 'Duplizieren' })
    .click();
  await page.waitForFunction(
    () => document.querySelector('#journal-title')?.value === 'Kopie von Farbmessung am Druckbogen',
  );
  await page.waitForFunction(() => document.querySelectorAll('.lj-figure img').length === 2);
  assert.equal(mediaFiles().length, 4, 'Kopie hat eigene Bilddateien');

  await page
    .getByRole('toolbar', { name: 'Journal-Aktionen' })
    .getByRole('button', { name: 'Löschen' })
    .click();
  const dialog = page.getByRole('alertdialog', { name: 'Journal endgültig löschen?' });
  await dialog.waitFor();
  assert.match(await dialog.textContent(), /mit allen Bildern gelöscht/);
  await dialog.getByRole('button', { name: 'Löschen' }).click();
  await page.getByTestId('statusbar-live').getByText('Journal gelöscht.').waitFor();
  assert.equal(mediaFiles().length, 2, 'Bilder der Kopie sind weg, die des Originals bleiben');

  await nav('Journale').click();
  assert.equal(await page.getByRole('row', { name: /Farbmessung am Druckbogen/ }).count(), 1);
});

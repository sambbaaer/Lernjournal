// E2E: Kategorien und Schlagwörter (AJ-09) – zuordnen im Journal, filtern in
// der Liste, verwalten in den Einstellungen, dauerhaft nach Neustart.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, runAxe } from './helpers.mjs';

let app;
let page;
let dir;

before(async () => {
  ({ app, page, dir } = await launchApp());
});
after(async () => {
  await app?.close();
});

const nav = (name) =>
  page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name, exact: true });
const saved = () => page.getByTestId('statusbar-live').getByText('Gespeichert').waitFor();
const tagInput = () =>
  page.getByRole('article', { name: 'Journal' }).getByLabel('Schlagwörter', { exact: true });
const chips = () => page.getByRole('list', { name: 'Schlagwörter dieses Journals' }).getByRole('listitem');
const picker = () => page.getByRole('group', { name: 'Kategorien für dieses Journal' });
const row = (title) => page.getByRole('row', { name: new RegExp(title) });

async function newJournal(title) {
  await page.keyboard.press('Control+N');
  await page.getByLabel('Titel des Journals').fill(title);
}

async function openFromList(title) {
  await nav('Journale').click();
  await row(title).dblclick();
  await page.getByLabel('Titel des Journals').waitFor();
}

test('Kategorien im Journal wählen: mehrere, sofort gespeichert, per Tastatur', async () => {
  await newJournal('Farbmessung am Druckbogen');
  // Über das Menüband «Journal → Kategorien»: Liste öffnet, Fokus im ersten Kästchen
  await page.getByRole('tab', { name: 'Journal', exact: true }).click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Kategorien' }).click();
  await picker().waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'checkbox');

  await picker()
    .getByLabel(/^e – Ausführen von Druckaufträgen/)
    .check();
  await saved();
  await picker()
    .getByLabel(/^a – Umsetzen/)
    .check();
  await saved();

  const results = await runAxe(page);
  assert.deepEqual(results, [], JSON.stringify(results, null, 2));

  // Esc schliesst, Fokus zurück auf «Auswählen»
  await page.keyboard.press('Escape');
  await picker().waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Auswählen');
  // Ausgewählte Kategorien als Chips sichtbar, in Reihenfolge a … e
  const article = page.getByRole('article', { name: 'Journal' });
  assert.match(await article.textContent(), /a – Umsetzen.*e – Ausführen von Druckaufträgen/s);
});

test('Neue Kategorie direkt im Journal anlegen und zuordnen', async () => {
  await page.getByRole('button', { name: 'Auswählen' }).click();
  await picker().waitFor();
  await page.getByPlaceholder('Neue Kategorie').fill('Qualitätssicherung');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await picker().getByLabel('Qualitätssicherung').waitFor();
  assert.equal(await picker().getByLabel('Qualitätssicherung').isChecked(), true);
  // Gleicher Name in anderer Schreibweise legt nichts Doppeltes an
  await page.getByPlaceholder('Neue Kategorie').fill('qualitätssicherung');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByRole('button', { name: 'Fertig' }).click();
  assert.equal(await page.getByText('Qualitätssicherung', { exact: true }).count(), 1);
});

test('Schlagwörter: Enter und Komma fügen hinzu, bestehende Schreibweise wird übernommen', async () => {
  await tagInput().click();
  await page.keyboard.type('Spektralfotometer');
  await page.keyboard.press('Enter');
  await saved();
  await page.keyboard.type('#Farbmessung, Proof,');
  await saved();
  assert.deepEqual(await chips().allTextContents(), ['Farbmessung', 'Proof', 'Spektralfotometer']);
  // Rücktaste im leeren Feld entfernt das letzte Schlagwort
  await page.keyboard.press('Backspace');
  await saved();
  assert.deepEqual(await chips().allTextContents(), ['Farbmessung', 'Proof']);

  // Zweites Journal: «farbmessung» wird zum bestehenden «Farbmessung»
  await newJournal('Papierlaufrichtung bestimmen');
  await page.getByRole('button', { name: 'Auswählen' }).click();
  await picker()
    .getByLabel(/^c – Planen/)
    .check();
  await saved();
  await page.keyboard.press('Escape');
  await tagInput().fill('farbmessung');
  await page.keyboard.press('Enter');
  await saved();
  assert.deepEqual(await chips().allTextContents(), ['Farbmessung']);
  // Verlassen des Feldes übernimmt angefangene Eingabe
  await tagInput().fill('Laufrichtung');
  await page.getByLabel('Titel des Journals').click();
  await saved();
  assert.deepEqual(await chips().allTextContents(), ['Farbmessung', 'Laufrichtung']);
  // Entfernen per Knopf
  await page.getByRole('button', { name: 'Schlagwort «Laufrichtung» entfernen' }).click();
  await saved();
  assert.deepEqual(await chips().allTextContents(), ['Farbmessung']);

  await newJournal('Ohne Zuordnung');
  await saved().catch(() => {});
});

test('Journalliste: nach Kategorie, «ohne Kategorie» und Schlagwort filtern', async () => {
  await nav('Journale').click();
  await row('Ohne Zuordnung').waitFor();
  const titles = async () =>
    (await page.locator('tbody tr td:first-child > span:first-child').allTextContents()).sort();

  // Spalte «Kategorien» und Schlagwörter unter dem Titel
  assert.match(await row('Farbmessung am Druckbogen').textContent(), /Farbmessung · Proof/);
  assert.match(await row('Farbmessung am Druckbogen').textContent(), /e – Ausführen/);

  await page
    .getByLabel('Kategorie', { exact: true })
    .selectOption({ label: 'e – Ausführen von Druckaufträgen' });
  assert.deepEqual(await titles(), ['Farbmessung am Druckbogen']);
  await page.getByLabel('Kategorie', { exact: true }).selectOption('none');
  assert.deepEqual(await titles(), ['Ohne Zuordnung']);
  await page.getByLabel('Kategorie', { exact: true }).selectOption('all');
  await page.getByLabel('Schlagwort', { exact: true }).selectOption({ label: 'Farbmessung' });
  assert.deepEqual(await titles(), ['Farbmessung am Druckbogen', 'Papierlaufrichtung bestimmen']);
  await page.getByRole('button', { name: 'Filter zurücksetzen' }).click();
  assert.equal((await titles()).length, 3);

  const results = await runAxe(page);
  assert.deepEqual(results, [], JSON.stringify(results, null, 2));
});

test('Einstellungen: umbenennen, zusammenführen, löschen – Journale bleiben', async () => {
  await nav('Einstellungen').click();
  const section = page.getByRole('region', { name: 'Kategorien und Schlagwörter' });
  await section.waitFor();
  // Lange Seite: Nur der Dokumentbereich scrollt, nie das ganze Fenster
  // (unsichtbare sr-only-Labels zählten sonst zur Fensterhöhe)
  const root = await page.evaluate(() => [document.scrollingElement.scrollHeight, innerHeight]);
  assert.ok(root[0] <= root[1], `Fenster scrollt: ${root[0]} > ${root[1]}`);
  const results = await runAxe(page);
  assert.deepEqual(results, [], JSON.stringify(results, null, 2));

  // Schlagwort umbenennen; Konflikt mit bestehendem Namen erklärt «Zusammenführen»
  await section.getByRole('button', { name: '«Proof» umbenennen' }).click();
  await page.getByLabel('Neuer Name für «Proof»').fill('farbmessung');
  await page.keyboard.press('Enter');
  await section.getByText(/gibt es schon.*Zusammenführen/).waitFor();
  await page.getByLabel('Neuer Name für «Proof»').fill('Andruck');
  await page.keyboard.press('Enter');
  await section.getByRole('cell', { name: 'Andruck', exact: true }).waitFor();

  // Kategorie c mit e zusammenführen: Papierlaufrichtung landet in e
  await section.getByRole('button', { name: /^«c – Planen.*zusammenführen/ }).click();
  await page.getByLabel('Zusammenführen mit').selectOption({ label: 'e – Ausführen von Druckaufträgen' });
  await page.getByRole('button', { name: 'Weiter …' }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByText(/Alle Journale mit «c – Planen/).waitFor();
  await confirm.getByRole('button', { name: 'Zusammenführen' }).click();
  await section.getByRole('row', { name: /e – Ausführen von Druckaufträgen.*2 Journale/ }).waitFor();
  assert.equal(await section.getByText(/^c – Planen/).count(), 0);

  // Löschen fragt nach und lässt das Journal bestehen
  await section.getByRole('button', { name: '«Qualitätssicherung» löschen' }).click();
  await page
    .getByRole('alertdialog')
    .getByText(/bei 1 Journal entfernt/)
    .waitFor();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'detached' });
  await section.getByText('Qualitätssicherung').waitFor({ state: 'detached' });
  assert.match(await page.getByTestId('journal-count').textContent(), /^3/);

  // Liste zeigt die neuen Zuordnungen
  await nav('Journale').click();
  assert.match(await row('Papierlaufrichtung bestimmen').textContent(), /e – Ausführen/);
  assert.match(await row('Farbmessung am Druckbogen').textContent(), /Andruck/);
});

test('Vorschläge a–g lassen sich nach dem Löschen wieder ergänzen', async () => {
  await nav('Einstellungen').click();
  const section = page.getByRole('region', { name: 'Kategorien und Schlagwörter' });
  await section.getByRole('button', { name: /^«g – Warten.*löschen/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click();
  await section.getByRole('button', { name: /Vorschläge a–g .* ergänzen \(2 fehlen\)/ }).click();
  await section.getByText(/^g – Warten/).waitFor();
  await section.getByText(/^c – Planen/).waitFor();
  assert.equal(await section.getByRole('button', { name: /Vorschläge a–g/ }).count(), 0);
});

test('Zuordnungen bleiben nach Neustart erhalten; Schlagwörter ohne Journal verschwinden', async () => {
  // Einziges Journal mit «Spektralfotometer» gab es nie (wieder entfernt) → kein Eintrag
  await app.close();
  ({ app, page } = await launchApp({ dir }));
  await openFromList('Farbmessung am Druckbogen');
  assert.deepEqual(await chips().allTextContents(), ['Andruck', 'Farbmessung']);
  const article = page.getByRole('article', { name: 'Journal' });
  assert.match(await article.textContent(), /a – Umsetzen.*e – Ausführen/s);

  await nav('Einstellungen').click();
  const section = page.getByRole('region', { name: 'Kategorien und Schlagwörter' });
  assert.equal(await section.getByText('Spektralfotometer').count(), 0);
  assert.equal(await section.getByText('Laufrichtung', { exact: true }).count(), 0);
});

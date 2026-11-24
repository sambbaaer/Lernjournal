// E2E: Fachbuch und Volltextsuche (AJ-11) – Titel, Text, Bildlegenden und
// Schlagwörter finden (Umlaute egal), Themenansichten, Tastatur, Suche bleibt
// beim Zurückkehren erhalten, Suchindex neu aufbauen, nach Neustart.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launchApp, openJournalDetails, runAxe, waitForNewSave } from './helpers.mjs';

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
const topics = () => page.getByRole('navigation', { name: 'Themen und Schlagwörter' });
const saved = () => page.getByTestId('statusbar-live').getByText('Gespeichert').waitFor();
const editor = (name) => page.getByRole('textbox', { name, exact: true });
const title = () => page.getByLabel('Titel des Journals');
const searchBox = () => page.getByRole('searchbox', { name: 'Im Fachbuch suchen' });
const hits = () => page.getByRole('list', { name: 'Treffer' });
const hit = (name) => hits().getByRole('button', { name });

async function newJournal(name) {
  await page.keyboard.press('Control+N');
  await title().fill(name);
  await saved();
}

// Suchbegriff eingeben und warten, bis die Anzahl Treffer für GENAU diesen Begriff dasteht
async function search(q) {
  await searchBox().fill(q);
  await page
    .getByRole('status')
    .filter({ hasText: new RegExp(`^\\d+ Treffer für «${q}»`) })
    .waitFor();
}

test('Journale mit Text, Bildlegende, Schlagwort und Kategorie anlegen', async () => {
  await newJournal('Kühlung der Druckmaschine');
  await waitForNewSave(page, async () => {
    await editor('Durchführung').click();
    await page.keyboard.type('Farbmessung mit dem Spektralfotometer. ');
  });
  // Bild mit Legende
  await page.getByRole('tab', { name: 'Einfügen', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('tabpanel').getByRole('button', { name: 'Bild' }).click();
  await (await chooser).setFiles(path.resolve('e2e/fixtures/bild.webp'));
  await waitForNewSave(page, async () => {
    await page.getByLabel('Bildlegende').fill('Kontrollstreifen am Bogen');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Fertig.');
  });
  // Schlagwort und Kategorie
  await openJournalDetails(page);
  await waitForNewSave(page, async () => {
    await page
      .getByRole('article', { name: 'Journal' })
      .getByLabel('Schlagwörter', { exact: true })
      .fill('Offset');
    await page.keyboard.press('Enter');
  });
  await page.getByRole('button', { name: 'Auswählen' }).click();
  await waitForNewSave(page, () =>
    page
      .getByRole('group', { name: 'Kategorien für dieses Journal' })
      .getByLabel(/^e – Ausführen von Druckaufträgen/)
      .check(),
  );
  await page.keyboard.press('Escape');

  await newJournal('Papier lagern');
  await waitForNewSave(page, async () => {
    await editor('Reflexion').click();
    await page.keyboard.type('Luftfeuchtigkeit im Lager beachten.');
  });
});

test('Suche findet Titel, Text, Bildlegende und Schlagwort – Umlaute und Gross/Klein egal', async () => {
  // Strg+Umschalt+F: Fachbuch mit Fokus im Suchfeld
  await page.keyboard.press('Control+Shift+F');
  await searchBox().waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'fachbuch-search');

  await search('kuehlung');
  await hit(/Kühlung der Druckmaschine/).waitFor();
  assert.equal(await hits().locator('mark').first().textContent(), 'Kühlung');

  await search('SPEKTRAL');
  assert.match(await hit(/Kühlung/).textContent(), /Spektralfotometer.*Gefunden in: Text/s);
  // Markiert wird genau der gesuchte Teil
  assert.equal(await hits().locator('mark').first().textContent(), 'Spektral');

  await search('kontrollstreif');
  assert.match(await hit(/Kühlung/).textContent(), /Bildlegende: Kontrollstreifen am Bogen/);

  // Wortteil in zusammengesetztem Wort; zu kurze Eingabe sucht noch nicht
  await search('maschine');
  assert.equal(await hits().locator('mark').first().textContent(), 'maschine');
  await searchBox().fill('UV');
  await page.getByRole('status').filter({ hasText: 'Suchbegriffe ab 3 Zeichen eingeben.' }).waitFor();

  await search('offset');
  assert.match(await hit(/Kühlung/).textContent(), /Gefunden in: Schlagwort/);

  await search('Lagerhalle');
  await page.getByText('Keine Treffer für «Lagerhalle»').waitFor();

  await search('luftfeucht');
  const results = await runAxe(page);
  assert.deepEqual(results, [], JSON.stringify(results, null, 2));
});

test('Themenansichten: Kategorie, «Ohne Kategorie», Schlagwort; Suche im Thema', async () => {
  // Esc leert das Suchfeld → Übersicht des gewählten Ausschnitts
  await searchBox().focus();
  await page.keyboard.press('Escape');
  assert.equal(await searchBox().inputValue(), '');

  await topics()
    .getByRole('button', { name: /^e – Ausführen von Druckaufträgen/ })
    .click();
  await page.getByRole('heading', { name: 'e – Ausführen von Druckaufträgen', level: 2 }).waitFor();
  const journalsList = page.getByRole('list', { name: 'Journale' });
  assert.equal(await journalsList.getByRole('button').count(), 1);
  assert.match(await journalsList.textContent(), /Kühlung der Druckmaschine/);
  // Verwandte Schlagwörter des Themas
  await page.getByRole('button', { name: /^Offset \(1\)/ }).waitFor();

  await topics()
    .getByRole('button', { name: /^Ohne Kategorie/ })
    .click();
  assert.match(await journalsList.textContent(), /Papier lagern/);
  assert.doesNotMatch(await journalsList.textContent(), /Kühlung/);

  // Suche im Thema e: Treffer ausserhalb werden genannt
  await topics()
    .getByRole('button', { name: /^e – Ausführen/ })
    .click();
  await searchBox().fill('luft');
  await page.getByText(/1 weiterer Treffer ausserhalb von «e – Ausführen/).waitFor();
  await page.getByRole('button', { name: 'In allen Journalen suchen' }).click();
  await hit(/Papier lagern/).waitFor();

  const results = await runAxe(page);
  assert.deepEqual(results, [], JSON.stringify(results, null, 2));
});

test('Tastatur: Pfeil runter zu den Treffern, Enter öffnet, Suche bleibt beim Zurückkehren', async () => {
  await searchBox().focus();
  await page.keyboard.press('ArrowDown');
  assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ''), /Papier lagern/);
  await page.keyboard.press('Enter');
  await title().waitFor();
  assert.equal(await title().inputValue(), 'Papier lagern');

  await nav('Fachbuch').click();
  assert.equal(await searchBox().inputValue(), 'luft');
  await hit(/Papier lagern/).waitFor();
});

test('Suchindex neu aufbauen (Einstellungen) und Suche nach Neustart', async () => {
  await nav('Einstellungen').click();
  await page.getByRole('button', { name: 'Suchindex neu aufbauen' }).click();
  await page.getByTestId('statusbar-live').getByText('Suchindex neu aufgebaut (2 Journale).').waitFor();

  await app.close();
  ({ app, page } = await launchApp({ dir }));
  await page.keyboard.press('Control+Shift+F');
  await search('kontrollstreifen');
  await hit(/Kühlung der Druckmaschine/).waitFor();
});

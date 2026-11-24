// E2E: Journal-Verknüpfungen (AJ-10) – verknüpfen per Suche, Rückverweise in
// beiden Journalen, Links im Text mit «Erwähnt in», Löschen ohne Links ins
// Leere, dauerhaft nach Neustart.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, openJournalDetails, runAxe } from './helpers.mjs';

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
const ribbon = () => page.getByRole('tabpanel');
const tab = (name) => page.getByRole('tab', { name, exact: true });
const saved = () => page.getByTestId('statusbar-live').getByText('Gespeichert').waitFor();
const editor = (name) => page.getByRole('textbox', { name, exact: true });
const linkedList = () => page.getByRole('list', { name: 'Verknüpft mit' });
const mentionList = () => page.getByRole('list', { name: 'Erwähnt in' });
const title = () => page.getByLabel('Titel des Journals');

async function newJournal(name) {
  await page.keyboard.press('Control+N');
  await title().fill(name);
  await saved();
}

async function openFromList(name) {
  await nav('Journale').click();
  await page.getByRole('row', { name: new RegExp(name) }).dblclick();
  await title().waitFor();
  await openJournalDetails(page);
}

test('Journal verknüpfen: Auswahl per Suche (ohne Umlaute), Rückverweis im anderen Journal', async () => {
  await newJournal('Farbprofil wählen');
  await newJournal('Überfüller anlegen');
  await newJournal('Druckauftrag Flyer');

  // Menüband «Journal → Verknüpfen» öffnet die Auswahl, Fokus im Suchfeld
  await tab('Journal').click();
  await ribbon().getByRole('button', { name: 'Verknüpfen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Journal verknüpfen' });
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'combobox');
  // Das Journal selbst steht nicht in der Liste
  const options = (await dialog.getByRole('option').allTextContents()).map((t) => t.replace(/\d.*/, ''));
  assert.deepEqual(options.sort(), ['Farbprofil wählen', 'Überfüller anlegen']);
  const results = await runAxe(page);
  assert.deepEqual(results, [], JSON.stringify(results, null, 2));

  await page.keyboard.type('ueberf');
  assert.equal(await dialog.getByRole('option').count(), 1);
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'detached' });
  await saved();
  assert.deepEqual(await linkedList().getByRole('listitem').allTextContents(), ['Überfüller anlegen']);

  // Schon verknüpfte Journale sind in der Auswahl als solche markiert und nicht wählbar
  await page.getByRole('button', { name: 'Journal verknüpfen …' }).click();
  const again = page.getByRole('dialog', { name: 'Journal verknüpfen' });
  const option = again.getByRole('option', { name: /Überfüller/ });
  assert.equal(await option.getAttribute('aria-disabled'), 'true');
  assert.match(await option.textContent(), /bereits verknüpft/);
  await page.keyboard.press('Escape');
  await again.waitFor({ state: 'detached' });

  // Klick auf den Titel öffnet das Journal: dort steht der Rückverweis
  await linkedList().getByRole('button', { name: 'Überfüller anlegen', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#journal-title')?.value === 'Überfüller anlegen');
  await openJournalDetails(page);
  await linkedList().getByRole('button', { name: 'Druckauftrag Flyer', exact: true }).waitFor();
});

test('Verknüpfung im Zieljournal lösen – verschwindet in beiden', async () => {
  await page.getByRole('button', { name: 'Verknüpfung mit «Druckauftrag Flyer» lösen' }).click();
  await saved();
  await linkedList().waitFor({ state: 'detached' });
  await openFromList('Druckauftrag Flyer');
  assert.equal(await linkedList().count(), 0);
  await page.getByText('Der Verweis erscheint in beiden.').waitFor();
  // Wieder verknüpfen (für den Neustart-Test)
  await page.getByRole('button', { name: 'Journal verknüpfen …' }).click();
  await page.keyboard.type('überfüller');
  await page.keyboard.press('Enter');
  await saved();
  await linkedList().getByRole('button', { name: 'Überfüller anlegen', exact: true }).waitFor();
});

test('Link zu Journal im Text: einfügen, Strg+Klick öffnet, Ziel zeigt «Erwähnt in»', async () => {
  await editor('Durchführung').click();
  await page.keyboard.type('Farbprofil nach ');
  await tab('Einfügen').click();
  await ribbon().getByRole('button', { name: 'Link zu Journal' }).click();
  const dialog = page.getByRole('dialog', { name: 'Link zu Journal' });
  await dialog.waitFor();
  await page.keyboard.type('farbprofil');
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'detached' });
  // Tiptap setzt den Fokus erst im nächsten Bildaufbau zurück in den Editor
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Durchführung');
  // Weitertippen nach dem Link ist wieder normaler Text
  await page.keyboard.type('gewählt.');
  await saved();
  const link = editor('Durchführung').getByRole('link', { name: 'Farbprofil wählen' });
  assert.match(await link.getAttribute('href'), /^lernjournal:\/\/journal\/[0-9a-f-]{36}$/);
  assert.match(await editor('Durchführung').textContent(), /Farbprofil nach Farbprofil wählen gewählt\./);
  // Menüband zeigt: Einfügemarke steht in einem Journal-Link
  await link.click();
  assert.equal(
    await ribbon().getByRole('button', { name: 'Link zu Journal' }).getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(await ribbon().getByRole('button', { name: 'Weblink' }).getAttribute('aria-pressed'), 'false');

  // Strg+Klick öffnet das Ziel; dort erscheint die Quelle als Rückverweis
  await link.click({ modifiers: ['Control'] });
  await page.waitForFunction(() => document.querySelector('#journal-title')?.value === 'Farbprofil wählen');
  await openJournalDetails(page);
  await mentionList().getByRole('button', { name: 'Druckauftrag Flyer', exact: true }).waitFor();
  const results = await runAxe(page);
  assert.deepEqual(results, [], JSON.stringify(results, null, 2));
});

test('Zieljournal löschen: Link im Text verschwindet, der Text bleibt', async () => {
  await page
    .getByRole('toolbar', { name: 'Journal-Aktionen' })
    .getByRole('button', { name: 'Löschen' })
    .click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByText(/Links aus anderen Journalen .* werden entfernt/).waitFor();
  await confirm.getByRole('button', { name: 'Löschen' }).click();
  await confirm.waitFor({ state: 'detached' });

  await openFromList('Druckauftrag Flyer');
  assert.equal(await editor('Durchführung').getByRole('link').count(), 0);
  assert.match(await editor('Durchführung').textContent(), /Farbprofil nach Farbprofil wählen gewählt\./);
});

test('Verknüpfungen bleiben nach Neustart erhalten', async () => {
  await app.close();
  ({ app, page } = await launchApp({ dir }));
  await openFromList('Überfüller anlegen');
  await linkedList().getByRole('button', { name: 'Druckauftrag Flyer', exact: true }).waitFor();
});

// E2E: Kategorien und Schlagwörter (AJ-09) – zuordnen, filtern, verwalten.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, runAxe } from './helpers.mjs';

let app;
let page;
before(async () => {
  ({ app, page } = await launchApp());
});
after(async () => {
  await app?.close();
});

const nav = (name) =>
  page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name }).click();
const tagChips = () => page.locator('#journal-tags-input').locator('xpath=..').locator('span.rounded-full');

async function newJournal(title) {
  await page.keyboard.press('Control+N');
  await page.getByLabel('Titel des Journals').fill(title);
}

test('Kategorien und Schlagwörter im Journal zuordnen', async () => {
  await newJournal('Farbmessung am Druckbogen');
  await page.locator('#journal-categories-summary').click();
  await page.getByRole('checkbox', { name: 'e – Ausführen von Druckaufträgen' }).check();
  await page
    .getByRole('list', { name: 'Zugeordnete Kategorien' })
    .getByText('e – Ausführen von Druckaufträgen')
    .waitFor();
  const input = page.getByLabel('Schlagwörter');
  await input.fill('Farbmessung');
  await input.press('Enter');
  await input.type('Bogenoffset,');
  await page.getByRole('button', { name: 'Schlagwort «Bogenoffset» entfernen' }).waitFor();
  assert.equal(await tagChips().count(), 2);
  assert.deepEqual(await runAxe(page), []);
});

test('Bestehendes Schlagwort wird wiederverwendet (Gross-/Kleinschreibung egal); Rücktaste entfernt', async () => {
  await newJournal('Spektralfotometer kalibrieren');
  // Menüband «Journal → Schlagwörter» springt ins Feld
  await page.getByRole('tab', { name: 'Journal', exact: true }).click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Schlagwörter' }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'journal-tags-input');
  await page.keyboard.type('farbmessung');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Test');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Schlagwort «Test» entfernen' }).waitFor();
  await page.keyboard.press('Backspace');
  await page.getByRole('button', { name: 'Schlagwort «Test» entfernen' }).waitFor({ state: 'detached' });
  // Gross-/Kleinschreibung des bestehenden Schlagworts bleibt
  await page.getByRole('button', { name: 'Schlagwort «Farbmessung» entfernen' }).waitFor();
  await page.getByRole('tab', { name: 'Start', exact: true }).click();
});

test('Journalliste nach Kategorie und Schlagwort filtern', async () => {
  await nav('Journale');
  await page.getByLabel('Schlagwort', { exact: true }).selectOption({ label: 'Farbmessung (2)' });
  assert.equal(await page.locator('tbody tr').count(), 2);
  await page
    .getByLabel('Kategorie', { exact: true })
    .selectOption({ label: 'e – Ausführen von Druckaufträgen' });
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.getByLabel('Schlagwort', { exact: true }).selectOption('');
  await page.getByLabel('Kategorie', { exact: true }).selectOption('');
});

test('Verwalten: umbenennen, zusammenführen, löschen; nicht mehr verwendete Schlagwörter verschwinden', async () => {
  await nav('Einstellungen');
  await page.getByRole('button', { name: 'Schlagwort «Bogenoffset» umbenennen' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Schlagwort umbenennen' });
  await dialog.getByRole('textbox').fill('farbmessung');
  await dialog.getByRole('button', { name: 'Umbenennen' }).click();
  await dialog.getByText(/gibt es schon/).waitFor();
  await dialog.getByRole('textbox').fill('Bogenoffsetdruck');
  await dialog.getByRole('button', { name: 'Umbenennen' }).click();
  await page.getByRole('button', { name: 'Schlagwort «Bogenoffsetdruck» umbenennen' }).waitFor();

  await page.getByRole('button', { name: 'Schlagwort «Bogenoffsetdruck» zusammenführen' }).click();
  const merge = page.getByRole('alertdialog', { name: 'Schlagwort zusammenführen' });
  await merge.getByRole('combobox').selectOption({ label: 'Farbmessung' });
  await merge.getByRole('button', { name: 'Zusammenführen' }).click();
  await page
    .getByRole('button', { name: 'Schlagwort «Bogenoffsetdruck» umbenennen' })
    .waitFor({ state: 'detached' });

  await page.getByRole('button', { name: /Kategorie «e – Ausführen von Druckaufträgen» löschen/ }).click();
  await page
    .getByRole('alertdialog', { name: 'Kategorie löschen?' })
    .getByRole('button', { name: 'Löschen' })
    .click();
  await page
    .getByRole('button', { name: /Kategorie «e – Ausführen von Druckaufträgen» löschen/ })
    .waitFor({ state: 'detached' });

  await page.getByLabel('Neue Kategorie').fill('Eigene Projekte');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByRole('button', { name: 'Kategorie «Eigene Projekte» umbenennen' }).waitFor();
  assert.deepEqual(await runAxe(page), []);
});

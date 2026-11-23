// E2E: Journale anlegen, bearbeiten, Status, duplizieren, archivieren, löschen (AJ-05).
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
  page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name }).click();
const live = () => page.getByTestId('statusbar-live');

test('Strg+N legt ein Journal an; Titel und Metadaten werden automatisch gespeichert', async () => {
  await page.keyboard.press('Control+N');
  const title = page.getByLabel('Titel des Journals');
  await title.waitFor();
  // Neues Journal: Cursor steht direkt im Titel
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'journal-title');
  await title.fill('Plattenwechsel an der Bogenoffset');
  await page.getByLabel('Lernort').selectOption('uek');
  await live().getByText('Gespeichert').waitFor();
  assert.equal(await page.title(), 'Plattenwechsel an der Bogenoffset – Lernjournal');
  assert.deepEqual(await runAxe(page), [], 'Dokumentansicht');

  await nav('Journale');
  const row = page.getByRole('row', { name: /Plattenwechsel an der Bogenoffset/ });
  await row.waitFor();
  assert.match(await row.textContent(), /üK/);
  assert.match(await row.textContent(), /Entwurf/);
});

test('Als abgeschlossen markieren und wieder als Entwurf', async () => {
  await page.getByRole('row', { name: /Plattenwechsel/ }).dblclick();
  await page.getByRole('button', { name: 'Als abgeschlossen markieren' }).click();
  await page.getByRole('button', { name: 'Wieder als Entwurf' }).waitFor();
  await nav('Journale');
  assert.match(await page.getByRole('row', { name: /Plattenwechsel/ }).textContent(), /Abgeschlossen/);
});

test('Duplizieren öffnet eine Kopie als Entwurf', async () => {
  await page.getByRole('row', { name: /Plattenwechsel/ }).click();
  await page
    .getByRole('toolbar', { name: 'Aktionen für ausgewähltes Journal' })
    .getByRole('button', { name: 'Duplizieren' })
    .click();
  assert.equal(
    await page.getByLabel('Titel des Journals').inputValue(),
    'Kopie von Plattenwechsel an der Bogenoffset',
  );
  await nav('Journale');
  assert.equal(await page.getByRole('row', { name: /Plattenwechsel/ }).count(), 2);
});

test('Archivieren blendet aus, Filter «Archiviert» zeigt, Wiederherstellen holt zurück', async () => {
  await page.getByRole('row', { name: /^Kopie von/ }).click();
  await page.getByRole('button', { name: 'Archivieren' }).click();
  await page.getByRole('row', { name: /^Kopie von/ }).waitFor({ state: 'detached' });
  await page.getByLabel('Anzeigen').selectOption('archived');
  await page.getByRole('row', { name: /^Kopie von/ }).click();
  await page.getByRole('button', { name: 'Wiederherstellen' }).click();
  await page.getByRole('row', { name: /^Kopie von/ }).waitFor({ state: 'detached' });
  await page.getByLabel('Anzeigen').selectOption('active');
  await page.getByRole('row', { name: /^Kopie von/ }).waitFor();
});

test('Löschen: Entf fragt nach (Fokus auf Abbrechen), Esc bricht ab, Bestätigen löscht', async () => {
  const row = page.getByRole('row', { name: /^Kopie von/ });
  await row.focus();
  await page.keyboard.press('Delete');
  const dialog = page.getByRole('alertdialog', { name: 'Journal endgültig löschen?' });
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Abbrechen');
  assert.deepEqual(await runAxe(page), [], 'Bestätigungsdialog');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await row.count(), 1);

  await row.focus();
  await page.keyboard.press('Delete');
  await dialog.getByRole('button', { name: 'Löschen' }).click();
  await row.waitFor({ state: 'detached' });
  await live().getByText('Journal gelöscht.').waitFor();
  assert.deepEqual(await runAxe(page), [], 'Journalliste');
});

test('Startseite zeigt zuletzt bearbeitete Journale; Daten überstehen einen Neustart', async () => {
  await nav('Start');
  await page
    .getByRole('region', { name: 'Zuletzt bearbeitet' })
    .getByText('Plattenwechsel an der Bogenoffset')
    .waitFor();
  await app.close();
  ({ app, page } = await launchApp({ dir }));
  await nav('Journale');
  const row = page.getByRole('row', { name: /Plattenwechsel/ });
  await row.waitFor();
  assert.equal(await row.count(), 1);
  assert.match(await row.textContent(), /Abgeschlossen/);
});

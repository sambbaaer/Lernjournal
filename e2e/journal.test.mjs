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

// Regression AJ-17: Wer direkt nach Strg+N lostippt, darf nie das vorherige
// Journal ändern – auch wenn das Anlegen dauert (langsamer Datenträger, Last).
// Der Hauptprozess antwortet hier absichtlich erst nach 1,5 s.
test('Strg+N und sofort tippen: Eingabe landet im neuen Journal, das vorherige bleibt unverändert', async () => {
  await page.getByRole('row', { name: /Plattenwechsel/ }).dblclick();
  const title = page.getByLabel('Titel des Journals');
  assert.equal(await title.inputValue(), 'Plattenwechsel an der Bogenoffset');
  await title.focus(); // Cursor im vorherigen Journal – dort darf nichts ankommen

  // journal:create verzögern (nur im Test, direkt an der Handler-Tabelle von ipcMain)
  const delay = (ms) =>
    app.evaluate(({ ipcMain }, wait) => {
      const handlers = ipcMain._invokeHandlers;
      if (!(handlers instanceof Map) || !handlers.has('journal:create'))
        throw new Error('ipcMain-Handler «journal:create» nicht gefunden');
      globalThis.__ljCreate ??= handlers.get('journal:create');
      const original = globalThis.__ljCreate;
      handlers.set(
        'journal:create',
        wait
          ? async (...args) => (await new Promise((r) => setTimeout(r, wait)), original(...args))
          : original,
      );
    }, ms);
  await delay(1500);
  try {
    await page.keyboard.press('Control+N');
    await page.keyboard.type('Rakel wechseln');
    // Das Anlegen läuft noch: Platzhalter mit dem Getippten, altes Journal ausgeblendet
    assert.equal(
      await page.getByRole('status').filter({ hasText: 'Neues Journal wird angelegt' }).count(),
      1,
    );
    await page.getByText('Neues Journal wird angelegt …').waitFor({ state: 'detached' });
    await page.keyboard.type(' an der Siebdruckmaschine'); // weitertippen im neuen Journal
  } finally {
    await delay(0);
  }
  assert.equal(await title.inputValue(), 'Rakel wechseln an der Siebdruckmaschine');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'journal-title');
  await live().getByText('Gespeichert').waitFor();

  await nav('Journale');
  await page.getByRole('row', { name: /^Rakel wechseln an der Siebdruckmaschine/ }).waitFor();
  const old = page.getByRole('row', { name: /^Plattenwechsel an der Bogenoffset/ });
  assert.equal(await old.count(), 1, 'vorheriges Journal heisst noch gleich');
  await old.dblclick();
  assert.equal(await title.inputValue(), 'Plattenwechsel an der Bogenoffset');
});

// E2E: Speichern ohne Datenverlust (AJ-08) – Schliessen, harter Absturz,
// gesperrte Datenbank mit automatischem Wiederholversuch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { launchApp, waitForNewSave } from './helpers.mjs';

const editor = (page, name) => page.getByRole('textbox', { name, exact: true });
const live = (page) => page.getByTestId('statusbar-live');

async function openJournal(page, title) {
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Journale' })
    .click();
  await page.getByRole('row', { name: new RegExp(title) }).dblclick();
  await editor(page, 'Reflexion').waitFor();
}

function exited(app) {
  return new Promise((resolve) => app.process().once('exit', resolve));
}

test('Fenster direkt nach dem Tippen schliessen: Änderungen werden noch gespeichert', async () => {
  const first = await launchApp();
  await first.page.keyboard.press('Control+N');
  await first.page.getByLabel('Titel des Journals').fill('Schliessen-Test');
  await editor(first.page, 'Reflexion').click();
  await first.page.keyboard.type('Zuletzt getippter Satz.');
  // Sofort schliessen – vor Ablauf der 800 ms Ruhephase
  const done = exited(first.app);
  await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await done;

  const second = await launchApp({ dir: first.dir });
  try {
    await openJournal(second.page, 'Schliessen-Test');
    assert.match(await editor(second.page, 'Reflexion').textContent(), /Zuletzt getippter Satz\./);
  } finally {
    await second.app.close();
  }
});

test('Harter Absturz nach «Gespeichert»: Daten intakt, verwaiste Sperre übernommen', async () => {
  const first = await launchApp();
  await first.page.keyboard.press('Control+N');
  await first.page.getByLabel('Titel des Journals').fill('Absturz-Test');
  await editor(first.page, 'Durchführung').click();
  await waitForNewSave(first.page, () => first.page.keyboard.type('Vor dem Absturz gespeichert.'));
  const done = exited(first.app);
  first.app.process().kill('SIGKILL'); // wie Stromausfall oder Task-Manager «Task beenden»
  await done;

  // Datenbank direkt prüfen
  const dbFile = path.join(first.dir, 'Dokumente', 'Lernjournal', 'journal.sqlite');
  const db = new DatabaseSync(dbFile);
  assert.deepEqual({ ...db.prepare('PRAGMA integrity_check').get() }, { integrity_check: 'ok' });
  db.close();

  const second = await launchApp({ dir: first.dir });
  try {
    await openJournal(second.page, 'Absturz-Test');
    assert.match(await editor(second.page, 'Durchführung').textContent(), /Vor dem Absturz gespeichert\./);
  } finally {
    await second.app.close();
  }
});

test('Gesperrte Datenbank: «Speichern fehlgeschlagen», Wiederholversuch speichert ohne Verlust', async () => {
  const { app, page, dir } = await launchApp();
  try {
    await page.keyboard.press('Control+N');
    await page.getByLabel('Titel des Journals').fill('Sperre-Test');
    await live(page).getByText('Gespeichert').waitFor();

    // Fremder Prozess sperrt die Datenbank für Schreibzugriffe (z. B. Backup-Software)
    const blocker = new DatabaseSync(path.join(dir, 'Dokumente', 'Lernjournal', 'journal.sqlite'));
    blocker.exec('PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE');
    await editor(page, 'Reflexion').click();
    await page.keyboard.type('Text während der Sperre.');
    await live(page).getByText('Speichern fehlgeschlagen').waitFor({ timeout: 20000 });
    assert.doesNotMatch(await live(page).textContent(), /Gespeichert/);

    // Sperre aufheben → «Erneut versuchen» speichert
    blocker.exec('ROLLBACK');
    blocker.close();
    await live(page).getByRole('button', { name: 'Erneut versuchen' }).click();
    await live(page).getByText('Gespeichert').waitFor({ timeout: 15000 });
  } finally {
    await app.close();
  }
  const again = await launchApp({ dir });
  try {
    await openJournal(again.page, 'Sperre-Test');
    assert.match(await editor(again.page, 'Reflexion').textContent(), /Text während der Sperre\./);
  } finally {
    await again.app.close();
  }
});

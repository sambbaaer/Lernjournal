// E2E: Sicherungen und Wiederherstellung (AJ-15) – Einstellungen → «Jetzt
// sichern», Liste, Dialog «Sicherung wiederherstellen» mit Vorschau und
// «Aktuelles Lernjournal ersetzen» (Sicherheitskopie vorher), Sicherung beim
// Beenden, Infoleiste «Kopie ausserhalb des Computers» nach 30 Tagen mit
// «Später erinnern»; Tastatur und Barrierefreiheit (axe).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { launchApp, runAxe, waitForNewSave } from './helpers.mjs';

let app;
let page;
let dir;
let projectDir;
const nav = (name) =>
  page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name, exact: true });
const rows = () => page.getByTestId('backup-row');
const dialog = () => page.getByRole('dialog', { name: 'Sicherung wiederherstellen' });
const bar = () => page.getByRole('region', { name: 'Erinnerung: Kopie ausserhalb des Computers' });
const backupZips = () => readdirSync(path.join(projectDir, 'backups')).filter((f) => f.endsWith('.zip'));

async function newJournal(name) {
  await page.keyboard.press('Control+N');
  await page.waitForFunction(() => document.querySelector('#journal-title')?.value === '');
  await waitForNewSave(page, () => page.getByLabel('Titel des Journals').fill(name));
}

async function journalTitles() {
  await nav('Journale').click();
  await page.getByRole('heading', { name: 'Journale', level: 1 }).waitFor();
  return page.evaluate(() => document.querySelector('main')?.textContent ?? '');
}

before(async () => {
  ({ app, page, dir } = await launchApp());
  await newJournal('Erster Stand');
});

after(async () => {
  await app?.close().catch(() => {});
});

test('«Gespeichert» öffnet die Sicherungsliste. «Jetzt sichern» legt einen Stand an', async () => {
  const status = page.getByRole('button', { name: 'Gespeichert', exact: true });
  await status.focus();
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { name: 'Sicherungen', level: 2 });
  await heading.waitFor();
  assert.equal(await heading.evaluate((el) => el === document.activeElement), true);
  projectDir = (await page.getByTestId('project-path').textContent()).trim();
  await page.getByText('Noch keine Sicherung.').waitFor();
  await page.getByRole('button', { name: 'Jetzt sichern' }).click();
  await rows().first().waitFor();
  assert.equal(await rows().count(), 1);
  assert.match(await rows().first().textContent(), /Von Hand.*1 Journal · 0 Bilder/);
  assert.equal(backupZips().length, 1);
  await page.getByRole('button', { name: 'Jetzt sichern' }).click();
  await page.getByText(/Keine Änderungen seit der Sicherung vom/).waitFor();
  assert.equal(await rows().count(), 1);
  assert.deepEqual(await runAxe(page), []);
});

test('Wiederherstellen durch Ersetzen: Vorschau, Sicherheitskopie, alter Stand', async () => {
  await newJournal('Zweiter Stand');
  await page.getByRole('button', { name: 'Gespeichert', exact: true }).click();
  await rows().first().waitFor();
  await page.getByRole('button', { name: /^Sicherung vom .* wiederherstellen$/ }).click();
  await dialog().getByRole('heading', { name: 'Sicherung wiederherstellen' }).waitFor();
  // Vorschau nach vollständiger Prüfung
  await dialog().getByText('In Ordnung – alle Prüfsummen stimmen.').waitFor();
  assert.equal(
    await dialog().getByTestId('restore-content').textContent(),
    '1 Journal (jetzt: 2) · 0 Bilder',
  );
  await dialog().getByText('«Erster Stand»').waitFor();
  // Empfohlen ist «als neues Lernjournal»; Fokus liegt auf «Wiederherstellen»
  assert.equal(
    await dialog()
      .getByRole('radio', { name: /Als neues Lernjournal/ })
      .isChecked(),
    true,
  );
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Wiederherstellen');
  assert.deepEqual(await runAxe(page), []);
  // Esc schliesst ohne Änderung
  await page.keyboard.press('Escape');
  await dialog().waitFor({ state: 'detached' });

  await page.getByRole('button', { name: /^Sicherung vom .* wiederherstellen$/ }).click();
  await dialog().getByText('In Ordnung – alle Prüfsummen stimmen.').waitFor();
  await dialog()
    .getByRole('radio', { name: /Aktuelles Lernjournal durch diese Sicherung ersetzen/ })
    .check();
  await dialog().getByRole('button', { name: 'Wiederherstellen' }).click();
  await dialog()
    .getByText(/ist auf den Stand vom .* zurückgesetzt/)
    .waitFor({ timeout: 30000 });
  assert.match(await dialog().textContent(), /Der vorherige Stand ist als Sicherung vom .* gespeichert/);
  await dialog().getByRole('button', { name: 'Schliessen' }).click();

  const text = await journalTitles();
  assert.match(text, /Erster Stand/);
  assert.doesNotMatch(text, /Zweiter Stand/);
  // Liste: Sicherheitskopie zuoberst
  await nav('Einstellungen').click();
  await rows().nth(1).waitFor();
  assert.match(await rows().first().textContent(), /Vor einer Wiederherstellung.*2 Journale/);
  assert.equal(backupZips().length, 2);
});

test('Sicherung beim Beenden; Erinnerung nach 30 Tagen mit «Später erinnern»', async () => {
  await newJournal('Dritter Stand');
  const before = backupZips().length;
  await app.close();
  assert.equal(backupZips().length, before + 1, 'Sicherung beim Beenden');

  // Projekt «vor 40 Tagen» angelegt und nie übergeben
  const db = new DatabaseSync(path.join(projectDir, 'journal.sqlite'));
  db.prepare('UPDATE project SET created_at = ?').run(new Date(Date.now() - 40 * 86400000).toISOString());
  db.close();

  ({ app, page } = await launchApp({ dir }));
  await bar()
    .getByText(/noch keine Kopie ausserhalb des Computers/)
    .waitFor();
  assert.deepEqual(await runAxe(page), []);
  await bar().getByRole('button', { name: 'Später erinnern' }).click();
  await bar().waitFor({ state: 'detached' });
  await page.getByText(/Erinnerung ausgeblendet bis/).waitFor();
  await app.close();

  ({ app, page } = await launchApp({ dir }));
  await nav('Start').waitFor();
  await page.waitForTimeout(500);
  assert.equal(await bar().count(), 0, 'bleibt ausgeblendet');
  // Die Übergabe selbst ist in e2e/archive.test.mjs geprüft; hier nur der Weg dorthin
  await nav('Einstellungen').click();
  assert.match(await page.getByTestId('last-export').textContent(), /noch nie/);
  await page.getByRole('button', { name: 'Projekt übergeben …' }).click();
  await page.getByRole('dialog', { name: 'Projekt übergeben (.ajournal)' }).waitFor();
});

// E2E: Projektübergabe .ajournal (AJ-14) – «Projekt übergeben» im Menüband,
// Inhalt der Datei, dann Import auf einem «zweiten Computer» (neue App mit
// leeren Benutzerdaten, Startbildschirm), Vorschau, Zielordner, geöffnetes
// Projekt mit Journal und Bild; manipulierte Datei wird abgelehnt; Tastatur
// und Barrierefreiheit.
//
// Die nativen Dialoge ersetzen wir im Hauptprozess durch Attrappen
// (dialog.showSaveDialog/showOpenDialog, shell.showItemInFolder) – der
// restliche Ablauf ist echt.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { launchApp, runAxe, waitForNewSave } from './helpers.mjs';

let app;
let page;
let dir;
let archive;
const fixture = (n) => path.resolve('e2e/fixtures', n);
const editor = (name) => page.getByRole('textbox', { name, exact: true });
const exportDialog = () => page.getByRole('dialog', { name: 'Projekt übergeben (.ajournal)' });
const importDialog = () => page.getByRole('dialog', { name: 'Projekt importieren (.ajournal)' });

// Antworten der nativen Dialoge festlegen (null = abgebrochen)
async function answerDialogs({ save = null, open = [] } = {}) {
  await app.evaluate(
    ({ dialog, shell }, { save, open }) => {
      globalThis.__dialogs = [];
      globalThis.__shown = [];
      const answers = [...open];
      dialog.showSaveDialog = async (...args) => {
        globalThis.__dialogs.push(args.length > 1 ? args[1] : args[0]);
        return save ? { canceled: false, filePath: save } : { canceled: true, filePath: '' };
      };
      dialog.showOpenDialog = async (...args) => {
        globalThis.__dialogs.push(args.length > 1 ? args[1] : args[0]);
        const next = answers.shift();
        return next ? { canceled: false, filePaths: [next] } : { canceled: true, filePaths: [] };
      };
      shell.showItemInFolder = (f) => globalThis.__shown.push(f);
    },
    { save, open },
  );
}

before(async () => {
  ({ app, page, dir } = await launchApp());
  await page.keyboard.press('Control+N');
  await page.waitForFunction(() => document.querySelector('#journal-title')?.value === '');
  await page.getByLabel('Titel des Journals').fill('Farbmessung am Druckbogen');
  await editor('Durchführung').click();
  await page.keyboard.type('Volltondichte gemessen.');
  await page.getByRole('tab', { name: 'Einfügen', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('tabpanel').getByRole('button', { name: 'Bild' }).click();
  await (await chooser).setFiles(fixture('screenshot.png'));
  await waitForNewSave(page, async () => {
    await page.getByLabel('Bildlegende').fill('Kontrollstreifen');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Danach geprüft.');
  });
});
after(async () => {
  await app?.close();
});

test('Projekt übergeben: Menüband → Hinweis → Speichern → geprüfte Datei mit Manifest', async () => {
  archive = path.join(dir, 'Umzug.ajournal');
  await answerDialogs({ save: archive });
  await page.getByRole('tab', { name: 'Exportieren', exact: true }).click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Projekt übergeben (.ajournal)' }).click();
  await exportDialog().waitFor();
  await exportDialog().getByText('USB-Stick').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Speichern unter …');
  assert.deepEqual(await runAxe(page), []);

  // Eben Getipptes muss in der Datei stehen → Dialog speichert vorher
  await page.keyboard.press('Enter');
  await exportDialog().getByText('Gespeichert als').waitFor({ timeout: 30000 });
  await exportDialog().getByText('1 Journal · 1 Bild').waitFor();
  assert.deepEqual(await runAxe(page), []);
  const [options] = await app.evaluate(() => globalThis.__dialogs);
  assert.match(options.defaultPath, /Dokumente[\\/]\d{4}-\d{2}-\d{2} .+\.ajournal$/);
  assert.ok(options.properties.includes('showOverwriteConfirmation'));

  const zip = unzipSync(new Uint8Array(readFileSync(archive)));
  const manifest = JSON.parse(strFromU8(zip['manifest.json']));
  assert.equal(manifest.format, 'lernjournal-projekt');
  assert.equal(manifest.formatVersion, 1);
  assert.deepEqual(manifest.counts, { journals: 1, media: 1 });
  assert.deepEqual(
    manifest.files.map((f) => f.path.replace(/[0-9a-f-]{36}/, 'ID')),
    ['journal.sqlite', 'media/ID.png'],
  );

  await exportDialog().getByRole('button', { name: 'Im Ordner anzeigen' }).click();
  assert.deepEqual(await app.evaluate(() => globalThis.__shown), [archive]);
  await page.keyboard.press('Escape');
  await exportDialog().waitFor({ state: 'detached' });
});

test('Import auf einem zweiten Computer: Startbildschirm → Vorschau → neues Projekt mit Journal und Bild', async () => {
  // «Zweiter Computer»: neue App mit leeren Benutzerdaten und eigenem «Dokumente»
  await app.close();
  ({ app, page, dir } = await launchApp({ withProject: false }));
  await page.getByRole('button', { name: /Projekt importieren \(\.ajournal\)/ }).click();
  await importDialog().waitFor();
  assert.deepEqual(await runAxe(page), []);

  // Abbrechen im Öffnen-Dialog: zurück zum Hinweis, nichts passiert
  await answerDialogs({ open: [] });
  await importDialog().getByRole('button', { name: 'Datei wählen …' }).click();
  await importDialog().getByRole('button', { name: 'Datei wählen …' }).waitFor();

  await answerDialogs({ open: [archive] });
  await page.keyboard.press('Enter');
  await importDialog().getByText('1 Journal · 1 Bild').waitFor({ timeout: 30000 });
  const target = await importDialog().getByTestId('archive-target').textContent();
  assert.ok(target.startsWith(path.join(dir, 'Dokumente')), target);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Importieren');
  assert.deepEqual(await runAxe(page), []);

  await page.keyboard.press('Enter');
  await importDialog().getByText('ist importiert und geöffnet').waitFor({ timeout: 30000 });
  assert.deepEqual(await runAxe(page), []);
  await importDialog().getByRole('button', { name: 'Schliessen' }).click();
  await importDialog().waitFor({ state: 'detached' });
  assert.ok(existsSync(path.join(target, 'journal.sqlite')));

  // Projekt ist offen: Journal in der Liste, Text und Bild da
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Journale', exact: true })
    .click();
  await page.getByRole('row', { name: /Farbmessung am Druckbogen/ }).dblclick();
  await editor('Durchführung').getByText('Danach geprüft.').waitFor();
  await page.waitForFunction(() => {
    const img = document.querySelector('figure img');
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth === 800;
  });
  assert.equal(await page.getByLabel('Bildlegende').inputValue(), 'Kontrollstreifen');
});

test('Manipulierte Datei: verständliche Meldung, geöffnetes Projekt bleibt', async () => {
  const zip = unzipSync(new Uint8Array(readFileSync(archive)));
  zip['../../ausserhalb.txt'] = strToU8('böse');
  const bad = path.join(dir, 'manipuliert.ajournal');
  writeFileSync(bad, zipSync(zip));
  await answerDialogs({ open: [bad] });

  await page.keyboard.press('Alt+D');
  await page.getByRole('dialog', { name: 'Datei' }).getByRole('button', { name: 'Importieren' }).click();
  await page.getByRole('button', { name: 'Projekt importieren (.ajournal) …' }).click();
  await importDialog().getByRole('button', { name: 'Datei wählen …' }).click();
  await importDialog().getByRole('alert').getByText('unsicheren Pfad').waitFor({ timeout: 30000 });
  assert.deepEqual(await runAxe(page), []);
  await page.keyboard.press('Escape');
  await importDialog().waitFor({ state: 'detached' });
  assert.equal(existsSync(path.join(dir, '..', 'ausserhalb.txt')), false);
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Journale', exact: true })
    .click();
  await page.getByRole('row', { name: /Farbmessung am Druckbogen/ }).waitFor();
});

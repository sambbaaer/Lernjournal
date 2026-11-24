// E2E: Word-Export eines Journals (AJ-12) – Hinweis R-10, Speichern-Dialog,
// echte WebP→PNG-Umwandlung, Inhalt der Datei, «Im Ordner anzeigen», Abbrechen,
// Tastatur und Barrierefreiheit.
//
// Den nativen Windows-Dialog kann Playwright nicht bedienen. Darum ersetzen wir
// im Hauptprozess dialog.showSaveDialog (und shell.showItemInFolder) durch
// Attrappen – der restliche Ablauf ist echt.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { launchApp, runAxe } from './helpers.mjs';

let app;
let page;
let dir;
const fixture = (n) => path.resolve('e2e/fixtures', n);
const editor = (name) => page.getByRole('textbox', { name, exact: true });
const dialog = () => page.getByRole('dialog', { name: 'Als Word exportieren' });

// Antwort des «Speichern unter»-Dialogs festlegen (null = abgebrochen)
async function answerSaveDialog(file) {
  await app.evaluate(({ dialog, shell }, file) => {
    globalThis.__savedDialogs = [];
    globalThis.__shown = [];
    dialog.showSaveDialog = async (...args) => {
      const options = args.length > 1 ? args[1] : args[0];
      globalThis.__savedDialogs.push(options);
      return file ? { canceled: false, filePath: file } : { canceled: true, filePath: '' };
    };
    shell.showItemInFolder = (f) => globalThis.__shown.push(f);
  }, file);
}

before(async () => {
  ({ app, page, dir } = await launchApp());
  await page.keyboard.press('Control+N');
  await page.getByLabel('Titel des Journals').fill('Farbmessung am Druckbogen');
  await editor('Durchführung').click();
  await page.keyboard.type('Volltondichte gemessen und eingeregelt.');
  // WebP-Bild über den Dateidialog: muss im DOCX als PNG ankommen
  await page.getByRole('tab', { name: 'Einfügen', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('tabpanel').getByRole('button', { name: 'Bild' }).click();
  await (await chooser).setFiles(fixture('bild.webp'));
  await page.getByLabel('Bildlegende').fill('Kontrollstreifen');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Danach geprüft.');
});
after(async () => {
  await app?.close();
});

test('Menüband «Exportieren»: Hinweis R-10, Speichern, Inhalt der Word-Datei', async () => {
  const target = path.join(dir, 'Bericht.docx');
  await answerSaveDialog(target);
  await page.getByRole('tab', { name: 'Exportieren', exact: true }).click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Dieses Journal als Word' }).click();

  // Hinweis vor dem Weitergeben, Fokus auf «Verstanden, weiter …»
  await dialog().waitFor();
  for (const text of [
    'Geschäftsgeheimnisse',
    'Kundendaten',
    'Personen auf Bildern',
    'nicht in Lernjournal zurück',
  ])
    await dialog().getByText(text).first().waitFor();
  assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ''), /Verstanden, weiter/);
  assert.deepEqual(await runAxe(page), []);

  // Eben getippter Text muss im Dokument stehen → Export speichert vorher
  await page.keyboard.press('Enter');
  await dialog().getByText('Gespeichert als').waitFor({ timeout: 30000 });
  await dialog().getByText('Bericht.docx').waitFor();
  assert.deepEqual(await runAxe(page), []);

  // Vorschlag im Speichern-Dialog: Ordner «exports» des Projekts, Datum + Titel
  const [options] = await app.evaluate(() => globalThis.__savedDialogs);
  assert.match(options.defaultPath, /exports[\\/]\d{4}-\d{2}-\d{2} Farbmessung am Druckbogen\.docx$/);
  assert.ok(options.properties.includes('showOverwriteConfirmation'));

  // Datei: echtes DOCX mit Titel, Text, Bild als PNG und nummerierter Legende
  assert.ok(existsSync(target));
  const zip = unzipSync(new Uint8Array(readFileSync(target)));
  const xml = strFromU8(zip['word/document.xml']);
  assert.match(xml, /Farbmessung am Druckbogen/);
  assert.match(xml, /Volltondichte gemessen und eingeregelt\./);
  assert.match(xml, /Danach geprüft\./);
  assert.match(xml, /Lea Muster/);
  assert.match(xml, /SEQ Abbildung/);
  assert.match(xml, /: Kontrollstreifen/);
  const media = Object.keys(zip).filter((n) => n.startsWith('word/media/'));
  assert.equal(media.length, 1);
  assert.match(media[0], /\.png$/);
  // Echte PNG-Signatur, also wirklich umgewandelt (nicht nur umbenannt)
  assert.deepEqual([...zip[media[0]].subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

  // «Im Ordner anzeigen» zeigt genau diese Datei
  await dialog().getByRole('button', { name: 'Im Ordner anzeigen' }).click();
  assert.deepEqual(await app.evaluate(() => globalThis.__shown), [target]);
  // Esc schliesst; der Fokus kehrt dorthin zurück, wo er vorher war – Klicks
  // ins Menüband lassen ihn absichtlich im Editor (Dokumentbereich)
  await page.keyboard.press('Escape');
  await dialog().waitFor({ state: 'detached' });
  assert.equal(
    await page.evaluate(() => document.activeElement?.closest('[data-region]')?.getAttribute('data-region')),
    'document',
  );
});

test('Abbrechen: im Hinweis oder im Speichern-Dialog – keine Datei, kein Fehler', async () => {
  await answerSaveDialog(null);
  const button = page.getByRole('tabpanel').getByRole('button', { name: 'Dieses Journal als Word' });
  await button.click();
  await dialog().getByRole('button', { name: 'Abbrechen' }).click();
  await dialog().waitFor({ state: 'detached' });
  assert.deepEqual(await app.evaluate(() => globalThis.__savedDialogs), []);

  await button.click();
  await dialog()
    .getByRole('button', { name: /Verstanden, weiter/ })
    .click();
  await dialog().waitFor({ state: 'detached' });
  assert.equal((await app.evaluate(() => globalThis.__savedDialogs)).length, 1);
});

test('Ansicht «Export»: Journal auswählen und exportieren', async () => {
  const target = path.join(dir, 'Auswahl.docx');
  await answerSaveDialog(target);
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Export' })
    .click();
  assert.deepEqual(await runAxe(page), []);
  await page.getByRole('button', { name: 'Journal wählen und exportieren …' }).click();
  await page.getByRole('dialog', { name: 'Journal als Word exportieren' }).waitFor();
  await page.keyboard.type('Farbmess');
  await page.keyboard.press('Enter');
  await dialog()
    .getByRole('button', { name: /Verstanden, weiter/ })
    .click();
  await dialog().getByText('Auswahl.docx').waitFor({ timeout: 30000 });
  assert.ok(existsSync(target));
  await dialog().getByRole('button', { name: 'Schliessen' }).click();
});

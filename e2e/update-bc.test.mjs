// E2E Paket B und C: Hinweisbox (AJ-28), Checkliste (AJ-29), Rechenblock
// (AJ-31), Querverweise «[[…]]» (AJ-27), Merkstellen (AJ-33) und
// Bild-Schnellbeschriftung (AJ-32) – bedienen, speichern, nach dem Öffnen da.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launchApp, openJournalDetails, runAxe, waitForNewSave } from './helpers.mjs';

let app;
let page;
let dir;

const fixture = (name) => path.resolve('e2e/fixtures', name);
const nav = (name) =>
  page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name, exact: true });
const ribbon = () => page.getByRole('banner', { name: 'Menüband' });
const tab = (name) => page.getByRole('tab', { name, exact: true });
const editor = (name) => page.getByRole('textbox', { name, exact: true });
const button = (name) => ribbon().getByRole('button', { name, exact: true });
// Befehl aus dem Aufklapp-Menü «Bausteine» im Register «Einfügen»
async function block(name) {
  await button('Bausteine').click();
  const menu = page.getByRole('menu', { name: 'Bausteine' });
  await menu
    .getByRole('menuitem', { name, exact: true })
    .or(menu.getByRole('menuitemcheckbox', { name, exact: true }))
    .click();
  await menu.waitFor({ state: 'detached' });
}
async function blockChecked(name) {
  await button('Bausteine').click();
  const menu = page.getByRole('menu', { name: 'Bausteine' });
  const checked = await menu
    .getByRole('menuitemcheckbox', { name, exact: true })
    .getAttribute('aria-checked');
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
  return checked;
}

async function newJournal(title) {
  await page.keyboard.press('Control+N');
  await page.waitForFunction(() => document.querySelector('#journal-title')?.value === '');
  await waitForNewSave(page, () => page.getByLabel('Titel des Journals').fill(title));
}

async function reopen(title) {
  await nav('Journale').click();
  await page.getByRole('row', { name: new RegExp(title) }).dblclick();
  await page.waitForFunction((t) => document.querySelector('#journal-title')?.value === t, title);
}

before(async () => {
  ({ app, page, dir } = await launchApp());
  // Zieljournal mit Schlagwort «Rakel» für die Querverweise
  await newJournal('Siebdruck Rakelwinkel');
  await openJournalDetails(page);
  await page.getByRole('article', { name: 'Journal' }).getByLabel('Schlagwörter', { exact: true }).click();
  await waitForNewSave(page, async () => {
    await page.keyboard.type('Rakel');
    await page.keyboard.press('Enter');
  });
  await newJournal('Bausteine im Druckbetrieb');
});

after(async () => {
  await app?.close();
});

test('Hinweisbox «Merke» und Umschalten auf «Achtung»', async () => {
  await editor('Durchführung').click();
  await page.keyboard.type('Immer zuerst die Feuchtung prüfen.');
  await tab('Einfügen').click();
  await waitForNewSave(page, () => block('Merke'));
  const box = editor('Durchführung').locator('aside[data-callout]');
  assert.equal(await box.getAttribute('data-callout'), 'merke');
  assert.equal(await blockChecked('Merke'), 'true');
  await editor('Durchführung').click();
  await waitForNewSave(page, () => block('Achtung'));
  assert.equal(await box.getAttribute('data-callout'), 'achtung');
  assert.equal(await box.getAttribute('role'), 'note');
});

test('Checkliste: Punkte abhaken', async () => {
  await editor('Reflexion').click();
  await tab('Einfügen').click();
  await block('Checkliste');
  await page.keyboard.type('Farbkasten gefüllt');
  await page.keyboard.press('Enter');
  await waitForNewSave(page, () => page.keyboard.type('Bogenlauf kontrolliert'));
  const boxes = editor('Reflexion').locator('ul[data-type="taskList"] input[type="checkbox"]');
  assert.equal(await boxes.count(), 2);
  await waitForNewSave(page, () => boxes.first().check());
});

test('Rechenblock: Enter springt von Zeile zu Zeile', async () => {
  await editor('Auftrag / Ausgangslage').click();
  await tab('Einfügen').click();
  await block('Rechenblock');
  await page.keyboard.type('70 × 100 cm, 115 g/m²');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Fläche × Grammatur');
  await page.keyboard.press('Enter');
  await page.keyboard.type('0,7 m² × 115 g/m²');
  await page.keyboard.press('Enter');
  await waitForNewSave(page, () => page.keyboard.type('80,5 g'));
  const lines = editor('Auftrag / Ausgangslage').locator('.lj-calc-line');
  assert.deepEqual(
    (await lines.allTextContents()).map((t) => t.trim()),
    [
      'Gegeben70 × 100 cm, 115 g/m²',
      'FormelFläche × Grammatur',
      'Rechnung0,7 m² × 115 g/m²',
      'Ergebnis80,5 g',
    ],
  );
  // Enter in «Ergebnis» führt unter den Block
  await page.keyboard.press('Enter');
  await waitForNewSave(page, () => page.keyboard.type('Danach normaler Text.'));
  await editor('Auftrag / Ausgangslage').locator('p', { hasText: 'Danach normaler Text.' }).waitFor();
});

test('Querverweis: «[[» öffnet die Auswahl, Schlagwort wird zum Link ins Fachbuch', async () => {
  await editor('Auftrag / Ausgangslage').click();
  await page.keyboard.press('Control+End');
  await page.waitForFunction(() => document.activeElement?.classList.contains('lj-editor'));
  await page.keyboard.type(' Siehe ');
  await page.keyboard.type('[[');
  const dialog = page.getByRole('dialog', { name: 'Querverweis einfügen' });
  await dialog.waitFor();
  // Esc gibt die Klammern zurück
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await editor('Auftrag / Ausgangslage')
    .getByText(/Siehe \[\[/)
    .waitFor();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('[[');
  await dialog.waitFor();
  await dialog.getByRole('combobox').fill('rak');
  await dialog.getByRole('option', { name: /Rakel.*Themenansicht/ }).waitFor();
  assert.deepEqual(await runAxe(page), []);
  await waitForNewSave(page, () => dialog.getByRole('option', { name: /Rakel.*Themenansicht/ }).click());
  const link = editor('Auftrag / Ausgangslage').locator('a[href^="lernjournal://tag/"]');
  assert.equal((await link.textContent()).trim(), 'Rakel');
  // Getipptes [[Titel]] wird bei genauem Treffer direkt zum Journal-Link
  await page.keyboard.type('und ');
  await page.keyboard.type('[[');
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await editor('Auftrag / Ausgangslage')
    .getByText(/und \[\[/)
    .waitFor();
  await page.waitForFunction(() => document.activeElement?.classList.contains('lj-editor'));
  await waitForNewSave(page, () => page.keyboard.type('Siebdruck Rakelwinkel]]'));
  await editor('Auftrag / Ausgangslage')
    .locator('a[href^="lernjournal://journal/"]', { hasText: 'Siebdruck Rakelwinkel' })
    .waitFor();
  // Strg+Klick auf den Schlagwort-Link öffnet die Themenansicht im Fachbuch
  await link.click({ modifiers: ['Control'] });
  await page.getByRole('heading', { level: 2, name: 'Schlagwort «Rakel»' }).waitFor();
});

test('Merkstelle: markieren, im Fachbuch finden, zurück ins Journal', async () => {
  await reopen('Bausteine im Druckbetrieb');
  // Wort «Feuchtung» markieren (Auswahl im DOM; der Editor übernimmt sie)
  await editor('Durchführung').click();
  await page.evaluate(() => {
    const box = document.querySelector('[aria-label="Durchführung"]');
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && !node.textContent.includes('Feuchtung'));
    const start = node.textContent.indexOf('Feuchtung');
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 'Feuchtung'.length);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.waitForFunction(() => window.getSelection()?.toString() === 'Feuchtung');
  await tab('Einfügen').click();
  await button('Merkstelle').click();
  const dialog = page.getByRole('dialog', { name: 'Als Merkstelle ins Fachbuch' });
  await dialog.getByLabel('Fachbegriff').fill('Feuchtwerk einstellen');
  await waitForNewSave(page, () => dialog.getByRole('button', { name: 'Übernehmen' }).click());
  await editor('Durchführung').locator('.lj-merkstelle').waitFor();

  await nav('Fachbuch').click();
  await page.getByRole('button', { name: /^Merkstellen/ }).click();
  const entry = page.getByText('Feuchtwerk einstellen', { exact: true });
  await entry.waitFor();
  assert.deepEqual(await runAxe(page), []);
  await page.getByRole('button', { name: /Im Journal «Bausteine im Druckbetrieb»/ }).click();
  await page.waitForFunction(
    () => document.querySelector('#journal-title')?.value === 'Bausteine im Druckbetrieb',
  );
  // Die Merkstelle ist im Editor ausgewählt
  await page.waitForFunction(() => window.getSelection()?.toString() === 'Feuchtung');
});

test('Bild beschriften: Pfeil und Nummer, gespeichert und nach dem Öffnen sichtbar', async () => {
  await editor('Reflexion').click();
  await page.keyboard.press('Control+End');
  await tab('Einfügen').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('tabpanel').getByRole('button', { name: 'Bild', exact: true }).click();
  await (await chooser).setFiles(fixture('screenshot.png'));
  await page.getByLabel('Bildlegende').fill('Druckwerk mit Markierung');
  await page.getByRole('button', { name: 'Bild beschriften …' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bild beschriften' });
  await dialog.waitFor();
  // Mit der Maus einen Kreis ziehen
  await dialog.getByRole('radio', { name: 'Kreis' }).click();
  const img = dialog.locator('img');
  await page.waitForFunction(() => document.querySelector('[role="dialog"] img')?.complete);
  const box = await img.boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();
  await dialog.getByRole('list', { name: 'Beschriftungen' }).getByText('Kreis · Rot').waitFor();
  await dialog.getByRole('button', { name: 'Kreis löschen' }).click();
  await dialog.getByRole('radio', { name: 'Pfeil' }).click();
  await dialog.getByRole('button', { name: 'In der Mitte hinzufügen' }).click(); // Pfeil
  await dialog.getByRole('radio', { name: 'Nummer' }).click();
  await dialog.getByRole('button', { name: 'In der Mitte hinzufügen' }).click();
  const list = dialog.getByRole('list', { name: 'Beschriftungen' });
  assert.deepEqual(
    (await list.getByRole('button', { pressed: undefined }).allTextContents())
      .filter(Boolean)
      .map((t) => t.trim()),
    ['Pfeil · Rot', 'Nummer 1 · Rot'],
  );
  // Mit der Tastatur verschieben
  await list.getByRole('button', { name: /Nummer 1/ }).focus();
  await page.keyboard.press('Shift+ArrowRight');
  assert.deepEqual(await runAxe(page), []);
  await waitForNewSave(page, () => dialog.getByRole('button', { name: 'Übernehmen' }).click());
  await page.getByRole('button', { name: 'Beschriftung bearbeiten (2)' }).waitFor();

  await reopen('Bausteine im Druckbetrieb');
  await page.locator('.lj-figure .lj-annotated svg polygon').waitFor();
  await page.locator('.lj-figure .lj-annotated svg text', { hasText: '1' }).waitFor();
  // Die Beschriftung liegt deckungsgleich über dem Foto (nicht darunter im Textfluss)
  await page.waitForFunction(() => document.querySelector('.lj-figure img')?.complete);
  const [imgBox, svgBox] = await page.evaluate(() => {
    const f = document.querySelector('.lj-figure .lj-annotated');
    const r = (e) => {
      const b = e.getBoundingClientRect();
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    };
    return [r(f.querySelector('img')), r(f.querySelector('svg'))];
  });
  assert.deepEqual(svgBox, imgBox);
  // Alle Bausteine überstehen das erneute Öffnen
  await editor('Durchführung').locator('aside[data-callout="achtung"]').waitFor();
  assert.equal(await editor('Reflexion').locator('input[type="checkbox"]').first().isChecked(), true);
  await editor('Auftrag / Ausgangslage')
    .locator('.lj-calc-line[data-role="result"]', { hasText: '80,5 g' })
    .waitFor();
  assert.deepEqual(await runAxe(page), []);
});

test('Word-Export: Foto und Beschriftung als ein Bild, Bausteine im Dokument', async () => {
  const { readFileSync } = await import('node:fs');
  const { strFromU8, unzipSync } = await import('fflate');
  const target = path.join(dir, 'Bausteine.docx');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, target);
  await tab('Exportieren').click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Dieses Journal als Word' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Als Word exportieren' });
  await exportDialog.waitFor();
  await page.keyboard.press('Enter');
  await exportDialog.getByText('Gespeichert als').waitFor({ timeout: 30000 });
  const zip = unzipSync(new Uint8Array(readFileSync(target)));
  const xml = strFromU8(zip['word/document.xml']);
  for (const text of ['Achtung', 'Ergebnis', '80,5 g', '☑', 'Feuchtung', 'Rakel'])
    assert.ok(xml.includes(text), text);
  assert.ok(!xml.includes('lernjournal://'));
  // Das eingebettete Bild ist das zusammengerechnete (anders als das Original)
  const media = Object.keys(zip).filter((n) => n.startsWith('word/media/'));
  assert.equal(media.length, 1);
  // Gespeichertes Foto im Projektordner (media/…png) – das exportierte Bild muss sich unterscheiden
  const { readdirSync } = await import('node:fs');
  const stored = readdirSync(dir, { recursive: true }).find((f) =>
    /[\\/]media[\\/][^\\/]+\.png$/.test(String(f)),
  );
  assert.ok(stored, 'Foto im Projektordner');
  assert.notDeepEqual(Buffer.from(zip[media[0]]), readFileSync(path.join(dir, String(stored))));
  assert.deepEqual([...zip[media[0]].subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  await exportDialog.getByRole('button', { name: 'Schliessen' }).click();
});

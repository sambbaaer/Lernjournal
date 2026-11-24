// E2E: Sammel-DOCX (AJ-13) – mehrere Journale auswählen (Filter nach
// Zeitraum), Reihenfolge per Tastatur ändern, Hinweis R-10 und Hinweis zum
// Inhaltsverzeichnis, Inhalt der Word-Datei (Titelseite, TOC-Feld,
// Seitenumbruch je Journal, interner Sprung), Barrierefreiheit.
//
// Wie in export.test.mjs wird nur der native Speichern-Dialog im Hauptprozess
// durch eine Attrappe ersetzt; der restliche Ablauf ist echt.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { launchApp, openJournalDetails, runAxe, waitForNewSave } from './helpers.mjs';

let app;
let page;
let dir;
const nav = (name) =>
  page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name, exact: true });
const tab = (name) => page.getByRole('tab', { name, exact: true });
const editor = (name) => page.getByRole('textbox', { name, exact: true });
const saved = () => page.getByTestId('statusbar-live').getByText('Gespeichert').waitFor();
const panel = () => page.getByRole('region', { name: 'Mehrere Journale in einem Dokument' });
const orderList = () => page.getByRole('list', { name: 'Reihenfolge im Dokument' });
const dialog = () => page.getByRole('dialog', { name: 'Mehrere Journale als Word exportieren' });
const orderTitles = async () =>
  (await orderList().getByRole('listitem').allTextContents()).map((t) =>
    t.replace(/^\d+\.|\d{2}\.\d{2}\.\d{4}.*$/g, ''),
  );

async function answerSaveDialog(file) {
  await app.evaluate(({ dialog }, file) => {
    globalThis.__savedDialogs = [];
    dialog.showSaveDialog = async (...args) => {
      globalThis.__savedDialogs.push(args.length > 1 ? args[1] : args[0]);
      return file ? { canceled: false, filePath: file } : { canceled: true, filePath: '' };
    };
  }, file);
}

// Neues Journal mit Titel und Arbeitsdatum. Erst tippen, wenn das neue
// (leere) Journal wirklich offen ist – sonst landet der Titel unter Last noch
// im vorherigen Journal. Dann auf einen NEUEN Speichervorgang warten.
async function newJournal(title, workDate) {
  await page.keyboard.press('Control+N');
  await page.waitForFunction(() => document.querySelector('#journal-title')?.value === '');
  await page.getByLabel('Titel des Journals').fill(title);
  await openJournalDetails(page);
  await waitForNewSave(page, async () => {
    await page.getByLabel('Arbeitsdatum').fill(workDate);
    await page.getByLabel('Arbeitsdatum').blur();
  });
  await saved();
}

before(async () => {
  ({ app, page, dir } = await launchApp());
  await newJournal('Farbmessung am Druckbogen', '2026-03-14');
  await newJournal('Papier und Laufrichtung', '2026-06-20');
  await newJournal('Alte Übung', '2025-09-01');
  // Das letzte Journal verlinkt auf «Farbmessung» → im Sammel-DOCX ein Sprung
  await newJournal('Druckplatte belichten', '2026-02-03');
  await editor('Durchführung').click();
  await page.keyboard.type('Messung siehe ');
  await tab('Einfügen').click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Link zu Journal' }).click();
  await page.getByRole('dialog', { name: 'Link zu Journal' }).waitFor();
  await page.keyboard.type('farbmessung');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Durchführung');
  await page.keyboard.type('.');
  await saved();
});
after(async () => {
  await app?.close();
});

test('Auswahl mit Zeitraum, Reihenfolge per Tastatur, Export mit Titelseite und Inhaltsverzeichnis', async () => {
  const target = path.join(dir, 'Sammlung.docx');
  await answerSaveDialog(target);
  await nav('Export').click();
  await panel().waitFor();
  assert.deepEqual(await runAxe(page), []);

  await panel().getByLabel('Titel auf der Titelseite').fill('Besprechung 2. Semester');
  // Zeitraum ab 2026: «Alte Übung» (2025) fällt weg
  await panel().getByLabel('Arbeitsdatum von').fill('2026-01-01');
  await panel().getByText('3 Journale angezeigt').waitFor();
  await panel().getByRole('button', { name: 'Alle angezeigten auswählen' }).click();
  // Standard: chronologisch nach Arbeitsdatum
  assert.deepEqual(await orderTitles(), [
    'Druckplatte belichten',
    'Farbmessung am Druckbogen',
    'Papier und Laufrichtung',
  ]);
  assert.deepEqual(await runAxe(page), []);

  // Tastatur: Alt+Pfeil nach oben verschiebt «Papier …» nach vorne; der Fokus wandert mit
  await orderList().getByRole('button', { name: '«Papier und Laufrichtung» nach oben' }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');
  assert.deepEqual(await orderTitles(), [
    'Papier und Laufrichtung',
    'Druckplatte belichten',
    'Farbmessung am Druckbogen',
  ]);
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    '«Papier und Laufrichtung» nach oben',
  );
  await panel().getByRole('status').getByText('an Position 1 von 3').waitFor();
  // Oben angekommen: Knopf bleibt fokussierbar, ist aber als nicht verfügbar markiert
  await page.keyboard.press('Alt+ArrowUp');
  assert.equal(
    await orderList()
      .getByRole('button', { name: '«Papier und Laufrichtung» nach oben' })
      .getAttribute('aria-disabled'),
    'true',
  );

  // Export: Hinweis R-10 + Hinweis zum Inhaltsverzeichnis
  await panel().getByRole('button', { name: 'Als Word exportieren …' }).click();
  await dialog().waitFor();
  await dialog().getByText('«Besprechung 2. Semester» · 3 Journale').waitFor();
  for (const text of ['Geschäftsgeheimnisse', 'Kundendaten', 'Personen auf Bildern', 'Felder aktualisieren'])
    await dialog().getByText(text).first().waitFor();
  assert.deepEqual(await runAxe(page), []);
  await page.keyboard.press('Enter');
  await dialog().getByText('Gespeichert als').waitFor({ timeout: 30000 });
  await dialog().getByText('Felder aktualisieren').waitFor();

  // Vorschlag: Ordner «exports», Exportdatum + Titel
  const [options] = await app.evaluate(() => globalThis.__savedDialogs);
  assert.match(options.defaultPath, /exports[\\/]\d{4}-\d{2}-\d{2} Besprechung 2\. Semester\.docx$/);

  // Datei: Titelseite, Inhaltsverzeichnis, Journale in gewählter Reihenfolge
  assert.ok(existsSync(target));
  const zip = unzipSync(new Uint8Array(readFileSync(target)));
  const xml = strFromU8(zip['word/document.xml']);
  assert.match(xml, /<w:pStyle w:val="Title"\/>[\s\S]*?Besprechung 2\. Semester/);
  assert.match(xml, /Zeitraum: 03\.02\.2026 – 20\.06\.2026/);
  assert.match(xml, /TOC \\h \\o &quot;1-1&quot;/);
  assert.doesNotMatch(xml, /Alte Übung/);
  const headings = xml
    .split('<w:p>')
    .filter((p) => p.includes('<w:pStyle w:val="Heading1"/>'))
    .map((p) => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''));
  assert.deepEqual(headings, [
    'Papier und Laufrichtung',
    'Druckplatte belichten',
    'Farbmessung am Druckbogen',
  ]);
  // Seitenumbruch vor dem Verzeichnis und vor jedem Journal
  assert.equal(xml.match(/<w:pageBreakBefore\/>/g).length, 4);
  // Link «Druckplatte» → «Farbmessung» springt im Dokument zur Textmarke
  assert.match(xml, /<w:hyperlink[^>]*w:anchor="j_[0-9a-f]+"/);
  assert.match(strFromU8(zip['word/settings.xml']), /<w:updateFields/);

  await page.keyboard.press('Escape');
  await dialog().waitFor({ state: 'detached' });
});

test('Zusammenstellung bleibt beim Ansichtswechsel erhalten; entfernen, sortieren, leeren', async () => {
  await nav('Journale').click();
  await nav('Export').click();
  await panel().waitFor();
  assert.equal(await panel().getByLabel('Titel auf der Titelseite').inputValue(), 'Besprechung 2. Semester');
  assert.equal((await orderTitles()).length, 3);

  // Entfernen: Fokus geht auf den Nachbarn
  await orderList()
    .getByRole('button', { name: '«Druckplatte belichten» aus der Auswahl entfernen' })
    .click();
  assert.deepEqual(await orderTitles(), ['Papier und Laufrichtung', 'Farbmessung am Druckbogen']);
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    '«Farbmessung am Druckbogen» aus der Auswahl entfernen',
  );
  // Abgewählt ist es auch in der Auswahlliste
  assert.equal(
    await panel()
      .getByRole('checkbox', { name: /Druckplatte belichten/ })
      .isChecked(),
    false,
  );

  await panel().getByRole('button', { name: 'Chronologisch sortieren' }).click();
  assert.deepEqual(await orderTitles(), ['Farbmessung am Druckbogen', 'Papier und Laufrichtung']);

  // Erneut ankreuzen: erscheint an seiner zeitlichen Stelle (3.2. vor 14.3.)
  await panel()
    .getByRole('checkbox', { name: /Druckplatte belichten/ })
    .check();
  assert.deepEqual(await orderTitles(), [
    'Druckplatte belichten',
    'Farbmessung am Druckbogen',
    'Papier und Laufrichtung',
  ]);

  await panel().getByRole('button', { name: 'Auswahl leeren' }).click();
  await panel().getByText('Noch nichts ausgewählt.').waitFor();
  assert.equal(await panel().getByRole('button', { name: 'Als Word exportieren …' }).isDisabled(), true);
  assert.deepEqual(await runAxe(page), []);
});

test('Datei-Menü «Exportieren» führt zur Auswahl mehrerer Journale', async () => {
  await page.keyboard.press('Alt+D');
  await page.getByRole('button', { name: 'Exportieren', exact: true }).click();
  await page.getByRole('button', { name: /mehrere Journale/ }).click();
  await panel().waitFor();
});

// E2E: Fachbuch (AJ-11) – Volltextsuche mit Hervorhebung, Themenansicht,
// Suchen im Journal (Strg+F), Suchindex neu aufbauen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, runAxe, waitForNewSave } from './helpers.mjs';

let app;
let page;
const editor = (name) => page.getByRole('textbox', { name, exact: true });

before(async () => {
  ({ app, page } = await launchApp());
  // Journal 1: Feuchtwerk im Text, Kategorie e, Schlagwort
  await page.keyboard.press('Control+N');
  await page.getByLabel('Titel des Journals').fill('Plattenwechsel an der Bogenoffset');
  await editor('Durchführung').click();
  await waitForNewSave(page, () =>
    page.keyboard.type('Feuchtwerk gereinigt. Danach das Feuchtwerk neu eingestellt.'),
  );
  await page.locator('#journal-categories-summary').click();
  await page.getByRole('checkbox', { name: 'e – Ausführen von Druckaufträgen' }).check();
  await page.getByLabel('Schlagwörter').fill('Offsetdruck');
  await page.getByLabel('Schlagwörter').press('Enter');
  await page.getByRole('button', { name: 'Schlagwort «Offsetdruck» entfernen' }).waitFor();
  // Journal 2: ohne Kategorie, Treffer im Titel
  await page.keyboard.press('Control+N');
  await waitForNewSave(page, () => page.getByLabel('Titel des Journals').fill('Feuchtwerk-Probleme beheben'));
});
after(async () => {
  await app?.close();
});

test('Strg+Umschalt+F: Volltextsuche mit hervorgehobenen Treffern, Titeltreffer zuerst', async () => {
  await page.keyboard.press('Control+Shift+F');
  await page.keyboard.type('feuchtwer');
  const results = page.getByRole('list', { name: 'Suchergebnisse' });
  await results.waitFor();
  const items = results.getByRole('listitem');
  assert.equal(await items.count(), 2);
  assert.match(await items.first().textContent(), /Feuchtwerk-Probleme/);
  assert.equal(await results.locator('mark').first().textContent(), 'Feuchtwerk');
  assert.match(await items.nth(1).textContent(), /gereinigt/); // Ausschnitt aus dem Text
  assert.deepEqual(await runAxe(page), [], 'Suchergebnisse');
});

test('Schlagwörter sind durchsuchbar; Treffer öffnet das Journal', async () => {
  await page.locator('#fachbuch-search').fill('offsetdr');
  const hit = page
    .getByRole('list', { name: 'Suchergebnisse' })
    .getByRole('button', { name: /Plattenwechsel/ });
  await hit.click();
  await page.waitForFunction(
    () => document.querySelector('#journal-title')?.value === 'Plattenwechsel an der Bogenoffset',
  );
});

test('Strg+F im Journal: Treffer zählen und durchspringen, Text bleibt unverändert', async () => {
  await page.keyboard.press('Control+F');
  const bar = page.getByRole('search', { name: 'Im Journal suchen' });
  await bar.getByLabel('Suchbegriff').fill('feuchtwerk');
  const status = page.getByTestId('find-status');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="find-status"]')?.textContent === '1 von 2',
  );
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="find-status"]')?.textContent === '2 von 2',
  );
  await page.keyboard.press('Enter'); // nach dem letzten Treffer wieder zum ersten
  await page.waitForFunction(
    () => document.querySelector('[data-testid="find-status"]')?.textContent === '1 von 2',
  );
  await bar.getByLabel('Suchbegriff').fill('gibtsnicht');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="find-status"]')?.textContent === 'Keine Treffer',
  );
  assert.equal(await status.textContent(), 'Keine Treffer');
  assert.deepEqual(await runAxe(page), [], 'Suchleiste');
  await page.keyboard.press('Escape');
  await bar.waitFor({ state: 'detached' });
  // Suchen verändert den Journaltext nicht
  assert.equal(
    await page.getByRole('textbox', { name: 'Durchführung', exact: true }).textContent(),
    'Feuchtwerk gereinigt. Danach das Feuchtwerk neu eingestellt.',
  );
});

test('Themenansicht: nach Kategorie (inkl. «Ohne Kategorie») und nach Schlagwort', async () => {
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Fachbuch' })
    .click();
  await page.locator('#fachbuch-search').fill('');
  await page.getByText('e – Ausführen von Druckaufträgen (1)').waitFor();
  await page.getByText('Ohne Kategorie (1)').waitFor();
  await page.getByRole('radio', { name: 'Nach Schlagwort' }).click();
  await page.getByText('Offsetdruck (1)').waitFor();
  assert.deepEqual(await runAxe(page), [], 'Themenansicht');
});

test('Suchindex neu aufbauen (Einstellungen)', async () => {
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Einstellungen' })
    .click();
  await page.getByRole('button', { name: 'Suchindex neu aufbauen' }).click();
  await page.getByTestId('statusbar-live').getByText('Suchindex neu aufgebaut (2 Journale).').waitFor();
});

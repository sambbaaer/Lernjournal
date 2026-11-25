// E2E Paket A: Startseite ohne Doppelungen mit Fortschritt (AJ-24),
// Menüband mit Suche und Filtern ausserhalb des Editors (AJ-25),
// Schnellsuche Strg+K (AJ-26) und Störungstabelle (AJ-30).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, runAxe, waitForNewSave } from './helpers.mjs';

let app;
let page;

const nav = (name) =>
  page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name, exact: true });
const ribbon = () => page.getByRole('banner', { name: 'Menüband' });

async function newJournal(title) {
  await page.keyboard.press('Control+N');
  await page.waitForFunction(() => document.querySelector('#journal-title')?.value === '');
  await waitForNewSave(page, () => page.getByLabel('Titel des Journals').fill(title));
}

before(async () => {
  ({ app, page } = await launchApp());
  await newJournal('Farbmessung am Druckbogen');
  await newJournal('Plattenwechsel Speedmaster');
});

after(async () => {
  await app?.close();
});

test('Startseite: jedes Journal nur einmal, Fortschritt rechts', async () => {
  await nav('Start').click();
  const recent = page.getByRole('region', { name: 'Zuletzt bearbeitet' });
  await recent.getByText('Plattenwechsel Speedmaster').waitFor();
  assert.equal(await page.getByText('Farbmessung am Druckbogen').count(), 1);
  const progress = page.getByRole('complementary', { name: 'Fortschritt' });
  await progress.getByText('Für das QV vorgemerkt').waitFor();
  assert.match(await progress.textContent(), /0 von mindestens 12 Lernberichten/);
  assert.deepEqual(await runAxe(page), []);
});

test('Menüband ausserhalb des Editors: Filter zeigen die Journalliste', async () => {
  await nav('Start').click();
  const filters = ribbon().getByRole('group', { name: 'Journale filtern' });
  await filters.getByLabel('Lernort').selectOption('schule');
  await page.getByRole('heading', { level: 1, name: 'Journale' }).waitFor();
  await page.getByText('Keine Journale für diese Auswahl.').waitFor();
  // In der Ansicht «Journale» stehen die Filter (und «Filter zurücksetzen») über der Liste
  assert.equal(await ribbon().getByRole('group', { name: 'Journale filtern' }).count(), 0);
  await page.getByRole('main').getByRole('button', { name: 'Filter zurücksetzen' }).click();
  await page.getByRole('row', { name: /Farbmessung am Druckbogen/ }).waitFor();
});

test('Strg+K findet Journale und öffnet sie mit Enter', async () => {
  await nav('Start').click();
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog', { name: 'Schnellsuche' });
  await dialog.waitFor();
  await dialog.getByRole('combobox', { name: 'Suchen' }).fill('farbmess');
  await dialog.getByRole('option', { name: /Farbmessung am Druckbogen/ }).waitFor();
  assert.deepEqual(await runAxe(page), []);
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction(
    () => document.querySelector('#journal-title')?.value === 'Farbmessung am Druckbogen',
  );
});

test('Einfügen → Störungstabelle', async () => {
  await page.getByRole('textbox', { name: 'Durchführung', exact: true }).click();
  await page.getByRole('tab', { name: 'Einfügen', exact: true }).click();
  // Bausteine stehen in einem Aufklapp-Menü (wie «Schnellbausteine» in Word)
  await ribbon().getByRole('button', { name: 'Bausteine' }).click();
  const menu = page.getByRole('menu', { name: 'Bausteine' });
  await menu.waitFor();
  assert.deepEqual(await runAxe(page), []);
  await waitForNewSave(page, () => menu.getByRole('menuitem', { name: 'Störungstabelle' }).click());
  await menu.waitFor({ state: 'detached' });
  const table = page.getByRole('textbox', { name: 'Durchführung', exact: true }).locator('table');
  await table.waitFor();
  assert.deepEqual(
    (await table.locator('th').allTextContents()).map((t) => t.trim()),
    ['Symptom', 'Ursache', 'Massnahme'],
  );
});

test('Menüband bleibt einzeilig: bei wenig Platz erst Symbole, dann «Weitere Befehle»', async () => {
  const win = await app.browserWindow(page);
  // Oberkanten aller Knöpfe der Befehlszeile: eine Zeile = ein Wert
  const rows = () =>
    page.evaluate(
      () =>
        new Set(
          [...document.querySelectorAll('[role="toolbar"] [data-roving]')].map((b) =>
            Math.round(b.getBoundingClientRect().top),
          ),
        ).size,
    );
  await page.getByRole('tab', { name: 'Einfügen', exact: true }).click();
  assert.equal(await rows(), 1);
  // Sehr wenig Platz: schmales Fenster und grosse Schrift (wie hohe Windows-Skalierung)
  await win.evaluate((w) => w.setSize(760, 700));
  await page.evaluate(() => (document.documentElement.style.fontSize = '40px'));
  const more = ribbon().getByRole('button', { name: 'Weitere Befehle' });
  await more.waitFor();
  // Weiterhin eine Zeile
  assert.equal(await rows(), 1);
  // Mit der Tastatur öffnen, ausgeblendete Befehle stehen im Menü
  await more.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Weitere Befehle' });
  // Merkstelle zeigt an, ob die Einfügemarke in einer steht → Kontrollkästchen-Eintrag
  await menu.getByRole('menuitemcheckbox', { name: 'Merkstelle' }).waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('role')?.startsWith('menuitem')),
    true,
  );
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    'Weitere Befehle',
  );
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));
  await win.evaluate((w) => w.setSize(1280, 800));
  await more.waitFor({ state: 'detached' });
});

// E2E: Journale verknüpfen (AJ-10) – Rückverweise, Auswahl per Suche, Links im Text, Strg+Klick.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, runAxe } from './helpers.mjs';

let app;
let page;
before(async () => {
  ({ app, page } = await launchApp());
  for (const t of [
    'Farbmessung am Druckbogen',
    'Falzen eines Leporellos',
    'Plattenwechsel an der Bogenoffset',
  ]) {
    await page.keyboard.press('Control+N');
    await page.getByLabel('Titel des Journals').fill(t);
    await page.getByTestId('statusbar-live').getByText('Gespeichert').waitFor();
  }
});
after(async () => {
  await app?.close();
});

const related = () => page.getByRole('list', { name: 'Verknüpfte Journale' });

test('Journal per Suche verknüpfen (Pfeiltasten + Enter)', async () => {
  // Offen ist «Plattenwechsel …»
  await page.getByRole('button', { name: 'Journal verknüpfen …' }).click();
  const picker = page.getByRole('dialog', { name: 'Journal verknüpfen' });
  await picker.getByRole('combobox', { name: 'Journal suchen' }).fill('farb');
  await picker.getByRole('option', { name: /Farbmessung am Druckbogen/ }).waitFor();
  assert.equal(await picker.getByRole('option').count(), 1);
  assert.deepEqual(await runAxe(page), [], 'Auswahldialog');
  await page.keyboard.press('Enter');
  await related().getByRole('button', { name: 'Farbmessung am Druckbogen', exact: true }).waitFor();
});

test('Rückverweis erscheint im anderen Journal und öffnet zurück', async () => {
  await related().getByRole('button', { name: 'Farbmessung am Druckbogen', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('#journal-title')?.value === 'Farbmessung am Druckbogen',
  );
  const back = related().getByRole('listitem').filter({ hasText: 'verweist hierher' });
  await back.getByRole('button', { name: 'Plattenwechsel an der Bogenoffset', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('#journal-title')?.value === 'Plattenwechsel an der Bogenoffset',
  );
});

test('Link zu Journal im Text: verknüpft zusätzlich; Strg+Klick öffnet', async () => {
  await page.getByRole('textbox', { name: 'Reflexion', exact: true }).click();
  await page.keyboard.type('Siehe auch ');
  await page.getByRole('tab', { name: 'Einfügen', exact: true }).click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Link zu Journal' }).click();
  const picker = page.getByRole('dialog', { name: 'Link zu Journal einfügen' });
  await picker.getByRole('combobox').fill('leporello');
  await picker.getByRole('option', { name: /Falzen eines Leporellos/ }).click();
  const link = page
    .getByRole('textbox', { name: 'Reflexion', exact: true })
    .getByRole('link', { name: 'Falzen eines Leporellos' });
  await link.waitFor();
  assert.match(await link.getAttribute('href'), /^lernjournal:\/\/journal\/[0-9a-f-]{36}$/);
  await related().getByRole('button', { name: 'Falzen eines Leporellos', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Start', exact: true }).click();
  await page.getByTestId('statusbar-live').getByText('Gespeichert').waitFor();
  await link.click({ modifiers: ['Control'] });
  await page.waitForFunction(
    () => document.querySelector('#journal-title')?.value === 'Falzen eines Leporellos',
  );
});

test('Verknüpfung entfernen wirkt in beiden Journalen; keine Kopien', async () => {
  await related()
    .getByRole('button', { name: 'Verknüpfung mit «Plattenwechsel an der Bogenoffset» entfernen' })
    .click();
  await page.getByText('Noch keine. Verknüpfe verwandte Arbeiten').waitFor();
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Journale' })
    .click();
  // Weiterhin genau drei Journale – Verknüpfen erzeugt keine Kopien
  assert.equal(await page.locator('tbody tr').count(), 3);
  await page.getByRole('row', { name: /Plattenwechsel/ }).dblclick();
  await related().getByRole('button', { name: 'Farbmessung am Druckbogen', exact: true }).waitFor();
  assert.equal(
    await related().getByRole('button', { name: 'Falzen eines Leporellos', exact: true }).count(),
    0,
  );
});

test('Weblink: Strg+Klick fragt nach und öffnet erst nach Bestätigung im Browser', async () => {
  // Windows-Dialog und Browser im Test ersetzen
  await app.evaluate(({ dialog, shell }) => {
    globalThis.__opened = null;
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    shell.openExternal = async (url) => {
      globalThis.__opened = url;
    };
  });
  const ed = page.getByRole('textbox', { name: 'Auftrag / Ausgangslage', exact: true });
  await ed.click();
  await page.getByRole('tab', { name: 'Einfügen', exact: true }).click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Weblink' }).click();
  await page.getByRole('dialog', { name: 'Weblink' }).getByLabel('Adresse').fill('www.fogra.org');
  await page.getByRole('dialog', { name: 'Weblink' }).getByRole('button', { name: 'Übernehmen' }).click();
  await ed.getByRole('link').click({ modifiers: ['Control'] });
  await page.waitForFunction(() => true);
  const opened = await app.evaluate(async () => {
    for (let i = 0; i < 50 && !globalThis.__opened; i++) await new Promise((r) => setTimeout(r, 50));
    return globalThis.__opened;
  });
  assert.equal(opened, 'https://www.fogra.org/');
  await page.getByRole('tab', { name: 'Start', exact: true }).click();
});

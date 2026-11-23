// E2E: Rich-Text-Editor in den drei Abschnitten (AJ-06).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, runAxe } from './helpers.mjs';

let app;
let page;
let dir;

before(async () => {
  ({ app, page, dir } = await launchApp());
  await page.keyboard.press('Control+N');
  await page.getByLabel('Titel des Journals').fill('Farbmessung am Druckbogen');
});
after(async () => {
  await app?.close();
});

const editor = (name) => page.getByRole('textbox', { name, exact: true });
const ribbon = () => page.getByRole('tabpanel');
const tab = (name) => page.getByRole('tab', { name, exact: true });
const saved = () => page.getByTestId('statusbar-live').getByText('Gespeichert').waitFor();

test('Leere Abschnitte zeigen Hilfetexte als Platzhalter', async () => {
  const hint = await editor('Reflexion').locator('p').getAttribute('data-placeholder');
  assert.match(hint, /Was lief gut/);
});

test('Schreiben und formatieren über Menüband und Tastatur; Knopf zeigt Zustand', async () => {
  await editor('Durchführung').click();
  await page.keyboard.type('Messgerät kalibriert. ');
  await ribbon().getByRole('button', { name: 'Fett' }).click();
  assert.equal(await ribbon().getByRole('button', { name: 'Fett' }).getAttribute('aria-pressed'), 'true');
  await page.keyboard.type('Wichtig');
  await page.keyboard.press('Control+B'); // Tiptap-Kürzel
  await page.keyboard.type(' danach normal.');
  await page.keyboard.press('Enter');
  await ribbon().getByRole('button', { name: 'Nummerierung' }).click();
  await page.keyboard.type('Erster Schritt');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Zweiter Schritt');
  await saved();
  const html = await editor('Durchführung').innerHTML();
  assert.match(html, /<strong>Wichtig<\/strong>/);
  assert.match(html, /<ol[^>]*>.*Erster Schritt.*Zweiter Schritt.*<\/ol>/s);
});

test('Tabelle einfügen: kontextuelles Register «Tabelle» erscheint und verschwindet', async () => {
  await editor('Auftrag / Ausgangslage').click();
  await tab('Einfügen').click();
  await ribbon().getByRole('button', { name: 'Tabelle' }).click();
  await tab('Tabelle').waitFor();
  await tab('Tabelle').click();
  await ribbon().getByRole('button', { name: 'Zeile unterhalb einfügen' }).click();
  assert.equal(await editor('Auftrag / Ausgangslage').locator('tr').count(), 4);
  // Einfügemarke in einen anderen Abschnitt → Register verschwindet
  await editor('Reflexion').click();
  await tab('Tabelle').waitFor({ state: 'detached' });
  await tab('Start').click();
});

test('Einfügen aus Word: Office-Tags, Skripte und Fremdformate werden entfernt', async () => {
  await editor('Reflexion').click();
  const wordHtml =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--[if gte mso 9]><xml>x</xml><![endif]-->' +
    '<p class="MsoNormal" style="mso-fareast-font-family:Calibri"><span style="color:red;font-size:20pt">Gut lief </span>' +
    '<b>die Farbmessung</b><o:p></o:p></p><script>window.__evil = 1</script><img src="file:///C:/x.png">' +
    '<p><a href="javascript:alert(1)">Gefährlicher Link</a></p></body></html>';
  await page.evaluate((html) => {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', 'Gut lief die Farbmessung');
    document.activeElement.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, wordHtml);
  await saved();
  const html = await editor('Reflexion').innerHTML();
  assert.match(html, /Gut lief/);
  assert.match(html, /<strong>die Farbmessung<\/strong>/);
  assert.doesNotMatch(html, /script|<img|javascript:|mso|color:\s*red|o:p/i);
  assert.equal(await page.evaluate(() => window.__evil), undefined);
});

test('Weblink: www-Adresse wird zu https, unzulässige Adressen werden abgelehnt', async () => {
  await editor('Reflexion').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Fogra');
  await page.keyboard.down('Shift');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');
  await tab('Einfügen').click();
  await ribbon().getByRole('button', { name: 'Weblink' }).click();
  const dialog = page.getByRole('dialog', { name: 'Weblink' });
  await dialog.getByLabel('Adresse').fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: 'Übernehmen' }).click();
  await dialog.getByText('Bitte eine Webadresse eingeben').waitFor();
  assert.deepEqual(await runAxe(page), [], 'Linkdialog');
  await dialog.getByLabel('Adresse').fill('www.fogra.org');
  await dialog.getByRole('button', { name: 'Übernehmen' }).click();
  await saved();
  assert.equal(await editor('Reflexion').locator('a').getAttribute('href'), 'https://www.fogra.org/');
  await tab('Start').click();
});

test('Strg+S speichert sofort; Dokumentansicht mit Inhalt ist barrierefrei', async () => {
  await editor('Reflexion').click();
  await page.keyboard.type(' Nächstes Mal früher prüfen.');
  await page.keyboard.press('Control+S');
  await saved();
  assert.deepEqual(await runAxe(page), []);
});

test('Inhalt übersteht einen Neustart', async () => {
  await app.close();
  ({ app, page } = await launchApp({ dir }));
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Journale' })
    .click();
  await page.getByRole('row', { name: /Farbmessung am Druckbogen/ }).dblclick();
  await editor('Durchführung').waitFor();
  assert.match(await editor('Durchführung').innerHTML(), /<strong>Wichtig<\/strong>/);
  assert.equal(await editor('Auftrag / Ausgangslage').locator('tr').count(), 4);
  assert.match(await editor('Reflexion').textContent(), /Nächstes Mal früher prüfen/);
});

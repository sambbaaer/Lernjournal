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

test('«Tabelle» erscheint farbig und verschwindet beim Verlassen der Tabelle', async () => {
  await editor('Auftrag / Ausgangslage').click();
  await tab('Einfügen').click();
  await ribbon().getByRole('button', { name: 'Tabelle' }).click();
  const tableTab = tab('Tabelle');
  await tableTab.waitFor();
  const background = (name) => tab(name).evaluate((el) => getComputedStyle(el).backgroundColor);
  const tableBackground = await background('Tabelle');
  assert.notEqual(tableBackground, await background('Einfügen'));
  assert.equal(await tableTab.getAttribute('aria-selected'), 'false');

  await tab('Exportieren').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tableTab.getAttribute('aria-selected'), 'true');
  assert.equal(await background('Tabelle'), tableBackground);
  await ribbon().getByRole('button', { name: 'Zeile unterhalb einfügen' }).click();
  assert.equal(await editor('Auftrag / Ausgangslage').locator('tr').count(), 4);
  // Einfügemarke in einen anderen Abschnitt → Register verschwindet
  await editor('Reflexion').click();
  await tableTab.waitFor({ state: 'detached' });

  await editor('Auftrag / Ausgangslage').locator('td').first().click();
  await tableTab.waitFor();
  assert.equal(await background('Tabelle'), tableBackground);
  await editor('Reflexion').click();
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

test('Menüband «Start → Einfügen» und der «Einfügen»-Knopf am Seitenende nutzen den Paste-Event', async () => {
  await tab('Start').click();
  await editor('Reflexion').click();
  await page.keyboard.press('End');
  // Simuliert die Windows-Zwischenablage für diesen Aufruf, ohne die tatsächliche zu verändern.
  const stub = (enabled) =>
    app.evaluate(({ BrowserWindow }, enabled) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      if (!enabled) {
        contents.paste = globalThis.__originalPaste;
        contents.pasteAndMatchStyle = globalThis.__originalPastePlain;
        delete globalThis.__originalPaste;
        delete globalThis.__originalPastePlain;
        return;
      }
      globalThis.__originalPaste = contents.paste;
      globalThis.__originalPastePlain = contents.pasteAndMatchStyle;
      contents.paste = () =>
        void contents.executeJavaScript(`(() => {
      const data = new DataTransfer();
      data.setData('text/html', '<p><strong>Einfügeprobe</strong></p>');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    })()`);
      contents.pasteAndMatchStyle = () =>
        void contents.executeJavaScript(`(() => {
      const data = new DataTransfer();
      data.setData('text/plain', ' NurTextProbe');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    })()`);
    }, enabled);
  await stub(true);
  try {
    await ribbon().getByRole('button', { name: 'Einfügen', exact: true }).click();
    await editor('Reflexion').locator('strong').filter({ hasText: 'Einfügeprobe' }).waitFor();

    const doc = page.getByRole('article', { name: 'Journal' });
    await doc.locator('summary', { hasText: 'Einfügen' }).click();
    await doc.getByRole('button', { name: /Nur Text übernehmen/ }).click();
    await editor('Reflexion').getByText('NurTextProbe').waitFor();

    await doc.locator('summary', { hasText: 'Einfügen' }).click();
    await doc.getByRole('button', { name: 'ΔE (Delta E (Farbabstand))' }).click();
    await editor('Reflexion')
      .getByText(/NurTextProbeΔE/)
      .waitFor();
  } finally {
    await stub(false);
  }
});

test('Journalkopf bleibt kompakt und Abschnitte lassen sich frei anpassen', async () => {
  const details = page.getByRole('button', { name: 'Journaldetails' });
  assert.equal(await details.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.getByLabel('Arbeitsdatum').isVisible(), false);
  await details.click();
  await page.getByLabel('Arbeitsdatum').waitFor();
  await details.click();
  await page.getByLabel('Arbeitsdatum').waitFor({ state: 'hidden' });

  await tab('Einfügen').click();
  await ribbon().getByRole('button', { name: 'Abschnitt hinzufügen' }).click();
  const form = page.getByRole('dialog', { name: 'Abschnitt hinzufügen' });
  await form.getByLabel('Überschrift (optional)').fill('Messdaten');
  await form.getByRole('button', { name: 'Hinzufügen' }).click();
  await form.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Messdaten');
  await page.keyboard.type('Feuchtwasserwerte laut Kontrollbogen.');

  const actions = (heading) => page.getByLabel(`Abschnitt bearbeiten · ${heading}`);
  await actions('Messdaten').click();
  await page.getByRole('button', { name: 'Umbenennen …' }).click();
  const rename = page.getByRole('dialog', { name: 'Abschnitt umbenennen' });
  await rename.getByLabel('Überschrift (optional)').fill('Kontrollwerte');
  await rename.getByRole('button', { name: 'Übernehmen' }).click();
  await actions('Kontrollwerte').click();
  await page.getByRole('button', { name: 'Nach oben verschieben' }).click();
  const headings = () =>
    page.getByRole('article', { name: 'Journal' }).getByRole('heading', { level: 2 }).allTextContents();
  assert.deepEqual(await headings(), [
    'Auftrag / Ausgangslage',
    'Durchführung',
    'Kontrollwerte',
    'Reflexion',
  ]);
  await actions('Auftrag / Ausgangslage').click();
  await page.getByRole('button', { name: 'Abschnitt entfernen …' }).click();
  const remove = page.getByRole('alertdialog', { name: 'Abschnitt entfernen?' });
  await remove.getByRole('button', { name: 'Entfernen' }).click();
  await page.keyboard.press('Control+S');
  await saved();

  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Journale' })
    .click();
  await page.getByRole('row', { name: /Farbmessung am Druckbogen/ }).dblclick();
  await editor('Kontrollwerte').waitFor();
  assert.deepEqual(await headings(), ['Durchführung', 'Kontrollwerte', 'Reflexion']);
  assert.match(await editor('Kontrollwerte').textContent(), /Feuchtwasserwerte laut Kontrollbogen/);
  assert.deepEqual(await runAxe(page), []);
});

test('Ganze Vorlagen werden unter dem vorhandenen Inhalt angehängt und gespeichert', async () => {
  const document = page.getByRole('article', { name: 'Journal' });
  const headings = () => document.getByRole('heading', { level: 2 }).allTextContents();
  const original = await headings();
  const form = page.getByRole('dialog', { name: 'Abschnitt hinzufügen' });

  await document.getByRole('button', { name: 'Abschnitt hinzufügen' }).click();
  await form.waitFor();
  assert.deepEqual(await runAxe(page), []);
  await form.getByRole('button', { name: /^Maschinenwerte/ }).click();
  await form.waitFor({ state: 'detached' });
  const machine = ['Maschine und Einsatz', 'Kennwerte', 'Hinweise zur Praxis'];
  assert.deepEqual(await headings(), [...original, ...machine]);
  await editor('Kennwerte').getByRole('cell', { name: 'Maximales Format' }).waitFor();

  await tab('Einfügen').click();
  await ribbon().getByRole('button', { name: 'Abschnitt hinzufügen' }).click();
  await form.getByRole('button', { name: /^Arbeitsablauf/ }).click();
  await form.waitFor({ state: 'detached' });
  const workflow = ['Vorbereitung', 'Arbeitsschritte', 'Kontrolle und Ergebnis'];
  assert.deepEqual(await headings(), [...original, ...machine, ...workflow]);
  await editor('Arbeitsschritte').locator('ol li').waitFor();
  await page.keyboard.press('Control+S');
  await saved();

  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Journale' })
    .click();
  await page.getByRole('row', { name: /Farbmessung am Druckbogen/ }).dblclick();
  await editor('Arbeitsschritte').locator('ol li').waitFor();
  await saved();
  assert.deepEqual(await headings(), [...original, ...machine, ...workflow]);
  assert.match(await editor('Kontrollwerte').textContent(), /Feuchtwasserwerte laut Kontrollbogen/);
  assert.equal(
    await editor('Maschine und Einsatz').locator('p').getAttribute('data-placeholder'),
    'Hersteller, Modell und Einsatzgebiet.',
  );
});

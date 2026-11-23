// E2E: Bilder mit Legende (AJ-07) – Dialog, Zwischenablage, Drag & Drop,
// Metadaten entfernt, Ausrichtung korrigiert, verkleinert, Neustart.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { launchApp, runAxe } from './helpers.mjs';

let app;
let page;
let dir;
const fixture = (n) => path.resolve('e2e/fixtures', n);
const editor = (name) => page.getByRole('textbox', { name, exact: true });
const live = () => page.getByTestId('statusbar-live');

before(async () => {
  ({ app, page, dir } = await launchApp());
  await page.keyboard.press('Control+N');
  await page.getByLabel('Titel des Journals').fill('Bilder-Test');
});
after(async () => {
  await app?.close();
});

// Datei als File-Objekt in der Seite bereitstellen und als Paste/Drop auslösen
async function dispatchFile(kind, target, file, mime) {
  const b64 = readFileSync(fixture(file)).toString('base64');
  await page.evaluate(
    ({ kind, b64, name, mime, label }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type: mime }));
      const el = document.querySelector(`[aria-label="${label}"]`);
      const rect = el.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10 };
      el.dispatchEvent(
        kind === 'paste'
          ? new ClipboardEvent('paste', { ...init, clipboardData: dt })
          : new DragEvent('drop', { ...init, dataTransfer: dt }),
      );
    },
    { kind, b64, name: file, mime, label: target },
  );
}

async function imageSizes() {
  return page.evaluate(() =>
    [...document.querySelectorAll('.lj-figure img')].map((i) => ({
      w: i.naturalWidth,
      h: i.naturalHeight,
      done: i.complete,
    })),
  );
}

test('Bild über den Dateidialog: Legende, Ausrichtung korrigiert, verkleinert, ohne GPS', async () => {
  await editor('Durchführung').click();
  await page.keyboard.type('Vorher:');
  await page.getByRole('tab', { name: 'Einfügen', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('tabpanel').getByRole('button', { name: 'Bild' }).click();
  await (await chooser).setFiles(fixture('foto-mit-gps.jpg'));
  const caption = page.getByLabel('Bildlegende');
  await caption.waitFor();
  // Cursor steht direkt im Legendenfeld
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Bildlegende');
  await caption.fill('Kontrollstreifen auf dem Druckbogen');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Nachher.');
  await live().getByText('Gespeichert').waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.lj-figure img')].every((i) => i.complete && i.naturalWidth > 0),
  );
  // EXIF-Ausrichtung 6 (Hochformat) angewendet, auf 2400 px Kante verkleinert
  assert.deepEqual((await imageSizes())[0], { w: 1600, h: 2400, done: true });

  // Gespeicherte Datei: kein EXIF/GPS mehr
  const mediaDir = path.join(dir, 'Dokumente', 'Lernjournal', 'media');
  const files = readdirSync(mediaDir).filter((f) => f.endsWith('.jpg'));
  assert.equal(files.length, 1);
  const bytes = readFileSync(path.join(mediaDir, files[0]));
  assert.equal(bytes.includes(Buffer.from('Exif')), false, 'EXIF-Block noch vorhanden');
  assert.equal(bytes.length < 1_500_000, true);
});

test('Bild aus der Zwischenablage (Strg+V) und per Drag & Drop', async () => {
  await editor('Reflexion').click();
  await dispatchFile('paste', 'Reflexion', 'screenshot.png', 'image/png');
  await page.waitForFunction(() => document.querySelectorAll('.lj-figure').length === 2);
  await dispatchFile('drop', 'Auftrag / Ausgangslage', 'bild.webp', 'image/webp');
  await page.waitForFunction(() => document.querySelectorAll('.lj-figure').length === 3);
  await live()
    .getByText(/Bild eingefügt/)
    .waitFor();
});

test('Nicht unterstützte oder kaputte Dateien: verständliche Meldung, nichts eingefügt', async () => {
  await editor('Reflexion').click();
  await dispatchFile('paste', 'Reflexion', 'kein-bild.png', 'image/png');
  await live()
    .getByText(/konnte nicht gelesen werden/)
    .waitFor();
  const b64 = Buffer.from('heic').toString('base64');
  await page.evaluate((b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([atob(b64)], 'IMG_0001.HEIC', { type: 'image/heic' }));
    document.activeElement.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }),
    );
  }, b64);
  await live()
    .getByText(/HEIC-Format/)
    .waitFor();
  assert.equal(await page.locator('.lj-figure').count(), 3);
});

test('Barrierefreiheit mit Bildern (Alternativtext = Legende)', async () => {
  await page.keyboard.press('Control+S');
  await live().getByText('Gespeichert').waitFor();
  assert.equal(
    await editor('Durchführung').locator('.lj-figure img').getAttribute('alt'),
    'Kontrollstreifen auf dem Druckbogen',
  );
  assert.deepEqual(await runAxe(page), []);
});

test('Bilder und Legenden überstehen einen Neustart', async () => {
  await app.close();
  ({ app, page } = await launchApp({ dir }));
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Journale' })
    .click();
  await page.getByRole('row', { name: /Bilder-Test/ }).dblclick();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.lj-figure img').length === 3 &&
      [...document.querySelectorAll('.lj-figure img')].every((i) => i.complete && i.naturalWidth > 0),
  );
  assert.equal(
    await editor('Durchführung').getByLabel('Bildlegende').inputValue(),
    'Kontrollstreifen auf dem Druckbogen',
  );
});

test('Bilder sind nur für das geöffnete Projekt abrufbar und nur per ID', async () => {
  const r = await page.evaluate(async () => {
    const a = await fetch('app://lernjournal/media/../journal.sqlite')
      .then((x) => x.status)
      .catch(() => 'blockiert');
    const b = await fetch('app://lernjournal/media/00000000-0000-4000-8000-000000000000')
      .then((x) => x.status)
      .catch(() => 'blockiert');
    return [a, b];
  });
  assert.notEqual(r[0], 200);
  assert.equal(r[1], 404);
});

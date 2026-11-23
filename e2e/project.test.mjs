// E2E: Projekt anlegen, öffnen, Profil, Neustart (AJ-03).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { launchApp, runAxe } from './helpers.mjs';

test('Erster Start: Startbildschirm mit Hinweis «inoffizielles Hilfsmittel», barrierefrei', async () => {
  const { app, page } = await launchApp({ withProject: false });
  try {
    await page.getByText('Inoffizielles Hilfsmittel.').waitFor();
    assert.equal(await page.title(), 'Lernjournal');
    assert.deepEqual(await runAxe(page), []);
  } finally {
    await app.close();
  }
});

test('Assistent: Standardwerte, Profil, Anlegen, Neustart öffnet das Projekt automatisch', async () => {
  const { app, page, dir } = await launchApp({ withProject: false });
  let projectPath;
  try {
    await page.getByRole('button', { name: /Neues Lernjournal anlegen/ }).click();
    // Schritt 1: Vorschlag liegt in «Dokumente\Lernjournal» des Testordners
    projectPath = (await page.getByTestId('wizard-location').textContent()).trim();
    assert.equal(projectPath, path.join(dir, 'Dokumente', 'Lernjournal'));
    assert.deepEqual(await runAxe(page), [], 'Schritt 1');
    await page.getByRole('button', { name: 'Weiter' }).click();
    // Schritt 2: Fachrichtung Print ist vorausgewählt
    assert.equal(await page.getByRole('radio', { name: 'Print', exact: true }).isChecked(), true);
    await page.getByLabel('Dein Name').fill('Lea Muster');
    await page.getByLabel(/Lehrbetrieb/).fill('Druckerei Beispiel AG');
    await page.getByLabel(/Lehrbeginn/).fill('2025-08-04');
    assert.deepEqual(await runAxe(page), [], 'Schritt 2');
    await page.getByRole('button', { name: 'Weiter' }).click();
    // Schritt 3: Kategorien a–g vorgeschlagen
    await page.getByText('e – Ausführen von Druckaufträgen').waitFor();
    assert.deepEqual(await runAxe(page), [], 'Schritt 3');
    await page.getByRole('button', { name: 'Lernjournal anlegen' }).click();

    await page.getByRole('heading', { level: 1, name: 'Willkommen, Lea' }).waitFor();
    for (const f of ['journal.sqlite', 'media', 'backups', 'exports', 'project.lock']) {
      assert.ok(existsSync(path.join(projectPath, f)), `${f} fehlt`);
    }
  } finally {
    await app.close();
  }
  // Nach dem Beenden ist die Sperre freigegeben
  assert.equal(existsSync(path.join(projectPath, 'project.lock')), false, 'Sperre nicht freigegeben');

  // Neustart mit denselben Benutzerdaten: Projekt wird automatisch geöffnet
  const second = await launchApp({ withProject: false, dir });
  try {
    await second.page.getByRole('heading', { level: 1, name: 'Willkommen, Lea' }).waitFor();
    await second.page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('button', { name: 'Einstellungen' })
      .click();
    assert.equal(await second.page.getByLabel(/Lehrbetrieb/).inputValue(), 'Druckerei Beispiel AG');
    assert.equal(await second.page.getByLabel(/Lehrbeginn/).inputValue(), '2025-08-04');
    assert.equal(await second.page.getByTestId('project-path').textContent(), projectPath);
  } finally {
    await second.app.close();
  }
});

test('Einstellungen: Profil ändern, speichern, barrierefrei; Projekt schliessen und wieder öffnen', async () => {
  const { app, page } = await launchApp();
  try {
    await page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('button', { name: 'Einstellungen' })
      .click();
    assert.deepEqual(await runAxe(page), []);
    await page.getByRole('radio', { name: 'Printmediatechnik' }).check();
    await page.getByRole('button', { name: 'Profil speichern' }).click();
    await page.getByTestId('statusbar-live').getByText('Profil gespeichert.').waitFor();

    await page.getByRole('button', { name: 'Projekt schliessen' }).click();
    await page.locator('#welcome-title').waitFor();
    await page.getByRole('button', { name: /Mein Lernjournal/ }).click();
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).waitFor();
    await page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('button', { name: 'Einstellungen' })
      .click();
    assert.equal(await page.getByRole('radio', { name: 'Printmediatechnik' }).isChecked(), true);
  } finally {
    await app.close();
  }
});

test('Renderer kann keine beliebigen Ordner anlegen oder öffnen', async () => {
  const { app, page, dir } = await launchApp();
  try {
    const fremd = path.join(dir, 'nicht-freigegeben');
    const r = await page.evaluate(async (p) => {
      const profile = { displayName: '', company: null, apprenticeshipStart: null, specialization: 'print' };
      const created = await window.lernjournal.project.create({
        path: p,
        title: 'X',
        profile,
        seedCategories: false,
      });
      const opened = await window.lernjournal.project.open({ path: 'C:\\\\Windows' });
      return [created.ok && created.data.status, opened.ok && opened.data.status];
    }, fremd);
    assert.deepEqual(r, ['not-allowed', 'not-allowed']);
    assert.equal(existsSync(fremd), false);
  } finally {
    await app.close();
  }
});

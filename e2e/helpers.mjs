// Gemeinsamer Start der gebauten App für alle E2E-Tests.
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

// In Linux-Containern als root braucht Chromium --no-sandbox (betrifft nur die
// OS-Sandbox des Testlaufs; die App-Einstellung sandbox:true bleibt aktiv).
const extraArgs = process.env.E2E_EXTRA_ARGS ? process.env.E2E_EXTRA_ARGS.split(' ') : [];

// Startet die App mit eigenem Testordner (Benutzerdaten + «Dokumente»), damit
// Tests nie echte Daten berühren. Mit withProject wird über den Assistenten ein
// Projekt angelegt. dir erlaubt einen Neustart mit denselben Daten.
export async function launchApp({ withProject = true, dir } = {}) {
  const e2eDir = dir ?? mkdtempSync(path.join(tmpdir(), 'lj-e2e-'));
  const app = await electron.launch({
    args: [...extraArgs, '.'],
    env: { ...process.env, NODE_ENV: 'production', LERNJOURNAL_E2E_DIR: e2eDir },
  });
  const page = await app.firstWindow();
  // Warten, bis entweder der Startbildschirm oder die App-Shell da ist
  await page.waitForSelector('#welcome-title, [aria-label="Hauptnavigation"]', { timeout: 15000 });
  if (withProject && (await page.locator('#welcome-title').count())) await createProjectViaWizard(page);
  return { app, page, dir: e2eDir };
}

export async function createProjectViaWizard(page, { name = 'Lea Muster' } = {}) {
  await page.getByRole('button', { name: /Neues Lernjournal anlegen/ }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel('Dein Name').fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Lernjournal anlegen' }).click();
  await page.waitForSelector('[aria-label="Hauptnavigation"]', { timeout: 15000 });
}

// axe-core (Barrierefreiheitsprüfung) in die Seite laden. page.evaluate
// umgeht die CSP der App bewusst nur im Test – die App selbst lädt kein axe.
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

export async function runAxe(page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
  });
}

// Welcher Bereich (data-region) hat gerade den Fokus?
export function focusedRegion(page) {
  return page.evaluate(
    () => document.activeElement?.closest('[data-region]')?.getAttribute('data-region') ?? null,
  );
}

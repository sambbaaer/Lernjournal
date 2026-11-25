import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, runAxe, waitForNewSave } from './helpers.mjs';

let app;
let page;
let token;
let endpoint;
let lastId = 0;
let sourceId;
let targetId;

const nav = (name) =>
  page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name, exact: true });
const panel = () => page.getByRole('tabpanel', { name: 'MCP', exact: true });
const draftPermission = () =>
  panel().getByRole('checkbox', { name: 'Neue Journalentwürfe vorschlagen erlauben' });

async function setDraftPermission(checked) {
  await draftPermission().click();
  await panel()
    .getByRole('checkbox', { name: 'Neue Journalentwürfe vorschlagen erlauben', checked })
    .waitFor();
}
const editor = () => page.getByRole('textbox', { name: 'Durchführung', exact: true });

async function newJournal(title, text) {
  await page.keyboard.press('Control+N');
  await page.waitForFunction(() => document.querySelector('#journal-title')?.value === '');
  const titleField = page.getByLabel('Titel des Journals');
  await waitForNewSave(page, () => titleField.fill(title));
  if (text) {
    await editor().click();
    await waitForNewSave(page, () => page.keyboard.insertText(text));
  }
}

function post(method, params, headers = {}) {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-11-25',
      authorization: `Bearer ${token}`,
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++lastId, method, params }),
    signal: AbortSignal.timeout(8000),
  });
}

async function rpc(method, params) {
  const response = await post(method, params);
  assert.equal(response.status, 200);
  const text = await response.text();
  const data = response.headers.get('content-type')?.startsWith('text/event-stream')
    ? text
        .split(/\r?\n/)
        .find((line) => line.startsWith('data: {'))
        ?.slice(6)
    : text;
  assert.ok(data, 'Antwort des MCP-Servers');
  const message = JSON.parse(data);
  assert.ok(message.result, JSON.stringify(message.error));
  return message.result;
}

async function call(name, args, failure = false) {
  const result = await rpc('tools/call', { name, arguments: args });
  assert.equal(Boolean(result.isError), failure, JSON.stringify(result.content));
  return failure ? result.content[0].text : (result.structuredContent ?? JSON.parse(result.content[0].text));
}

before(async () => {
  ({ app, page } = await launchApp());
  await newJournal('Prüfjournal Farbdichte', 'Farbprofil kontrollieren.');
  await newJournal('Kalibrierung am Druckbogen');
  await nav('Einstellungen').click();
  await page.getByRole('tab', { name: 'MCP', exact: true }).click();
});

after(async () => {
  await app?.close();
});

test('MCP erfordert eine lokale Freigabe und einen gültigen Zugangsschlüssel', async () => {
  await panel().getByRole('button', { name: 'MCP für dieses Projekt aktivieren' }).click();
  await panel()
    .getByText(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
    .waitFor();
  endpoint = await panel().locator('code').textContent();
  await app.evaluate(({ clipboard }) => {
    clipboard.writeText = (text) => {
      globalThis.__mcpTestClipboard = text;
    };
  });
  await panel().getByRole('button', { name: 'Zugangsschlüssel kopieren' }).click();
  await panel().getByText('Zugangsschlüssel kopiert.').waitFor();
  token = await app.evaluate(() => globalThis.__mcpTestClipboard);
  assert.equal(token.length, 43);
  assert.equal((await post('tools/list', {}, { authorization: 'Bearer ungueltig' })).status, 401);
  assert.equal((await post('tools/list', {}, { origin: 'https://example.org' })).status, 403);
  const init = await rpc('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'Testclient', version: '1.0' },
  });
  assert.equal(init.serverInfo.name, 'Lernjournal');
  const { tools } = await rpc('tools/list', {});
  assert.deepEqual(
    tools.map(({ name }) => name),
    [
      'journal_search',
      'journal_read',
      'journal_propose_edit',
      'journal_propose_link',
      'journal_propose_draft',
      'proposal_status',
    ],
  );
  assert.equal(await draftPermission().isChecked(), false);
  assert.deepEqual(await runAxe(page), []);
});

test('Bestehende Journale suchen, lesen, überarbeiten und verknüpfen', async () => {
  const found = await call('journal_search', { query: 'Farbprofil' });
  [sourceId] = found.journals.map(({ id }) => id);
  assert.ok(sourceId);
  const { journals } = await call('journal_search', {});
  targetId = journals.find(({ title }) => title === 'Kalibrierung am Druckbogen').id;
  const before = await call('journal_read', { id: sourceId });
  const args = {
    id: sourceId,
    revision: before.revision,
    edits: [{ kind: 'replace_text', sectionId: 'durchfuehrung', before: 'kontrollieren', after: 'prüfen' }],
  };
  const pending = await call('journal_propose_edit', args);
  assert.equal(pending.status, 'pending');
  assert.equal((await call('journal_propose_edit', args)).proposalId, pending.proposalId);
  assert.equal((await call('journal_read', { id: sourceId })).revision, before.revision);
  const edit = panel().getByRole('article').filter({ hasText: 'Überarbeitung' });
  await edit.getByText('kontrollieren', { exact: false }).waitFor();
  await edit.getByText('prüfen', { exact: false }).waitFor();
  await edit.getByRole('button', { name: 'Übernehmen' }).click();
  await edit.waitFor({ state: 'detached' });
  assert.equal((await call('proposal_status', { proposalId: pending.proposalId })).status, 'applied');
  assert.equal(
    (await call('journal_read', { id: sourceId, sectionId: 'durchfuehrung' })).section.text,
    'Farbprofil prüfen.',
  );
  assert.match(await call('journal_propose_edit', args, true), /Lies es erneut/);

  await call('journal_propose_link', { id: sourceId, otherId: targetId });
  const link = panel().getByRole('article').filter({ hasText: 'Verknüpfung' });
  await link.getByText('Mit «Kalibrierung am Druckbogen» verknüpfen.').waitFor();
  await link.getByRole('button', { name: 'Übernehmen' }).click();
  await link.waitFor({ state: 'detached' });
  assert.equal((await call('journal_read', { id: targetId })).linked[0].id, sourceId);
});

test('Zwischenzeitliche Änderungen haben Vorrang vor MCP-Vorschlägen', async () => {
  const { revision } = await call('journal_read', { id: sourceId });
  const proposal = await call('journal_propose_edit', {
    id: sourceId,
    revision,
    edits: [{ kind: 'append_paragraph', sectionId: 'durchfuehrung', text: 'Vorgeschlagener Nachtrag' }],
  });
  await nav('Journale').click();
  await page.getByRole('row', { name: /Prüfjournal Farbdichte/ }).dblclick();
  await editor().click();
  await waitForNewSave(page, () => page.keyboard.insertText(' Eigene Korrektur.'));
  await page.getByRole('button', { name: 'MCP-Vorschläge (1)' }).click();
  await panel().getByRole('button', { name: 'Übernehmen' }).click();
  await panel().getByText('Das Journal wurde inzwischen geändert.', { exact: false }).waitFor();
  assert.equal((await call('proposal_status', { proposalId: proposal.proposalId })).status, 'stale');
  const current = await call('journal_read', { id: sourceId, sectionId: 'durchfuehrung' });
  assert.match(current.section.text, /Eigene Korrektur/);
  assert.doesNotMatch(current.section.text, /Vorgeschlagener Nachtrag/);
});

test('Zugangsschlüssel bleibt nach erneuter Freigabe gleich, «automatisch aktivieren» wird gemerkt', async () => {
  await panel().getByRole('button', { name: 'MCP deaktivieren' }).click();
  await panel().getByRole('button', { name: 'MCP für dieses Projekt aktivieren' }).click();
  await panel().getByRole('button', { name: 'MCP deaktivieren' }).waitFor();
  await panel().getByRole('button', { name: 'Zugangsschlüssel kopieren' }).click();
  await panel().getByText('Zugangsschlüssel kopiert.').waitFor();
  assert.equal(await app.evaluate(() => globalThis.__mcpTestClipboard), token);
  // Einrichtung für Claude Code enthält Adresse und denselben Schlüssel
  await panel().getByRole('button', { name: 'Befehl für Claude Code kopieren' }).click();
  await panel()
    .getByText(/^Befehl für Claude Code kopiert/)
    .waitFor();
  assert.equal(
    await app.evaluate(() => globalThis.__mcpTestClipboard),
    `claude mcp add --transport http lernjournal ${endpoint} --header "Authorization: Bearer ${token}"`,
  );
  const auto = panel().getByRole('checkbox', { name: /Beim Öffnen eines Projekts automatisch aktivieren/ });
  assert.equal(await auto.isChecked(), false);
  await auto.click();
  await panel()
    .getByRole('checkbox', { name: /Beim Öffnen eines Projekts automatisch aktivieren/, checked: true })
    .waitFor();
  assert.equal((await post('tools/list', {})).status, 200);
  assert.deepEqual(await runAxe(page), []);
});

test('Ein neuer Entwurf braucht eine separate Berechtigung und eine Einzelbestätigung', async () => {
  const args = {
    title: 'Neuer Entwurf zur Messung',
    sections: { auftrag: 'Dichte der Volltonfelder prüfen.' },
  };
  assert.match(await call('journal_propose_draft', args, true), /nicht freigegeben/);
  await setDraftPermission(true);
  const withdrawn = await call('journal_propose_draft', args);
  await setDraftPermission(false);
  assert.equal((await call('proposal_status', { proposalId: withdrawn.proposalId })).status, 'rejected');
  await setDraftPermission(true);
  const { proposalId } = await call('journal_propose_draft', args);
  assert.equal((await call('journal_search', {})).journals.length, 2);
  await panel().getByRole('button', { name: 'Entwurf anlegen' }).click();
  await panel().getByText('Vorschlag übernommen.').waitFor();
  const { journalId } = await call('proposal_status', { proposalId });
  const draft = await call('journal_read', { id: journalId });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.sections[0].text, args.sections.auftrag);

  await page.getByRole('tab', { name: 'Allgemein', exact: true }).click();
  await page.getByRole('button', { name: 'Projekt schliessen', exact: true }).click();
  await page.getByRole('heading', { name: 'Lernjournal', exact: true }).waitFor();
  await assert.rejects(post('tools/list', {}));
});

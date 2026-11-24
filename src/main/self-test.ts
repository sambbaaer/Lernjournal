// Selbsttest des fertigen Programms (AJ-16, ADR 0007).
//
// Warum im Programm? Die Electron-Fuses schalten im gepackten Build den
// Debugger ab – Playwright kann sich nicht verbinden (ADR 0003). Darum steuert
// sich das Programm über eine Umgebungsvariable selbst: Es ruft aus der echten,
// gesandboxten Oberfläche die Brücke window.lernjournal auf (Preload → IPC-
// Prüfung → Hauptprozess, wie bei einer Bedienung), prüft die Ergebnisse,
// schreibt einen Bericht und beendet sich.
//
//   LERNJOURNAL_SMOKE_TEST=1        nur Brücke und Sandbox prüfen (Rauchtest)
//   LERNJOURNAL_SMOKE_TEST=create   Projekt anlegen, Journal mit Bild schreiben,
//                                   suchen, Word- und .ajournal-Export, schliessen
//   LERNJOURNAL_SMOKE_TEST=reopen   nach einem Neustart: Projekt öffnet von selbst,
//                                   Inhalt, Suche und Sicherung da, Import der
//                                   .ajournal-Datei in einen neuen Ordner
//   LERNJOURNAL_SMOKE_DIR=<Ordner>  Arbeitsordner (Pflicht für create/reopen):
//                                   Benutzerdaten und «Dokumente» liegen dort,
//                                   echte Daten bleiben unberührt.
//
// Ohne LERNJOURNAL_SMOKE_TEST tut dieses Modul nichts. Im Selbsttest bestätigen
// Speichern-Dialoge den Vorschlag, ohne sich zu zeigen (index.ts).
// Ablauf von aussen inkl. Netzwerkprotokoll: scripts/self-test.mjs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { LernjournalApi } from '@shared/api';

export const SELF_TEST_ENV = 'LERNJOURNAL_SMOKE_TEST';
export const SELF_TEST_DIR_ENV = 'LERNJOURNAL_SMOKE_DIR';
// So lange darf ein Durchgang höchstens dauern, dann gilt er als gescheitert
export const SELF_TEST_TIMEOUT_MS = 120_000;

export type SelfTestMode = 'bridge' | 'create' | 'reopen';
export type SelfTestConfig = { mode: SelfTestMode; dir: string | null };

export class SelfTestConfigError extends Error {}

export function readSelfTestConfig(env: Readonly<Record<string, string | undefined>>): SelfTestConfig | null {
  const value = env[SELF_TEST_ENV];
  if (!value) return null;
  const mode = value === '1' ? 'bridge' : value === 'create' || value === 'reopen' ? value : null;
  if (!mode) throw new SelfTestConfigError(`${SELF_TEST_ENV}=${value}: erlaubt sind 1, create, reopen`);
  const dir = env[SELF_TEST_DIR_ENV] || null;
  if (dir !== null && !path.isAbsolute(dir)) {
    throw new SelfTestConfigError(`${SELF_TEST_DIR_ENV} muss ein absoluter Pfad sein`);
  }
  if (mode !== 'bridge' && dir === null) throw new SelfTestConfigError(`${SELF_TEST_DIR_ENV} fehlt`);
  return { mode, dir: dir === null ? null : path.resolve(dir) };
}

export function reportFile(dir: string, mode: SelfTestMode): string {
  return path.join(dir, `selbsttest-${mode}.json`);
}

// Was während eines Durchgangs ausserhalb der Oberfläche beobachtet wird
export class SelfTestRun {
  // Von Speichern-Dialogen «bestätigte» Dateien
  readonly saved: string[] = [];
  // Von session.webRequest blockierte Anfragen (dürfte es nicht geben)
  readonly blockedRequests: string[] = [];
  // Ereignisse der Rechtschreibprüfung (Wörterbuch-Download versucht?)
  readonly spellcheck: string[] = [];
  constructor(readonly config: SelfTestConfig) {}
}

// ---------------------------------------------------------------------------
// Abläufe in der Oberfläche. Diese Funktionen werden als Text in das Fenster
// geschickt (Function.toString) – sie dürfen darum nichts aus diesem Modul
// verwenden, sondern nur, was in `ctx` steckt.
// ---------------------------------------------------------------------------

export type FlowContext = {
  api: LernjournalApi;
  // Kleines WebP-Bild, im Fenster erzeugt (prüft auch die Umwandlung für Word)
  makeWebp: () => Promise<Uint8Array<ArrayBuffer>>;
  probe: { noRequire: boolean; noProcess: boolean; uiReady: boolean };
  texts: { projectTitle: string; journalTitle: string; marker: string };
};
export type FlowResult = { steps: Record<string, unknown>; problems: string[] };

export async function bridgeFlow(ctx: FlowContext): Promise<FlowResult> {
  const problems: string[] = [];
  if (!ctx.probe.noRequire || !ctx.probe.noProcess) problems.push('Oberfläche hat Zugriff auf Node.js');
  const info = await ctx.api.app.getInfo();
  if (!info.ok) problems.push(`app:getInfo: ${info.error.message}`);
  return { steps: { info: info.ok ? info.data : null, probe: ctx.probe }, problems };
}

export async function createFlow(ctx: FlowContext): Promise<FlowResult> {
  const { api, texts } = ctx;
  const steps: Record<string, unknown> = { probe: ctx.probe };
  const problems: string[] = [];
  const need = (ok: boolean, problem: string) => {
    if (!ok) problems.push(problem);
  };
  const data = <T>(
    label: string,
    r: { ok: true; data: T } | { ok: false; error: { message: string } },
  ): T => {
    if (!r.ok) throw new Error(`${label}: ${r.error.message}`);
    return r.data;
  };
  need(ctx.probe.noRequire && ctx.probe.noProcess, 'Oberfläche hat Zugriff auf Node.js');
  need(ctx.probe.uiReady, 'Oberfläche wurde nicht angezeigt');
  steps.info = data('app:getInfo', await api.app.getInfo());

  const state = data('project:getState', await api.project.getState());
  need(state.project === null, 'Beim Start war schon ein Projekt offen (Arbeitsordner nicht leer?)');
  const created = data(
    'project:create',
    await api.project.create({
      path: state.suggestedLocation,
      title: texts.projectTitle,
      profile: {
        displayName: 'Selbsttest',
        company: null,
        apprenticeshipStart: '2025-08-01',
        specialization: 'print',
      },
      seedCategories: true,
    }),
  );
  if (created.status !== 'opened') throw new Error(`Projekt nicht angelegt: ${created.status}`);
  steps.project = created.project.path;

  const journal = data('journal:create', await api.journal.create());
  data(
    'journal:updateMeta',
    await api.journal.updateMeta({
      id: journal.id,
      meta: {
        title: texts.journalTitle,
        workDate: '2026-03-14',
        learningPlace: 'betrieb',
        schoolYearOverride: null,
      },
    }),
  );
  const image = data(
    'media:add',
    await api.media.add({
      journalId: journal.id,
      data: await ctx.makeWebp(),
      originalName: 'selbsttest.webp',
    }),
  );
  const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  data(
    'journal:updateSections',
    await api.journal.updateSections({
      id: journal.id,
      sections: {
        auftrag: { type: 'doc', content: [paragraph(`Auftrag mit ${texts.marker}`)] },
        durchfuehrung: {
          type: 'doc',
          content: [
            paragraph('Ohne Netzwerk geschrieben.'),
            { type: 'figure', attrs: { mediaId: image.id, caption: `Bild zu ${texts.marker}`, alt: '' } },
          ],
        },
        reflexion: { type: 'doc', content: [paragraph('Alles lokal gespeichert.')] },
      },
    }),
  );
  steps.journal = journal.id;

  const found = data('search:query', await api.search.query({ query: texts.marker, includeArchived: false }));
  need(
    found.hits.some((h) => h.id === journal.id),
    'Suche findet das neue Journal nicht',
  );

  const docx = data(
    'export:journalDocx',
    await api.export.journalDocx({ id: journal.id, noticeAccepted: true }),
  );
  need(docx.status === 'saved', 'Word-Export nicht gespeichert');
  if (docx.status === 'saved') {
    steps.docx = { fileName: docx.fileName, bytes: docx.bytes, warnings: docx.warnings };
    need(docx.warnings.length === 0, `Word-Export mit Hinweisen: ${docx.warnings.join('; ')}`);
  }

  const archive = data('archive:export', await api.archive.export());
  need(archive.status === 'saved', '.ajournal-Export nicht gespeichert');
  if (archive.status === 'saved') {
    steps.archive = { fileName: archive.fileName, bytes: archive.bytes, journals: archive.journals };
    need(archive.journals === 1 && archive.media === 1, '.ajournal enthält nicht 1 Journal und 1 Bild');
  }

  const closed = data('project:close', await api.project.close());
  need(closed.closed, 'Projekt liess sich nicht schliessen');
  return { steps, problems };
}

export async function reopenFlow(ctx: FlowContext): Promise<FlowResult> {
  const { api, texts } = ctx;
  const steps: Record<string, unknown> = { probe: ctx.probe };
  const problems: string[] = [];
  const need = (ok: boolean, problem: string) => {
    if (!ok) problems.push(problem);
  };
  const data = <T>(
    label: string,
    r: { ok: true; data: T } | { ok: false; error: { message: string } },
  ): T => {
    if (!r.ok) throw new Error(`${label}: ${r.error.message}`);
    return r.data;
  };
  need(ctx.probe.noRequire && ctx.probe.noProcess, 'Oberfläche hat Zugriff auf Node.js');
  need(ctx.probe.uiReady, 'Oberfläche wurde nicht angezeigt');

  // Nach dem Neustart öffnet das zuletzt verwendete Projekt von selbst (SPEC P0-1)
  const state = data('project:getState', await api.project.getState());
  if (state.project?.title !== texts.projectTitle)
    throw new Error('Projekt wurde nach dem Neustart nicht geöffnet');
  steps.project = state.project.path;

  const list = data('journal:list', await api.journal.list({ includeArchived: false }));
  const entry = list.find((j) => j.title === texts.journalTitle);
  if (!entry) throw new Error('Journal fehlt nach dem Neustart');
  const detail = data('journal:get', await api.journal.get({ id: entry.id }));
  const content = JSON.stringify(detail.sections);
  need(
    content.includes(texts.marker) && content.includes('"figure"'),
    'Inhalt oder Bild fehlt nach dem Neustart',
  );

  const found = data('search:query', await api.search.query({ query: texts.marker, includeArchived: false }));
  need(
    found.hits.some((h) => h.id === entry.id),
    'Suche findet das Journal nach dem Neustart nicht',
  );

  const backups = data('backup:list', await api.backup.list());
  steps.backups = backups.backups.length;
  need(backups.backups.length > 0, 'Keine Sicherung vorhanden (Sicherung beim Schliessen?)');
  need(backups.lastError === null, `Sicherung meldet Fehler: ${backups.lastError}`);

  const closed = data('project:close', await api.project.close());
  need(closed.closed, 'Projekt liess sich nicht schliessen');
  return { steps, problems };
}

export const FLOWS: Record<SelfTestMode, (ctx: FlowContext) => Promise<FlowResult>> = {
  bridge: bridgeFlow,
  create: createFlow,
  reopen: reopenFlow,
};

export const SELF_TEST_TEXTS: FlowContext['texts'] = {
  projectTitle: 'Selbsttest',
  journalTitle: 'Offline-Selbsttest',
  marker: 'Spektralfotometer',
};

// Skript für webContents.executeJavaScript: baut `ctx` im Fenster und ruft den Ablauf
export function rendererScript(mode: SelfTestMode): string {
  return `(async () => {
    const ready = () => document.querySelector('#welcome-title, [aria-label="Hauptnavigation"]') !== null;
    for (let i = 0; i < 150 && !ready(); i++) await new Promise((r) => setTimeout(r, 100));
    const ctx = {
      api: window.lernjournal,
      makeWebp: async () => {
        const canvas = new OffscreenCanvas(64, 48);
        const g = canvas.getContext('2d');
        g.fillStyle = '#0e5a66';
        g.fillRect(0, 0, 64, 48);
        g.fillStyle = '#f2b233';
        g.fillRect(8, 8, 24, 16);
        const blob = await canvas.convertToBlob({ type: 'image/webp' });
        return new Uint8Array(await blob.arrayBuffer());
      },
      probe: { noRequire: typeof require === 'undefined', noProcess: typeof process === 'undefined', uiReady: ready() },
      texts: ${JSON.stringify(SELF_TEST_TEXTS)},
    };
    try {
      return await (${FLOWS[mode].toString()})(ctx);
    } catch (e) {
      return { steps: {}, problems: ['Abbruch: ' + (e && e.message ? e.message : String(e))] };
    }
  })()`;
}

// ---------------------------------------------------------------------------
// Prüfungen im Hauptprozess nach dem Ablauf in der Oberfläche
// ---------------------------------------------------------------------------

// Eine Word-Datei ist ein ZIP mit word/document.xml
export function checkDocxFile(file: string | undefined): string[] {
  if (!file) return ['Word-Export: kein Speicherort'];
  if (!existsSync(file)) return [`Word-Export fehlt: ${file}`];
  const bytes = readFileSync(file);
  const problems: string[] = [];
  if (bytes.length < 2000) problems.push(`Word-Export auffällig klein (${bytes.length} Bytes)`);
  if (bytes.subarray(0, 2).toString('latin1') !== 'PK') problems.push('Word-Export ist keine ZIP-Datei');
  if (!bytes.includes('word/document.xml')) problems.push('Word-Export ohne word/document.xml');
  if (!bytes.includes('word/media/')) problems.push('Word-Export ohne Bild');
  return problems;
}

// Die .ajournal-Datei aus dem ersten Durchgang (Ordner «Dokumente» des Selbsttests)
export function findArchive(documentsDir: string): string | null {
  if (!existsSync(documentsDir)) return null;
  const files = readdirSync(documentsDir)
    .filter((f) => f.endsWith('.ajournal'))
    .map((f) => path.join(documentsDir, f))
    .filter((f) => statSync(f).isFile());
  return files.length === 1 ? files[0]! : null;
}

export type SelfTestReport = {
  mode: SelfTestMode;
  pass: boolean;
  problems: string[];
  steps: Record<string, unknown>;
  blockedRequests: string[];
  spellcheck: string[];
  environment: Record<string, unknown>;
};

export function buildReport(
  run: SelfTestRun,
  flow: FlowResult | null,
  extraProblems: string[],
  environment: Record<string, unknown>,
): SelfTestReport {
  const problems = [
    ...(flow ? flow.problems : ['Ablauf in der Oberfläche lieferte kein Ergebnis']),
    ...extraProblems,
    ...run.blockedRequests.map((u) => `Blockierte Netzwerkanfrage: ${u}`),
  ];
  return {
    mode: run.config.mode,
    pass: problems.length === 0,
    problems,
    steps: flow?.steps ?? {},
    blockedRequests: run.blockedRequests,
    spellcheck: run.spellcheck,
    environment,
  };
}

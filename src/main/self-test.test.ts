// Selbsttest des fertigen Programms (AJ-16): Konfiguration, Abläufe mit einer
// nachgebauten Brücke, das Skript für das Fenster (in einer leeren JS-Umgebung,
// wie es Function.toString verlangt) und die Prüfungen im Hauptprozess.
// Den echten Durchlauf prüfen e2e/self-test.test.mjs und die Windows-CI.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { LernjournalApi } from '@shared/api';
import { newJournalSections } from '@shared/journal-templates';
import {
  buildReport,
  checkDocxFile,
  createFlow,
  findArchive,
  readSelfTestConfig,
  rendererScript,
  reopenFlow,
  reportFile,
  SELF_TEST_TEXTS,
  SelfTestConfigError,
  SelfTestRun,
  type FlowContext,
} from './self-test';

const ok = <T>(data: T) => Promise.resolve({ ok: true as const, data });
const fail = (message: string) =>
  Promise.resolve({ ok: false as const, error: { code: 'INTERNAL', message } });

// Nachgebaute Brücke mit genau dem, was die Abläufe brauchen
function fakeApi(overrides: Record<string, unknown> = {}) {
  const journalId = '11111111-1111-4111-8111-111111111111';
  const calls: string[] = [];
  const track =
    <A extends unknown[], R>(name: string, fn: (...a: A) => R) =>
    (...a: A) => {
      calls.push(name);
      return fn(...a);
    };
  let projectOpen = false;
  let mcpEndpoint: string | null = null;
  let sections: unknown = null;
  const api = {
    app: { getInfo: track('getInfo', () => ok({ name: 'Lernjournal', version: '0.1.0' })) },
    project: {
      getState: track('getState', () =>
        ok({
          project: projectOpen ? { title: SELF_TEST_TEXTS.projectTitle, path: '/p' } : null,
          recent: [],
          suggestedLocation: '/Dokumente/Lernjournal',
        }),
      ),
      create: track('create', () => {
        projectOpen = true;
        return ok({ status: 'opened', project: { path: '/Dokumente/Lernjournal' } });
      }),
      close: track('close', () => {
        mcpEndpoint = null;
        return ok({ closed: true });
      }),
    },
    journal: {
      create: track('journal.create', () => ok({ id: journalId, sections: newJournalSections() })),
      updateMeta: track('updateMeta', () => ok({})),
      updateSections: track('updateSections', (req: { sections: unknown }) => {
        sections = req.sections;
        return ok({});
      }),
      list: track('list', () => ok([{ id: journalId, title: SELF_TEST_TEXTS.journalTitle }])),
      get: track('get', () => ok({ id: journalId, sections })),
    },
    media: { add: track('media.add', () => ok({ id: 'bild', width: 64, height: 48, mime: 'image/webp' })) },
    search: { query: track('search', () => ok({ hits: [{ id: journalId }], truncated: false })) },
    mcp: {
      status: track('mcp.status', () => ok({ endpoint: mcpEndpoint, allowDrafts: false, proposals: [] })),
      setActive: track('mcp.setActive', () => {
        mcpEndpoint = 'http://127.0.0.1:47651/mcp';
        return ok({ endpoint: mcpEndpoint, allowDrafts: false, proposals: [] });
      }),
    },
    export: {
      journalDocx: track('docx', () =>
        ok({ status: 'saved', fileName: 'a.docx', bytes: 9000, warnings: [] }),
      ),
      journalPdf: track('pdf', () => ok({ status: 'saved', fileName: 'a.pdf', bytes: 8000, warnings: [] })),
    },
    archive: {
      export: track('archive', () =>
        ok({ status: 'saved', fileName: 'a.ajournal', bytes: 5000, journals: 1, media: 1, warnings: [] }),
      ),
    },
    backup: { list: track('backup.list', () => ok({ backups: [{ id: 'x' }], lastError: null })) },
    ...overrides,
  };
  return {
    api: api as unknown as LernjournalApi,
    calls,
    open: () => (projectOpen = true),
    setSections: (s: unknown) => (sections = s),
  };
}

function ctxWith(api: LernjournalApi, probe: Partial<FlowContext['probe']> = {}): FlowContext {
  return {
    api,
    makeWebp: async () => new Uint8Array([1, 2, 3]),
    probe: { noRequire: true, noProcess: true, uiReady: true, ...probe },
    texts: SELF_TEST_TEXTS,
  };
}

describe('Konfiguration über Umgebungsvariablen', () => {
  const dir = path.resolve(tmpdir(), 'lj-test');

  it('ohne Variable kein Selbsttest', () => {
    expect(readSelfTestConfig({})).toBeNull();
    expect(readSelfTestConfig({ LERNJOURNAL_SMOKE_TEST: '' })).toBeNull();
  });

  it('1 = Rauchtest der Brücke, Arbeitsordner freiwillig', () => {
    expect(readSelfTestConfig({ LERNJOURNAL_SMOKE_TEST: '1' })).toEqual({ mode: 'bridge', dir: null });
    expect(readSelfTestConfig({ LERNJOURNAL_SMOKE_TEST: '1', LERNJOURNAL_SMOKE_DIR: dir })).toEqual({
      mode: 'bridge',
      dir,
    });
  });

  it('create/reopen brauchen einen absoluten Arbeitsordner', () => {
    expect(readSelfTestConfig({ LERNJOURNAL_SMOKE_TEST: 'create', LERNJOURNAL_SMOKE_DIR: dir })).toEqual({
      mode: 'create',
      dir,
    });
    expect(() => readSelfTestConfig({ LERNJOURNAL_SMOKE_TEST: 'reopen' })).toThrow(SelfTestConfigError);
    expect(() =>
      readSelfTestConfig({ LERNJOURNAL_SMOKE_TEST: 'create', LERNJOURNAL_SMOKE_DIR: 'relativ' }),
    ).toThrow(/absoluter Pfad/);
  });

  it('unbekannte Werte werden abgelehnt', () => {
    expect(() => readSelfTestConfig({ LERNJOURNAL_SMOKE_TEST: 'ja' })).toThrow(
      /erlaubt sind 1, create, reopen/,
    );
  });

  it('Bericht je Phase im Arbeitsordner', () => {
    expect(reportFile(dir, 'create')).toBe(path.join(dir, 'selbsttest-create.json'));
  });
});

describe('Ablauf «create»', () => {
  it('legt Projekt und Journal mit Bild an, sucht, exportiert und schliesst', async () => {
    const f = fakeApi();
    const r = await createFlow(ctxWith(f.api));
    expect(r.problems).toEqual([]);
    expect(f.calls).toEqual([
      'getInfo',
      'getState',
      'create',
      'journal.create',
      'updateMeta',
      'media.add',
      'updateSections',
      'search',
      'docx',
      'pdf',
      'archive',
      'mcp.status',
      'mcp.setActive',
      'close',
      'mcp.status',
    ]);
    expect(r.steps).toMatchObject({ project: '/Dokumente/Lernjournal', docx: { fileName: 'a.docx' } });
  });

  it('meldet Node-Zugriff, fehlende Oberfläche, Suchfehler und Export-Hinweise', async () => {
    const f = fakeApi({
      search: { query: () => ok({ hits: [], truncated: false }) },
      export: {
        journalDocx: () => ok({ status: 'saved', fileName: 'a.docx', bytes: 1, warnings: ['Bild fehlt'] }),
        journalPdf: () => ok({ status: 'saved', fileName: 'a.pdf', bytes: 8000, warnings: [] }),
      },
    });
    const r = await createFlow(ctxWith(f.api, { noProcess: false, uiReady: false }));
    expect(r.problems).toEqual([
      'Oberfläche hat Zugriff auf Node.js',
      'Oberfläche wurde nicht angezeigt',
      'Suche findet das neue Journal nicht',
      'Word-Export mit Hinweisen: Bild fehlt',
    ]);
  });

  it('bricht ab, wenn schon ein Projekt offen ist oder ein Aufruf scheitert', async () => {
    const open = fakeApi();
    open.open();
    const r = await createFlow(ctxWith(open.api));
    expect(r.problems[0]).toMatch(/schon ein Projekt offen/);
    const broken = fakeApi({ media: { add: () => fail('Bild zu gross') } });
    await expect(createFlow(ctxWith(broken.api))).rejects.toThrow('media:add: Bild zu gross');
  });
});

describe('Ablauf «reopen»', () => {
  const sections = { durchfuehrung: { content: [{ type: 'figure' }, { text: SELF_TEST_TEXTS.marker }] } };

  it('findet Projekt, Journal, Inhalt, Suche und Sicherung nach dem Neustart', async () => {
    const f = fakeApi();
    f.open();
    f.setSections(sections);
    const r = await reopenFlow(ctxWith(f.api));
    expect(r.problems).toEqual([]);
    expect(r.steps).toMatchObject({ backups: 1 });
    expect(f.calls.at(-1)).toBe('close');
  });

  it('Projekt nicht automatisch geöffnet → Abbruch', async () => {
    await expect(reopenFlow(ctxWith(fakeApi().api))).rejects.toThrow(/nicht geöffnet/);
  });

  it('meldet fehlenden Inhalt und fehlende Sicherung', async () => {
    const f = fakeApi({ backup: { list: () => ok({ backups: [], lastError: 'Platte voll' }) } });
    f.open();
    f.setSections({ leer: true });
    const r = await reopenFlow(ctxWith(f.api));
    expect(r.problems).toEqual([
      'Inhalt oder Bild fehlt nach dem Neustart',
      'Keine Sicherung vorhanden (Sicherung beim Schliessen?)',
      'Sicherung meldet Fehler: Platte voll',
    ]);
  });
});

describe('Skript für das Fenster', () => {
  // Leere JS-Umgebung wie im Fenster: nur window, document, OffscreenCanvas.
  // Scheitert, sobald ein Ablauf etwas aus dem Modul verwendet.
  async function runInWindow(mode: 'bridge' | 'create', api: LernjournalApi) {
    class OffscreenCanvas {
      getContext() {
        return { fillRect() {}, fillStyle: '' };
      }
      async convertToBlob() {
        return { arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
      }
    }
    const sandbox = {
      window: { lernjournal: api },
      document: { querySelector: () => ({}) },
      OffscreenCanvas,
      setTimeout,
      Uint8Array,
    };
    return vm.runInNewContext(rendererScript(mode), sandbox) as Promise<{ problems: string[] }>;
  }

  it('läuft ohne Zugriff auf das Modul (Function.toString)', async () => {
    expect((await runInWindow('create', fakeApi().api)).problems).toEqual([]);
    expect((await runInWindow('bridge', fakeApi().api)).problems).toEqual([]);
  });

  it('fängt Fehler ab und meldet sie als Problem', async () => {
    const r = await runInWindow('create', fakeApi({ project: { getState: () => fail('kaputt') } }).api);
    expect(r.problems).toEqual(['Abbruch: project:getState: kaputt']);
  });
});

describe('Prüfungen im Hauptprozess', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lj-selbsttest-'));

  it('Word-Datei: ZIP mit document.xml und Bild', () => {
    const good = path.join(dir, 'gut.docx');
    writeFileSync(
      good,
      zipSync(
        {
          'word/document.xml': new TextEncoder().encode('<w:document/>'.repeat(300)),
          'word/media/bild1.png': new Uint8Array(2000).fill(7),
        },
        { level: 0 },
      ),
    );
    expect(checkDocxFile(good)).toEqual([]);
    const bad = path.join(dir, 'schlecht.docx');
    writeFileSync(bad, 'kein zip');
    expect(checkDocxFile(bad)).toEqual([
      'Word-Export auffällig klein (8 Bytes)',
      'Word-Export ist keine ZIP-Datei',
      'Word-Export ohne word/document.xml',
      'Word-Export ohne Bild',
    ]);
    expect(checkDocxFile(undefined)).toEqual(['Word-Export: kein Speicherort']);
    expect(checkDocxFile(path.join(dir, 'fehlt.docx'))[0]).toMatch(/fehlt/);
  });

  it('.ajournal aus dem ersten Durchgang finden (genau eine)', () => {
    const docs = path.join(dir, 'Dokumente');
    expect(findArchive(docs)).toBeNull();
    mkdirSync(path.join(docs, 'Lernjournal'), { recursive: true });
    writeFileSync(path.join(docs, 'a.ajournal'), 'x');
    expect(findArchive(docs)).toBe(path.join(docs, 'a.ajournal'));
    writeFileSync(path.join(docs, 'b.ajournal'), 'x');
    expect(findArchive(docs)).toBeNull();
  });

  it('Bericht: blockierte Netzwerkanfragen und fehlendes Ergebnis sind Fehler', () => {
    const run = new SelfTestRun({ mode: 'create', dir });
    expect(buildReport(run, { steps: {}, problems: [] }, [], {}).pass).toBe(true);
    run.blockedRequests.push('https://example.com/');
    const r = buildReport(run, null, ['Import: nicht 1 Journal'], { platform: 'win32' });
    expect(r.pass).toBe(false);
    expect(r.problems).toEqual([
      'Ablauf in der Oberfläche lieferte kein Ergebnis',
      'Import: nicht 1 Journal',
      'Blockierte Netzwerkanfrage: https://example.com/',
    ]);
    expect(r.environment).toEqual({ platform: 'win32' });
  });
});

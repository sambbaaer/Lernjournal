// Tests der Journal-Verknüpfungen (AJ-10) auf einer echten Projektdatenbank.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ipcContract } from '@shared/ipc';
import { withSectionDocument, type Sections } from '@shared/journal';
import { newJournalSections } from '@shared/journal-templates';
import { journalLinkHref, journalLinkTargets } from '@shared/links';
import { checkIntegrity } from '../db/connection';
import { createIpcDispatcher, type Handlers } from '../ipc-handler';
import { JournalService } from '../journal/journal-service';
import { ProjectService } from '../project/project-service';
import { createLinkHandlers } from './link-handlers';
import { LinkError, LinkService } from './link-service';

let root: string;
let projects: ProjectService;
let journals: JournalService;
let links: LinkService;
let clock = new Date('2026-03-14T09:00:00Z');

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'lj-l-'));
  projects = new ProjectService({
    appVersion: '0.1.0',
    env: {},
    lockEnv: { pid: 1, hostname: 'PC', isProcessAlive: () => true, now: () => new Date() },
  });
  await projects.create({
    dir: path.join(root, 'p'),
    title: 'P',
    profile: { displayName: 'Lea', company: null, apprenticeshipStart: null, specialization: 'print' },
    seedCategories: false,
  });
  clock = new Date('2026-03-14T09:00:00Z');
  links = new LinkService(
    () => projects.db,
    () => clock,
  );
  journals = new JournalService(
    () => projects.db,
    () => projects.dir,
    () => clock,
    undefined,
    links,
  );
});
afterEach(() => {
  projects.close();
  rmSync(root, { recursive: true, force: true });
});

const make = (title: string, workDate = '2026-03-14') => journals.create({ title, workDate }).id;
const ids = (list: { id: string }[]) => list.map((j) => j.id);
const linkCount = () =>
  (projects.db.prepare('SELECT count(*) AS n FROM journal_link').get() as { n: number }).n;

// Abschnitt «Durchführung» mit einem Text-Link auf ein anderes Journal
function withTextLink(targetId: string, word = 'Farbprofil'): Sections {
  return withSectionDocument(newJournalSections(), 'durchfuehrung', {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Siehe ' },
          {
            type: 'text',
            text: word,
            marks: [{ type: 'link', attrs: { href: journalLinkHref(targetId) } }],
          },
        ],
      },
    ],
  });
}

describe('Verknüpfungen', () => {
  it('sind in beiden Journalen sichtbar (Rückverweis) und werden nur einmal gespeichert', () => {
    const a = make('Farbmessung', '2026-03-10');
    const b = make('Proof erstellen', '2026-03-12');
    expect(links.add(a, b)).toBe(true);
    expect(ids(links.list(a).linked)).toEqual([b]);
    expect(ids(links.list(b).linked)).toEqual([a]);
    // Nochmals – auch aus der Gegenrichtung – ändert nichts
    expect(links.add(a, b)).toBe(false);
    expect(links.add(b, a)).toBe(false);
    expect(linkCount()).toBe(1);
  });

  it('liefert frische Titel/Status (keine Kopien) und sortiert nach Arbeitsdatum', () => {
    const a = make('A');
    const alt = make('Alt', '2025-09-01');
    const neu = make('Neu', '2026-02-01');
    links.add(a, alt);
    links.add(neu, a); // in der Gegenrichtung angelegt
    journals.updateMeta(alt, {
      title: 'Alt, umbenannt',
      workDate: '2025-09-01',
      learningPlace: 'betrieb',
      schoolYearOverride: null,
    });
    journals.setStatus(alt, 'archived');
    expect(links.list(a).linked).toEqual([
      { id: neu, title: 'Neu', workDate: '2026-02-01', status: 'draft' },
      { id: alt, title: 'Alt, umbenannt', workDate: '2025-09-01', status: 'archived' },
    ]);
  });

  it('lösen geht aus beiden Journalen; die Journale bleiben bestehen', () => {
    const a = make('A');
    const b = make('B');
    links.add(a, b);
    expect(links.remove(b, a)).toBe(true); // im Ziel gelöst
    expect(links.list(a).linked).toEqual([]);
    expect(links.remove(a, b)).toBe(false); // schon weg: kein Fehler
    expect(journals.list({ includeArchived: true })).toHaveLength(2);
  });

  it('lehnt Selbstlinks und unbekannte Journale verständlich ab', () => {
    const a = make('A');
    expect(() => links.add(a, a)).toThrow(LinkError);
    expect(() => links.add(a, crypto.randomUUID())).toThrow(/gibt es nicht mehr/);
    expect(() => links.list(crypto.randomUUID())).toThrow(LinkError);
    expect(linkCount()).toBe(0);
  });

  it('führt «zuletzt geändert» im Journal nach, in dem verknüpft wurde', () => {
    const a = make('A');
    const b = make('B');
    clock = new Date('2026-03-15T10:00:00Z');
    links.add(a, b);
    expect(journals.summary(a).updatedAt).toBe('2026-03-15T10:00:00.000Z');
    expect(journals.summary(b).updatedAt).toBe('2026-03-14T09:00:00.000Z');
  });

  it('verschwinden mit dem gelöschten Journal (Cascade), Duplikate übernehmen sie nicht', () => {
    const a = make('A');
    const b = make('B');
    links.add(a, b);
    const copy = journals.duplicate(a).id;
    expect(links.list(copy).linked).toEqual([]);
    journals.delete(b);
    expect(links.list(a).linked).toEqual([]);
    expect(linkCount()).toBe(0);
    expect(checkIntegrity(projects.db)).toEqual([]);
  });
});

describe('Links im Text', () => {
  it('erscheinen im Zieljournal als «Erwähnt in»', () => {
    const ziel = make('Farbprofil wählen');
    const quelle = make('Druckauftrag Flyer');
    const fremd = make('Unbeteiligt');
    journals.updateSections(quelle, withTextLink(ziel));
    expect(ids(links.list(ziel).mentionedIn)).toEqual([quelle]);
    expect(links.list(fremd).mentionedIn).toEqual([]);
    // Eine Erwähnung ist keine Verknüpfung (nichts wird zusätzlich gespeichert)
    expect(links.list(ziel).linked).toEqual([]);
    expect(linkCount()).toBe(0);
  });

  it('werden beim Löschen des Ziels entfernt – der Text bleibt, Suchindex folgt', () => {
    const ziel = make('Farbprofil wählen');
    const quelle = make('Druckauftrag Flyer');
    journals.updateSections(quelle, withTextLink(ziel, 'ISO Coated v2'));
    journals.delete(ziel);
    const after = journals.get(quelle);
    expect(journalLinkTargets(after.sections).size).toBe(0);
    expect(JSON.stringify(after.sections)).toContain('ISO Coated v2');
    const fts = projects.db
      .prepare("SELECT journal_id FROM journal_fts WHERE journal_fts MATCH 'coated'")
      .all() as { journal_id: string }[];
    expect(fts.map((r) => r.journal_id)).toEqual([quelle]);
  });

  it('akzeptiert im Editor-Schema nur echte Journal-IDs als internes Ziel', () => {
    const quelle = make('Quelle');
    const bad = withTextLink('x');
    (
      bad.find(({ id }) => id === 'durchfuehrung')!.doc.content as {
        content: { marks?: { attrs: { href: string } }[] }[];
      }[]
    )[0]!.content[1]!.marks![0]!.attrs.href = 'lernjournal://journal/../../etc';
    expect(() => journals.updateSections(quelle, bad)).toThrow(/Link-Ziel/);
  });
});

describe('IPC: Verknüpfungen', () => {
  const trusted = { senderFrame: { url: 'app://lernjournal/index.html' } };
  const dispatcher = () =>
    createIpcDispatcher(createLinkHandlers(links, journals) as unknown as Handlers, (u) =>
      u.startsWith('app://lernjournal/'),
    );

  it('verknüpfen liefert neue Liste und Zusammenfassung; Fehler mit Klartext', async () => {
    const a = make('A');
    const b = make('B');
    const dispatch = dispatcher();
    const res = await dispatch('journal:link', trusted, { id: a, otherId: b });
    expect(res).toMatchObject({ ok: true, data: { journal: { id: a }, links: { linked: [{ id: b }] } } });
    const self = await dispatch('journal:link', trusted, { id: a, otherId: a });
    expect(self).toEqual({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'Ein Journal kann nicht mit sich selbst verknüpft werden.' },
    });
    const removed = await dispatch('journal:unlink', trusted, { id: b, otherId: a });
    expect(removed).toMatchObject({ ok: true, data: { links: { linked: [] } } });
  });

  it('weist IDs ab, die keine UUID sind', () => {
    for (const ch of ['journal:links', 'journal:link', 'journal:unlink'] as const) {
      expect(ipcContract[ch].request.safeParse({ id: "x' OR 1=1 --", otherId: 'y' }).success).toBe(false);
    }
  });
});

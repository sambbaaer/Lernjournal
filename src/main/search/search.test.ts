// Tests der Fachbuch-Suche (AJ-11): Abfrage-Aufbau, Klartextprojektion,
// Suchindex auf einer echten Projektdatenbank, Neuaufbau und Migration v1 → v2.
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { backup } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ipcContract } from '@shared/ipc';
import type { LegacySectionKey, LegacySections } from '@shared/journal';
import { sectionsFromLegacy } from '@shared/journal-templates';
import { MAX_QUERY_WORDS, queryWords, searchableWords, stripMarks } from '@shared/search';
import { checkIntegrity, openDatabase, transaction } from '../db/connection';
import { getSchemaVersion, LATEST_VERSION, migrate, MIGRATIONS } from '../db/migrations';
import { JournalService } from '../journal/journal-service';
import { LinkService } from '../links/link-service';
import { ProjectService } from '../project/project-service';
import { TaxonomyService } from '../taxonomy/taxonomy-service';
import { buildFtsQuery, spellingVariants } from './fts-query';
import { projectSections } from './projection';
import { SearchIndex, tidySnippet } from './search-index';

// --- Bausteine für Tiptap-Inhalte ------------------------------------------------
// Leerer Absatz ohne Textknoten (leere Textknoten lehnt das Editor-Schema ab)
const p = (text: string) =>
  text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' };
const doc = (...content: unknown[]) => ({ type: 'doc' as const, content });
const figure = (caption: string) => ({
  type: 'figure',
  attrs: { mediaId: '00000000-0000-4000-8000-000000000001', caption, alt: caption },
});
type Parts = Partial<Record<LegacySectionKey, unknown[]>>;
const legacySections = (parts: Parts): LegacySections => ({
  auftrag: doc(...(parts.auftrag ?? [p('')])),
  durchfuehrung: doc(...(parts.durchfuehrung ?? [p('')])),
  reflexion: doc(...(parts.reflexion ?? [p('')])),
});
const sections = (parts: Parts) => sectionsFromLegacy('report', legacySections(parts));

describe('Suchbegriffe → FTS5-Abfrage', () => {
  it('zerlegt in Wörter: klein, ohne Satzzeichen, ohne Doppelte; kurze Wörter zählen nicht', () => {
    expect(queryWords('  Farb-Messung, CMYK!  farb ')).toEqual(['farb', 'messung', 'cmyk']);
    expect(queryWords('Δ E 2000')).toEqual(['δ', 'e', '2000']);
    expect(queryWords('«»…?!')).toEqual([]);
    expect(searchableWords('UV-Lack am 3D Druck')).toEqual(['lack', 'druck']);
  });

  it('alle Wörter müssen vorkommen (AND), als Text in Anführungszeichen', () => {
    expect(buildFtsQuery('Farbe Bogen')).toBe('"farbe" AND "bogen"');
    // ss → ß-Variante, damit auch Texte mit «ß» (z. B. eingefügt) gefunden werden
    expect(buildFtsQuery('Messung')).toBe('("messung" OR "meßung")');
    expect(buildFtsQuery('')).toBeNull();
    expect(buildFtsQuery('   ---  ')).toBeNull();
    expect(buildFtsQuery('UV am')).toBeNull(); // nur kurze Wörter
  });

  it('Umlaut- und ss-Schreibweisen als Alternativen', () => {
    expect(spellingVariants('kuehlung').sort()).toEqual(['kuehlung', 'kuhlung']);
    expect(spellingVariants('kühlung').sort()).toEqual(['kuehlung', 'kühlung']);
    expect(spellingVariants('strasse').sort()).toEqual(['strasse', 'straße']);
    expect(spellingVariants('offset')).toEqual(['offset']);
    expect(spellingVariants('que')).toEqual(['que']); // «qu» wäre zu kurz
    expect(buildFtsQuery('Kühl')).toBe('("kühl" OR "kuehl")');
  });

  it('Sonderzeichen und Schlüsselwörter der Abfragesprache sind nur Text', () => {
    // Weder Syntaxfehler noch Operatoren: alles wird zu Wörtern in Anführungszeichen
    expect(buildFtsQuery('NOT (Farbe OR "CMYK" *: ^')).toBe('"not" AND "farbe" AND "cmyk"');
    expect(buildFtsQuery('Rot AND Grün')).toBe('"rot" AND "and" AND ("grün" OR "gruen")');
  });

  it('begrenzt Anzahl und Länge der Wörter', () => {
    const many = Array.from({ length: 20 }, (_, i) => `wort${i}`).join(' ');
    expect(searchableWords(many)).toHaveLength(MAX_QUERY_WORDS);
    expect(queryWords('x'.repeat(100))[0]).toHaveLength(40);
  });

  it('Ausschnitte: angeschnittene Wörter am Rand weg, Treffer bleiben', () => {
    expect(tidySnippet('…ie Farb\u0002messung\u0003 mit dem S…')).toBe('…Farb\u0002messung\u0003 mit dem …');
    expect(tidySnippet('…b\u0002messung\u0003 im \u0002Proto\u0003k…')).toBe(
      '…b\u0002messung\u0003 im \u0002Proto\u0003k…',
    );
    expect(tidySnippet('Die \u0002Messung\u0003 war gut')).toBe('Die \u0002Messung\u0003 war gut');
  });

  it('IPC-Vertrag begrenzt die Länge der Eingabe', () => {
    const req = ipcContract['search:query'].request;
    expect(req.safeParse({ query: 'Farbe', includeArchived: false }).success).toBe(true);
    expect(req.safeParse({ query: 'x'.repeat(201), includeArchived: false }).success).toBe(false);
    expect(req.safeParse({ query: 'Farbe' }).success).toBe(false);
  });
});

describe('Klartextprojektion', () => {
  it('trennt Text und Bildlegenden, Blöcke kleben nicht zusammen', () => {
    const s = legacySections({
      auftrag: [
        p('Plakat drucken'),
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Ziel' }] },
      ],
      durchfuehrung: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [p('Erster')] },
            { type: 'listItem', content: [p('Zweiter')] },
          ],
        },
        figure('Kontrollstreifen am Bogen'),
        figure('   '),
      ],
      reflexion: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Zeile' }, { type: 'hardBreak' }, { type: 'text', text: 'zwei' }],
        },
      ],
    });
    const r = projectSections(s);
    expect(r.captions).toBe('Kontrollstreifen am Bogen');
    expect(r.body).not.toContain('Kontrollstreifen');
    expect(r.body.split('\n')).toEqual(['Plakat drucken', 'Ziel', 'Erster', 'Zweiter', 'Zeile', 'zwei']);
  });

  it('entfernt die Markierungszeichen der Trefferanzeige aus dem Text', () => {
    const r = projectSections(legacySections({ auftrag: [p('a\u0002b\u0003c')] }));
    expect(r.body).toBe('a b c');
  });
});

describe('Suchindex', () => {
  let root: string;
  let projects: ProjectService;
  let search: SearchIndex;
  let journals: JournalService;
  let taxonomy: TaxonomyService;
  let clock: Date;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'lj-s-'));
    clock = new Date('2026-03-14T09:00:00Z');
    projects = new ProjectService({
      appVersion: '0.1.0',
      env: {},
      lockEnv: { pid: 1, hostname: 'PC', isProcessAlive: () => true, now: () => new Date() },
    });
    await projects.create({
      dir: path.join(root, 'p'),
      title: 'P',
      profile: { displayName: '', company: null, apprenticeshipStart: null, specialization: 'print' },
      seedCategories: true,
    });
    const db = () => projects.db;
    search = new SearchIndex(db);
    const links = new LinkService(db, () => clock);
    journals = new JournalService(
      db,
      () => projects.dir,
      () => clock,
      undefined,
      links,
      search,
    );
    taxonomy = new TaxonomyService(db, () => clock, search);
  });
  afterEach(() => {
    projects.close();
    rmSync(root, { recursive: true, force: true });
  });

  const find = (q: string, includeArchived = false) => search.search(q, { includeArchived }).hits;
  const ids = (q: string, includeArchived = false) => find(q, includeArchived).map((h) => h.id);

  function journal(title: string, s: Parts = {}, workDate = '2026-03-14') {
    const j = journals.create({ title, workDate });
    journals.updateSections(j.id, sections(s));
    return j.id;
  }

  it('findet Titel, Text und Bildlegenden – ohne Gross/Klein und Umlaute', () => {
    const a = journal('Kühlung der Druckmaschine', {
      durchfuehrung: [p('Farbmessung mit dem Spektralfotometer'), figure('Kontrollstreifen am Bogen')],
    });
    expect(ids('kuhlung')).toEqual([a]);
    expect(ids('KÜHLUNG')).toEqual([a]);
    expect(ids('Kuehlung')).toEqual([a]);
    expect(ids('farbmessung')).toEqual([a]);
    expect(ids('Farbmess')).toEqual([a]); // Wortanfang
    expect(ids('messung')).toEqual([a]); // Wortteil im zusammengesetzten Wort
    expect(ids('maschine')).toEqual([a]);
    expect(ids('kühlung UV')).toEqual([a]); // kurzes Wort wird ignoriert
    expect(ids('kontrollstreifen')).toEqual([a]);
    expect(ids('kühlung spektral')).toEqual([a]); // beide Wörter
    expect(ids('kühlung fehlt')).toEqual([]);
    expect(ids('')).toEqual([]);
  });

  it('findet «Kühlung», wenn im Journal «Kuehlung» steht – und umgekehrt', () => {
    const a = journal('Kuehlung kontrollieren');
    const b = journal('Strasse', { reflexion: [p('Straße')] });
    expect(ids('Kühlung')).toEqual([a]);
    expect(ids('straße')).toEqual([b]);
    expect(ids('strasse')).toEqual([b]);
  });

  it('meldet, wo der Begriff vorkam, mit markiertem Ausschnitt', () => {
    const a = journal('Plattenwechsel', {
      durchfuehrung: [p('Danach habe ich die neue Platte eingespannt und den Plattenzylinder gereinigt.')],
      reflexion: [figure('Platte nach dem Belichten')],
    });
    const [hit] = find('platte');
    expect(hit!.id).toBe(a);
    expect(hit!.matchedIn).toEqual(['title', 'body', 'captions']);
    // Markiert wird genau der gefundene Teil, auch mitten im Wort
    expect(hit!.title).toBe('\u0002Platte\u0003nwechsel');
    expect(hit!.snippet?.field).toBe('body');
    expect(hit!.snippet?.text).toContain('\u0002Platte\u0003');
    expect(stripMarks(hit!.snippet!.text)).toContain('neue Platte eingespannt');

    // Nur in der Legende → Ausschnitt aus der Legende
    const [cap] = find('belichten');
    expect(cap!.matchedIn).toEqual(['captions']);
    expect(cap!.snippet).toEqual({ field: 'captions', text: 'Platte nach dem \u0002Belichten\u0003' });
  });

  it('Treffer im Titel stehen vor Treffern im Text', () => {
    const inText = journal('Druckabnahme', { durchfuehrung: [p('Wir haben die Farbmessung gemacht.')] });
    const inTitle = journal('Farbmessung', {}, '2025-01-01');
    expect(ids('farbmessung')).toEqual([inTitle, inText]);
  });

  it('Schlagwörter und Kategorien sind durchsuchbar und folgen jeder Änderung', () => {
    const a = journal('Andruck');
    taxonomy.setJournalTags(a, ['Offset', 'Proof']);
    const cat = taxonomy.list().categories.find((c) => c.name.startsWith('e –'))!;
    taxonomy.setJournalCategories(a, [cat.id]);
    expect(find('offset')[0]!.matchedIn).toEqual(['tags']);
    expect(ids('druckauftrage')).toEqual([a]); // «e – Ausführen von Druckaufträgen»

    // Umbenennen: alter Name nicht mehr, neuer schon
    const proof = taxonomy.list().tags.find((t) => t.name === 'Proof')!;
    taxonomy.rename('tag', proof.id, 'Prüfdruck');
    expect(ids('proof')).toEqual([]);
    expect(ids('prufdruck')).toEqual([a]);

    // Zusammenführen: Journal hat danach das Ziel-Schlagwort
    const b = journal('Zweites');
    taxonomy.setJournalTags(b, ['Bogenoffset']);
    const tags = taxonomy.list().tags;
    taxonomy.merge(
      'tag',
      tags.find((t) => t.name === 'Bogenoffset')!.id,
      tags.find((t) => t.name === 'Offset')!.id,
    );
    expect(ids('bogenoffset')).toEqual([]);
    expect(ids('offset').sort()).toEqual([a, b].sort());

    // Kategorie löschen: nicht mehr über die Kategorie auffindbar
    taxonomy.delete('category', cat.id);
    expect(ids('druckauftrage')).toEqual([]);
    // Schlagwort im Journal entfernen
    taxonomy.setJournalTags(a, []);
    expect(ids('offset')).toEqual([b]);
  });

  it('archivierte Journale nur auf Wunsch', () => {
    const a = journal('Rakel wechseln');
    journals.setStatus(a, 'archived');
    expect(ids('rakel')).toEqual([]);
    expect(ids('rakel', true)).toEqual([a]);
  });

  it('gelöschte Journale verschwinden aus dem Index, Duplikate sind eigene Treffer', () => {
    const a = journal('Falzmaschine einrichten');
    const copy = journals.duplicate(a);
    expect(ids('falzmaschine').sort()).toEqual([a, copy.id].sort());
    journals.delete(a);
    expect(ids('falzmaschine')).toEqual([copy.id]);
    expect(projects.db.prepare('SELECT count(*) n FROM journal_fts').get()).toEqual({ n: 1 });
  });

  it('beliebige Eingaben werfen keine Fehler', () => {
    journal('Farbe');
    for (const q of [
      '"',
      '(',
      ')',
      '*',
      'NOT',
      'a OR',
      ':',
      '^farbe',
      'NEAR(a b)',
      '\u0002',
      'x'.repeat(200),
    ]) {
      expect(() => find(q)).not.toThrow();
    }
    expect(ids('(farbe')).toHaveLength(1);
  });

  it('begrenzt die Anzahl Treffer', () => {
    // 205 Journale mit demselben Wort (direkt, damit der Test schnell bleibt)
    const ins = projects.db.prepare(
      "INSERT INTO journal (id, title, work_date, sections_json, created_at, updated_at) VALUES (?, 'Bogen', '2026-01-01', '{}', ?, ?)",
    );
    // In einer Transaktion: einzeln wäre jedes Einfügen ein eigenes COMMIT mit
    // synchronous=FULL – unter Windows über 5 s für diesen einen Test.
    transaction(projects.db, () => {
      for (let i = 0; i < 205; i++) ins.run(`j${i}`, clock.toISOString(), clock.toISOString());
    });
    search.rebuild();
    const r = search.search('bogen', { includeArchived: false });
    expect(r.hits).toHaveLength(200);
    expect(r.truncated).toBe(true);
  });

  it('Neuaufbau stellt einen fehlenden, beschädigten oder gelöschten Index wieder her', () => {
    const a = journal('Siebdruck', { durchfuehrung: [figure('Rakelwinkel')] });
    const db = projects.db;
    db.exec('DELETE FROM journal_fts');
    expect(ids('siebdruck')).toEqual([]);
    expect(search.rebuild()).toEqual({ journals: 1 });
    expect(ids('rakelwinkel')).toEqual([a]);

    // Tabelle ganz weg (z. B. von Hand gelöscht): Neuaufbau legt sie wieder an
    db.exec('DROP TABLE journal_fts');
    expect(search.rebuild()).toEqual({ journals: 1 });
    expect(ids('siebdruck')).toEqual([a]);
    expect(checkIntegrity(db)).toEqual([]);
  });

  it('beim Öffnen: unvollständiger Index wird erkannt und neu aufgebaut, vollständiger nicht', () => {
    const a = journal('Laminieren');
    journal('Stanzen');
    expect(search.ensureComplete()).toBe(false);

    projects.db.prepare('DELETE FROM journal_fts WHERE journal_id = ?').run(a); // fehlt
    expect(search.ensureComplete()).toBe(true);
    expect(ids('laminieren')).toEqual([a]);

    projects.db.prepare("INSERT INTO journal_fts (journal_id, title) VALUES ('weg', 'Laminieren')").run(); // verwaist
    expect(search.ensureComplete()).toBe(true);
    expect(ids('laminieren')).toEqual([a]);

    projects.db.exec('DROP TABLE journal_fts'); // ganz weg
    expect(search.ensureComplete()).toBe(true);
    expect(ids('stanzen')).toHaveLength(1);
  });
});

describe('Migration v1 → v2 (Suchindex mit Legenden und Schlagwörtern)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'lj-mig-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('baut den Index aus bestehenden Journalen neu auf und sichert vorher', async () => {
    const file = path.join(dir, 'journal.sqlite');
    const db = openDatabase(file);
    // Datenbank im Stand v1, wie sie ein älteres Programm angelegt hat
    await migrate(db, { migrations: MIGRATIONS.slice(0, 1) });
    expect(getSchemaVersion(db)).toBe(1);
    const ts = '2026-03-14T09:00:00.000Z';
    const s = legacySections({ durchfuehrung: [p('Farbmessung'), figure('Kontrollstreifen')] });
    db.prepare(
      'INSERT INTO journal (id, title, work_date, sections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('j1', 'Andruck', '2026-03-14', JSON.stringify(s), ts, ts);
    db.prepare("INSERT INTO tag VALUES ('t1', 'Offset')").run();
    db.prepare("INSERT INTO journal_tag VALUES ('j1', 't1')").run();
    // Alter Index (v1: nur Titel und Text, Legende im Text, kein Schlagwort)
    db.prepare("INSERT INTO journal_fts VALUES ('j1', 'Andruck', 'Farbmessung Kontrollstreifen')").run();

    const r = await migrate(db, {
      backup: async (d, from) => {
        const file = path.join(dir, `vor-update-${from}.sqlite`);
        await backup(d, file);
        return file;
      },
    });
    expect(r).toMatchObject({ from: 1, to: LATEST_VERSION });
    expect(existsSync(r.backup!)).toBe(true);

    const row = db.prepare('SELECT * FROM journal_fts').get();
    expect(row).toEqual({
      journal_id: 'j1',
      title: 'Andruck',
      body: 'Farbmessung',
      captions: 'Kontrollstreifen',
      tags: 'Offset',
      categories: '',
    });
    const search = new SearchIndex(() => db);
    expect(search.search('offset', { includeArchived: false }).hits.map((h) => h.id)).toEqual(['j1']);
    expect(checkIntegrity(db)).toEqual([]);
    db.close();
    expect(readdirSync(dir).some((f) => f.startsWith('vor-update-1'))).toBe(true);
  });
});

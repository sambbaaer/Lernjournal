// Journal-Verknüpfungen (AJ-10): verknüpfen, lösen und Rückverweise lesen.
// Arbeitet auf der Tabelle journal_link aus Schema v1 – keine Migration nötig.
//
// Grundsätze:
//  - Keine Kopien: gespeichert wird nur das Paar (Quelle, Ziel). Titel, Datum
//    und Status des Ziels kommen bei jeder Abfrage frisch aus «journal».
//  - Eine Beziehung gilt in beide Richtungen. Die Datenbank verbietet
//    Selbstlinks und A→B zusammen mit B→A (Index journal_link_undirected);
//    der Dienst behandelt «schon verknüpft» freundlich als «nichts zu tun».
//  - Löscht man ein Journal, verschwinden seine Verknüpfungen per
//    ON DELETE CASCADE. Links im Text anderer Journale entfernt
//    removeTextLinksTo() (der Text bleibt, nur der Link fällt weg).
import { journalLinkHref, stripJournalLinks, type JournalLinks, type LinkedJournal } from '@shared/links';
import { transaction, type Db } from '../db/connection';

// Fehler mit Meldung für die Oberfläche (ipc-handler gibt sie weiter)
export class LinkError extends Error {
  override name = 'LinkError';
}

type LinkedRow = { id: string; title: string; work_date: string; status: LinkedJournal['status'] };

const toLinked = (r: LinkedRow): LinkedJournal => ({
  id: r.id,
  title: r.title,
  workDate: r.work_date,
  status: r.status,
});

export class LinkService {
  constructor(
    private readonly getDb: () => Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get db() {
    return this.getDb();
  }

  // Verknüpfungen (beide Richtungen) und Erwähnungen im Text anderer Journale
  list(journalId: string): JournalLinks {
    this.assertJournal(journalId);
    // UNION: Partner, egal ob dieses Journal Quelle oder Ziel ist
    const linked = this.db
      .prepare(
        `SELECT j.id, j.title, j.work_date, j.status FROM journal j
         WHERE j.id IN (
           SELECT target_journal_id FROM journal_link WHERE source_journal_id = ?
           UNION
           SELECT source_journal_id FROM journal_link WHERE target_journal_id = ?)
         ORDER BY j.work_date DESC, j.title COLLATE NOCASE`,
      )
      .all(journalId, journalId) as LinkedRow[];
    // Rückverweise aus dem Text: Das Link-Ziel steht wörtlich im gespeicherten
    // JSON. instr() statt LIKE, damit «%» oder «_» keine Platzhalter sind.
    // Das Anführungszeichen am Ende verhindert Treffer auf längere IDs.
    const mentionedIn = this.db
      .prepare(
        `SELECT id, title, work_date, status FROM journal
         WHERE id <> ? AND instr(sections_json, ?) > 0
         ORDER BY work_date DESC, title COLLATE NOCASE`,
      )
      .all(journalId, `"${journalLinkHref(journalId)}"`) as LinkedRow[];
    return { linked: linked.map(toLinked), mentionedIn: mentionedIn.map(toLinked) };
  }

  // Zwei Journale verknüpfen. Bereits verknüpft (in welcher Richtung auch
  // immer) → nichts tun. Gibt zurück, ob eine neue Verknüpfung entstand.
  add(journalId: string, otherId: string): boolean {
    if (journalId === otherId)
      throw new LinkError('Ein Journal kann nicht mit sich selbst verknüpft werden.');
    let added = false;
    transaction(this.db, () => {
      this.assertJournal(journalId);
      this.assertJournal(otherId, 'Das gewählte Journal gibt es nicht mehr.');
      if (this.exists(journalId, otherId)) return;
      this.db
        .prepare(
          'INSERT INTO journal_link (source_journal_id, target_journal_id, created_at) VALUES (?, ?, ?)',
        )
        .run(journalId, otherId, this.now().toISOString());
      this.touch(journalId);
      added = true;
    });
    return added;
  }

  // Verknüpfung lösen – egal, in welchem der beiden Journale sie angelegt wurde.
  // Die Journale selbst bleiben unverändert bestehen.
  remove(journalId: string, otherId: string): boolean {
    let removed = false;
    transaction(this.db, () => {
      this.assertJournal(journalId);
      const r = this.db
        .prepare(
          `DELETE FROM journal_link
           WHERE (source_journal_id = ? AND target_journal_id = ?)
              OR (source_journal_id = ? AND target_journal_id = ?)`,
        )
        .run(journalId, otherId, otherId, journalId);
      removed = Number(r.changes) > 0;
      if (removed) this.touch(journalId);
    });
    return removed;
  }

  // Links im Text anderer Journale auf «targetId» entfernen (vor dem Löschen
  // von targetId, in derselben Transaktion aufrufen). Liefert die IDs der
  // geänderten Journale, damit der Aufrufer z. B. den Suchindex nachführt.
  removeTextLinksTo(targetId: string): string[] {
    const needle = `"${journalLinkHref(targetId)}"`;
    const rows = this.db
      .prepare('SELECT id, sections_json FROM journal WHERE id <> ? AND instr(sections_json, ?) > 0')
      .all(targetId, needle) as { id: string; sections_json: string }[];
    const update = this.db.prepare('UPDATE journal SET sections_json = ?, updated_at = ? WHERE id = ?');
    const ts = this.now().toISOString();
    for (const r of rows) {
      const cleaned = stripJournalLinks(JSON.parse(r.sections_json) as unknown, targetId);
      update.run(JSON.stringify(cleaned), ts, r.id);
    }
    return rows.map((r) => r.id);
  }

  // --- Hilfen ---------------------------------------------------------------

  private exists(a: string, b: string): boolean {
    return !!this.db
      .prepare(
        `SELECT 1 FROM journal_link
         WHERE (source_journal_id = ? AND target_journal_id = ?)
            OR (source_journal_id = ? AND target_journal_id = ?)`,
      )
      .get(a, b, b, a);
  }

  // «Zuletzt geändert» des Journals nachführen, in dem verknüpft wurde
  private touch(journalId: string): void {
    this.db
      .prepare('UPDATE journal SET updated_at = ? WHERE id = ?')
      .run(this.now().toISOString(), journalId);
  }

  private assertJournal(id: string, message = 'Journal nicht gefunden.'): void {
    if (!this.db.prepare('SELECT 1 FROM journal WHERE id = ?').get(id)) throw new LinkError(message);
  }
}

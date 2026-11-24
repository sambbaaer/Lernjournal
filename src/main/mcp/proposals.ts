import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { plainTextOf, type JournalDetail, type Sections } from '@shared/journal';
import type { McpDecisionResult, McpProposal } from '@shared/mcp';
import type { JournalService } from '../journal/journal-service';
import type { LinkService } from '../links/link-service';
import {
  draftSections,
  journalRevision,
  McpError,
  previewEdits,
  type DraftTextSchema,
  type EditSchema,
} from './journal-edits';

type Dependencies = { journals: JournalService; links: LinkService; changed: () => void };
type Applied = { journal: JournalDetail; relatedId: string | null };
type Pending = { key: string; preview: McpProposal; apply: () => Applied };
type Outcome = { status: 'applied'; journalId: string } | { status: 'rejected' | 'stale' };
const MAX_PENDING = 12;
const MAX_DECISIONS = 40;
const titleOf = (journal: JournalDetail) => journal.title || 'Ohne Titel';

export class McpProposals {
  private readonly pending = new Map<string, Pending>();
  private readonly decided = new Map<string, Outcome>();
  allowDrafts = false;

  constructor(private readonly deps: Dependencies) {}

  get list(): McpProposal[] {
    return [...this.pending.values()].map(({ preview }) => preview);
  }

  setDrafts(allowed: boolean) {
    this.allowDrafts = allowed;
    if (!allowed) {
      for (const [id, { preview }] of this.pending) {
        if (preview.kind === 'draft') this.finish(id, { status: 'rejected' });
      }
    }
    this.deps.changed();
  }

  status(id: string) {
    return this.decided.get(id) ?? { status: this.pending.has(id) ? 'pending' : 'unknown' };
  }

  edit(id: string, revision: string, edits: z.infer<typeof EditSchema>[]) {
    const original = this.deps.journals.get(id);
    if (journalRevision(original) !== revision)
      throw new McpError('Das Journal wurde geändert. Lies es erneut.');
    const { changes, sections } = previewEdits(original, edits);
    return this.add(
      ['edit', id, revision, edits],
      { kind: 'edit', id: randomUUID(), title: titleOf(original), changes },
      () => {
        if (journalRevision(this.deps.journals.get(id)) !== revision)
          throw new StaleProposal(
            'Das Journal wurde inzwischen geändert. Bitte lass einen neuen Vorschlag erstellen.',
          );
        this.deps.journals.updateSections(id, sections);
        return { journal: this.deps.journals.get(id), relatedId: null };
      },
    );
  }

  link(id: string, otherId: string) {
    if (id === otherId) throw new McpError('Ein Journal kann nicht mit sich selbst verknüpft werden.');
    const source = this.deps.journals.get(id);
    const target = this.deps.journals.get(otherId);
    if (this.deps.links.list(id).linked.some((linked) => linked.id === otherId))
      return { status: 'already_linked' as const };
    return this.add(
      ['link', ...[source, target].map(({ id, title }) => [id, title]).sort()],
      { kind: 'link', id: randomUUID(), title: titleOf(source), targetTitle: titleOf(target) },
      () => {
        if (
          this.deps.journals.get(id).title !== source.title ||
          this.deps.journals.get(otherId).title !== target.title
        )
          throw new StaleProposal(
            'Ein Journaltitel wurde geändert. Bitte lass die Verknüpfung erneut vorschlagen.',
          );
        this.deps.links.add(id, otherId);
        return { journal: this.deps.journals.get(id), relatedId: otherId };
      },
    );
  }

  draft(title: string, body?: z.infer<typeof DraftTextSchema>) {
    if (!this.allowDrafts) throw new McpError('Neue Entwürfe sind im MCP-Tab nicht freigegeben.');
    const sections = draftSections(body);
    return this.add(
      ['draft', title, sections],
      { kind: 'draft', id: randomUUID(), title, changes: draftPreview(sections) },
      () => {
        if (!this.allowDrafts) throw new StaleProposal('Neue Entwürfe sind nicht mehr freigegeben.');
        return { journal: this.deps.journals.create({ title, sections }), relatedId: null };
      },
    );
  }

  decide(id: string, apply: boolean): McpDecisionResult {
    const proposal = this.pending.get(id);
    if (!proposal) throw new McpError('Der Vorschlag ist nicht mehr verfügbar.');
    if (!apply) {
      this.finish(id, { status: 'rejected' });
      return { journal: null, relatedId: null };
    }
    try {
      const result = proposal.apply();
      this.finish(id, { status: 'applied', journalId: result.journal.id });
      return result;
    } catch (error) {
      if (
        error instanceof StaleProposal ||
        (error instanceof Error && error.name === 'JournalNotFoundError')
      ) {
        this.finish(id, { status: 'stale' });
        if (error instanceof StaleProposal) throw error;
        throw new McpError('Ein Journal des Vorschlags wurde inzwischen gelöscht.');
      }
      throw error;
    }
  }

  private add(input: unknown[], preview: McpProposal, apply: Pending['apply']) {
    const key = JSON.stringify(input);
    const existing = [...this.pending.values()].find((entry) => entry.key === key);
    if (!existing) {
      if (this.pending.size >= MAX_PENDING)
        throw new McpError('Bitte prüfe die offenen Vorschläge im MCP-Tab.');
      this.pending.set(preview.id, { key, preview, apply });
      this.deps.changed();
    }
    return {
      status: 'pending' as const,
      proposalId: existing?.preview.id ?? preview.id,
      message: 'Vorschlag in Lernjournal zur Prüfung bereit.',
    };
  }

  private finish(id: string, outcome: Outcome) {
    this.pending.delete(id);
    this.decided.set(id, outcome);
    if (this.decided.size > MAX_DECISIONS) this.decided.delete(this.decided.keys().next().value!);
    this.deps.changed();
  }
}

class StaleProposal extends McpError {}

function draftPreview(sections: Sections) {
  return sections.flatMap(({ heading, doc }) => {
    const text = plainTextOf(doc);
    return text ? [{ section: heading ?? 'Inhalt', before: null, after: text }] : [];
  });
}

import { useState } from 'react';
import { Copy, Link2, NotebookPen } from 'lucide-react';
import type { McpProposal } from '@shared/mcp';
import { useApp } from '../state/AppContext';
import { saveIfNeeded } from '../editor/save-registry';
import { loadLinks } from '../journal/actions';
import { ErrorMessage } from './Notices';

const primary =
  'rounded-sm bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-50';
const secondary =
  'inline-flex items-center gap-2 rounded-sm border border-border-strong px-3 py-2 text-sm hover:bg-hover disabled:opacity-50';

export function McpSettings() {
  const { state, dispatch } = useApp();
  const { endpoint, allowDrafts, proposals } = state.mcp;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving =
    state.saveStatus.kind === 'pending' ||
    state.saveStatus.kind === 'saving' ||
    state.journalDetailSave.active > 0;

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function setActive(enabled: boolean) {
    return run(async () => {
      const result = await window.lernjournal.mcp.setActive({ enabled });
      if (!result.ok) throw new Error(result.error.message);
      dispatch({ type: 'mcpStatus', status: result.data });
    });
  }

  function copy(field: 'endpoint' | 'token') {
    return run(async () => {
      const result = await window.lernjournal.mcp.copy({ field });
      if (!result.ok || !result.data) throw new Error('Kopieren war gerade nicht möglich.');
      setMessage(field === 'token' ? 'Zugangsschlüssel kopiert.' : 'Adresse kopiert.');
    });
  }

  function setDrafts(allowed: boolean) {
    return run(async () => {
      const result = await window.lernjournal.mcp.setDrafts({ allowed });
      if (!result.ok) throw new Error(result.error.message);
      dispatch({ type: 'mcpStatus', status: result.data });
    });
  }

  function decide(proposal: McpProposal, apply: boolean) {
    return run(async () => {
      if (apply && (state.saveStatus.kind === 'error' || !(await saveIfNeeded())))
        throw new Error('Speichere zuerst die ausstehenden Änderungen im Journal.');
      const result = await window.lernjournal.mcp.decide({ id: proposal.id, apply });
      if (!result.ok) throw new Error(result.error.message);
      const { journal, relatedId } = result.data;
      if (journal) {
        dispatch({ type: 'mcpJournalApplied', journal });
        const opened = state.openJournal?.id;
        if (opened && (opened === journal.id || opened === relatedId)) await loadLinks(dispatch, opened);
      }
      setMessage(apply ? 'Vorschlag übernommen.' : 'Vorschlag abgelehnt.');
    });
  }

  return (
    <div className="max-w-3xl space-y-5">
      <section
        aria-labelledby="mcp-connection-title"
        className="space-y-3 rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="mcp-connection-title" className="text-lg font-semibold">
          Lokale MCP-Schnittstelle
        </h2>
        <p className="text-sm">
          Ein verbundener MCP-Client kann Journale im geöffneten Projekt lesen, Textkorrekturen vorschlagen
          und passende Journale zum Verknüpfen finden.
        </p>
        <p className="text-sm text-ink-muted">
          Verbinde nur einen Client, dem du diese Journalinhalte anvertrauen möchtest. Je nach Client können
          die Daten an dessen Dienst weitergegeben werden.
        </p>
        <button
          type="button"
          className={endpoint ? secondary : primary}
          disabled={busy}
          onClick={() => void setActive(!endpoint)}
        >
          {endpoint ? 'MCP deaktivieren' : 'MCP für dieses Projekt aktivieren'}
        </button>
        {endpoint && (
          <div className="space-y-3 border-t border-border-subtle pt-3">
            <p className="text-sm">
              Transport <strong>Streamable HTTP</strong>
            </p>
            <code className="block break-all rounded-sm bg-canvas px-3 py-2 text-sm">{endpoint}</code>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={secondary}
                disabled={busy}
                onClick={() => void copy('endpoint')}
              >
                <Copy aria-hidden="true" size={14} /> Adresse kopieren
              </button>
              <button type="button" className={secondary} disabled={busy} onClick={() => void copy('token')}>
                <Copy aria-hidden="true" size={14} /> Zugangsschlüssel kopieren
              </button>
            </div>
            <p className="text-xs text-ink-muted">
              Verwende den Zugangsschlüssel im MCP-Client als Bearer-Token. Beim Schliessen oder Wechseln des
              Projekts endet die Freigabe.
            </p>
            <label className="flex items-center gap-2 border-t border-border-subtle pt-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-accent"
                checked={allowDrafts}
                disabled={busy}
                onChange={(event) => void setDrafts(event.target.checked)}
              />
              Neue Journalentwürfe vorschlagen erlauben
            </label>
          </div>
        )}
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <p role="status" className="text-sm text-ink-muted">
          {message}
        </p>
      </section>
      {endpoint && (
        <section aria-labelledby="mcp-proposals-title" className="space-y-3">
          <h2 id="mcp-proposals-title" className="text-lg font-semibold">
            Vorschläge prüfen ({proposals.length})
          </h2>
          {proposals.length === 0 && (
            <p className="text-sm text-ink-muted">Es liegen keine Vorschläge zur Prüfung vor.</p>
          )}
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onDecide={(apply) => void decide(proposal, apply)}
              busy={busy}
              saving={saving}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function ProposalCard({
  proposal,
  onDecide,
  busy,
  saving,
}: {
  proposal: McpProposal;
  onDecide: (apply: boolean) => void;
  busy: boolean;
  saving: boolean;
}) {
  const action =
    proposal.kind === 'draft' ? 'Neuer Entwurf' : proposal.kind === 'link' ? 'Verknüpfung' : 'Überarbeitung';
  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        {proposal.kind === 'link' ? (
          <Link2 aria-hidden="true" size={16} />
        ) : (
          <NotebookPen aria-hidden="true" size={16} />
        )}
        {action} · «{proposal.title}»
      </h3>
      {proposal.kind === 'link' ? (
        <p className="text-sm">Mit «{proposal.targetTitle}» verknüpfen.</p>
      ) : (
        <ul className="space-y-3">
          {proposal.changes.map((change, index) => (
            <li key={index} className="space-y-1 text-sm">
              <h4 className="font-semibold">{change.section}</h4>
              {change.before !== null && (
                <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-canvas p-2">
                  <strong>Bisher</strong>
                  {'\n'}
                  {change.before}
                </p>
              )}
              <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-selected p-2">
                <strong>Vorschlag</strong>
                {'\n'}
                {change.after || 'Text entfernen'}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={busy || saving} onClick={() => onDecide(true)}>
          {proposal.kind === 'draft' ? 'Entwurf anlegen' : 'Übernehmen'}
        </button>
        <button type="button" className={secondary} disabled={busy} onClick={() => onDecide(false)}>
          Ablehnen
        </button>
      </div>
    </article>
  );
}

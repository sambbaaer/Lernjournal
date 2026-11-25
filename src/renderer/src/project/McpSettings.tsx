import { useState } from 'react';
import { Copy, Download, Info, KeyRound, Link2, NotebookPen, Terminal } from 'lucide-react';
import type { McpCopyField, McpProposal } from '@shared/mcp';
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
  const { endpoint, allowDrafts, proposals, autoStart, defaultPort } = state.mcp;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Zweistufiges Erneuern: erst nachfragen, weil alle Einrichtungen ungültig werden
  const [confirmRenew, setConfirmRenew] = useState(false);
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

  // Alle Aufrufe, die einen neuen MCP-Status liefern, gleich behandeln
  function update(
    call: () => Promise<Awaited<ReturnType<typeof window.lernjournal.mcp.status>>>,
    done?: string,
  ) {
    return run(async () => {
      const result = await call();
      if (!result.ok) throw new Error(result.error.message);
      dispatch({ type: 'mcpStatus', status: result.data });
      if (done) setMessage(done);
    });
  }

  const setActive = (enabled: boolean) => update(() => window.lernjournal.mcp.setActive({ enabled }));
  const setDrafts = (allowed: boolean) => update(() => window.lernjournal.mcp.setDrafts({ allowed }));
  const setAutoStart = (enabled: boolean) => update(() => window.lernjournal.mcp.setAutoStart({ enabled }));
  const renew = () => {
    setConfirmRenew(false);
    return update(
      () => window.lernjournal.mcp.renewToken(),
      'Neuer Zugangsschlüssel erstellt. Richte deine MCP-Clients jetzt neu ein.',
    );
  };

  const copied: Record<McpCopyField, string> = {
    endpoint: 'Adresse kopiert.',
    token: 'Zugangsschlüssel kopiert.',
    claudeCode: 'Befehl für Claude Code kopiert. Füge ihn in PowerShell oder im Terminal ein.',
    httpJson: 'Einrichtung kopiert. Füge sie in die MCP-Konfiguration deines Clients ein.',
  };
  function copy(field: McpCopyField) {
    return run(async () => {
      const result = await window.lernjournal.mcp.copy({ field });
      if (!result.ok || !result.data) throw new Error('Kopieren war gerade nicht möglich.');
      setMessage(copied[field]);
    });
  }

  function saveExtension() {
    return run(async () => {
      const result = await window.lernjournal.mcp.saveClaudeExtension();
      if (!result.ok) throw new Error(result.error.message);
      if (result.data)
        setMessage(
          'Erweiterung gespeichert. Doppelklicke die Datei «Lernjournal.mcpb», um sie in Claude Desktop zu installieren.',
        );
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
      {/* 1 · Was ist das? – in einfachen Worten, ohne Fachjargon */}
      <section
        aria-labelledby="mcp-about-title"
        className="space-y-2 rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="mcp-about-title" className="flex items-center gap-2 text-lg font-semibold">
          <Info aria-hidden="true" size={18} /> Was ist MCP?
        </h2>
        <p className="text-sm">
          MCP («Model Context Protocol») ist ein offener Standard, über den ein KI-Assistent wie Claude mit
          Programmen auf deinem Computer arbeiten kann. Mit MCP kann der Assistent deine Journale{' '}
          <strong>suchen und lesen</strong> und <strong>Vorschläge machen</strong>: Textkorrekturen,
          Verknüpfungen und auf Wunsch neue Entwürfe.
        </p>
        <p className="text-sm">
          Lernjournal ändert nie etwas von selbst: Jeder Vorschlag erscheint unten und wird erst übernommen,
          wenn du ihn bestätigst. Löschen, Archivieren oder Abgeben kann der Assistent nicht.
        </p>
        <p className="text-sm text-ink-muted">
          MCP ist freiwillig. Lernjournal funktioniert ohne MCP genau gleich. Die Verbindung läuft nur auf
          diesem Computer (127.0.0.1). Der Assistent selbst kann die gelesenen Texte aber an seinen Dienst (z.
          B. Anthropic) senden. Verbinde nur einen Assistenten, dem du deine Journale anvertraust.
        </p>
      </section>

      {/* 2 · Freigabe für das geöffnete Projekt */}
      <section
        aria-labelledby="mcp-connection-title"
        className="space-y-3 rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="mcp-connection-title" className="text-lg font-semibold">
          Freigabe
        </h2>
        <p className="flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className={`inline-block size-2.5 rounded-full ${endpoint ? 'bg-success' : 'bg-border-strong'}`}
          />
          {endpoint ? (
            <span>
              <strong>Aktiv</strong> für das geöffnete Projekt unter <code>{endpoint}</code>
            </span>
          ) : (
            <span>
              <strong>Aus.</strong> Kein Assistent hat Zugriff.
            </span>
          )}
        </p>
        <button
          type="button"
          className={endpoint ? secondary : primary}
          disabled={busy}
          onClick={() => void setActive(!endpoint)}
        >
          {endpoint ? 'MCP deaktivieren' : 'MCP für dieses Projekt aktivieren'}
        </button>
        {endpoint && !defaultPort && (
          <p className="border-l-4 border-warning bg-warning-bg px-3 py-2 text-sm">
            Der übliche Anschluss (Port) war belegt. MCP läuft vorübergehend unter einer anderen Adresse.
            Eingerichtete Clients finden Lernjournal erst nach einem Neustart von Lernjournal wieder.
          </p>
        )}
        <label className="flex items-start gap-2 border-t border-border-subtle pt-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-accent"
            checked={autoStart}
            disabled={busy}
            onChange={(event) => void setAutoStart(event.target.checked)}
          />
          <span>
            Beim Öffnen eines Projekts automatisch aktivieren
            <span className="block text-xs text-ink-muted">
              Praktisch, wenn du regelmässig mit Claude arbeitest: Du musst die Freigabe nicht nach jedem
              Start neu einschalten.
            </span>
          </span>
        </label>
        {endpoint && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={allowDrafts}
              disabled={busy}
              onChange={(event) => void setDrafts(event.target.checked)}
            />
            Neue Journalentwürfe vorschlagen erlauben
          </label>
        )}
      </section>

      {/* 3 · Einrichtung je Client – einmalig nötig */}
      <section
        aria-labelledby="mcp-setup-title"
        className="space-y-4 rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="mcp-setup-title" className="text-lg font-semibold">
          Assistent einrichten (einmalig)
        </h2>

        <div className="space-y-2">
          <h3 className="font-semibold">Claude Desktop (empfohlen)</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Erweiterung speichern (Knopf unten).</li>
            <li>
              Die Datei <strong>Lernjournal.mcpb</strong> doppelklicken. Claude Desktop öffnet sich: auf{' '}
              <strong>Installieren</strong> klicken.
            </li>
            <li>Hier die Freigabe aktivieren. Danach in Claude z. B. fragen: «Welche Journale habe ich?»</li>
          </ol>
          <button type="button" className={primary} disabled={busy} onClick={() => void saveExtension()}>
            <span className="inline-flex items-center gap-2">
              <Download aria-hidden="true" size={14} /> Erweiterung für Claude Desktop speichern …
            </span>
          </button>
          <p className="text-xs text-ink-muted">
            Wichtig: Nicht über «Konnektor hinzufügen» mit einer URL. Solche Konnektoren verbindet Claude über
            das Internet, sie erreichen Lernjournal auf deinem Computer nicht.
          </p>
        </div>

        <div className="space-y-2 border-t border-border-subtle pt-3">
          <h3 className="font-semibold">Claude Code</h3>
          <p className="text-sm">Befehl kopieren und einmal in PowerShell oder im Terminal ausführen.</p>
          <button type="button" className={secondary} disabled={busy} onClick={() => void copy('claudeCode')}>
            <Terminal aria-hidden="true" size={14} /> Befehl für Claude Code kopieren
          </button>
        </div>

        <div className="space-y-2 border-t border-border-subtle pt-3">
          <h3 className="font-semibold">VS Code und andere Clients</h3>
          <p className="text-sm">
            Für Clients, die MCP über HTTP unterstützen (Transport «Streamable HTTP»). In VS Code: Befehl{' '}
            <em>MCP: Open User Configuration</em> und den kopierten Block einfügen.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondary} disabled={busy} onClick={() => void copy('httpJson')}>
              <Copy aria-hidden="true" size={14} /> Einrichtung (JSON) kopieren
            </button>
            <button type="button" className={secondary} disabled={busy} onClick={() => void copy('endpoint')}>
              <Copy aria-hidden="true" size={14} /> Adresse kopieren
            </button>
            <button type="button" className={secondary} disabled={busy} onClick={() => void copy('token')}>
              <Copy aria-hidden="true" size={14} /> Zugangsschlüssel kopieren
            </button>
          </div>
        </div>

        <div className="space-y-2 border-t border-border-subtle pt-3">
          <h3 className="font-semibold">Zugangsschlüssel</h3>
          <p className="text-sm text-ink-muted">
            Der Schlüssel bleibt gleich, bis du ihn erneuerst. Erneuere ihn, wenn du ihn versehentlich
            weitergegeben hast. Danach musst du alle Assistenten neu einrichten.
          </p>
          {confirmRenew ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Alle bisherigen Einrichtungen verlieren den Zugang.</span>
              <button type="button" className={secondary} disabled={busy} onClick={() => void renew()}>
                Ja, neuen Schlüssel erstellen
              </button>
              <button
                type="button"
                className={secondary}
                disabled={busy}
                onClick={() => setConfirmRenew(false)}
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button type="button" className={secondary} disabled={busy} onClick={() => setConfirmRenew(true)}>
              <KeyRound aria-hidden="true" size={14} /> Schlüssel erneuern …
            </button>
          )}
        </div>
      </section>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      <p role="status" className="text-sm text-ink-muted">
        {message}
      </p>

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

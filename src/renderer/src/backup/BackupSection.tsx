// Einstellungen → «Sicherungen» (AJ-15, SPEC «Navigation: Einstellungen …
// Backups und Wiederherstellung»): Liste der Sicherungen im Projektordner,
// «Jetzt sichern», «Wiederherstellen …» je Sicherung und die Kopie
// ausserhalb des Computers (letzte Projektübergabe, «Projekt übergeben …»).
//
// Die Liste kommt vom Hauptprozess und wird nach jeder Aktion neu geladen –
// auch nach einer Wiederherstellung (projectEpoch) und wenn der Dialog zugeht.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DatabaseBackup, HardDriveUpload, History } from 'lucide-react';
import { BACKUP_TEXTS, type BackupList } from '@shared/backup';
import { saveIfNeeded } from '../editor/save-registry';
import { formatDateTime } from '../project/messages';
import { ErrorMessage } from '../project/Notices';
import { useApp } from '../state/AppContext';
import {
  backupNow,
  backupNowNotice,
  entryContent,
  entryDate,
  loadBackups,
  reasonLabel,
} from './backup-actions';

// So viele Zeilen zeigt die Liste zuerst; der Rest über «Alle anzeigen»
const INITIAL_ROWS = 10;

const button = 'rounded-sm border border-border-strong bg-surface px-4 py-2 text-sm hover:bg-hover';

export function BackupSection() {
  const { state, dispatch } = useApp();
  const [list, setList] = useState<BackupList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const project = state.project!;
  const dialogOpen = state.restoreDialog !== null;

  const apply = useCallback((out: Awaited<ReturnType<typeof loadBackups>>) => {
    if (out.kind === 'ok') {
      setList(out.list);
      setError(null);
    } else setError(out.message);
  }, []);
  const reload = useCallback(() => loadBackups().then(apply), [apply]);

  // Neu laden beim Öffnen der Einstellungen, nach einem Projektwechsel und
  // wenn der Wiederherstellungs-Dialog geschlossen wurde. Antworten für einen
  // inzwischen überholten Stand werden verworfen.
  useEffect(() => {
    if (dialogOpen) return;
    let active = true;
    void loadBackups().then((out) => active && apply(out));
    return () => {
      active = false;
    };
  }, [apply, dialogOpen, state.projectEpoch]);

  // Statusleiste und Datei → Info springen direkt zur Sicherungsliste.
  useEffect(() => {
    if (state.focusRequest !== 'settings-backups') return;
    headingRef.current?.scrollIntoView({ block: 'start' });
    headingRef.current?.focus();
    dispatch({ type: 'requestFocus', target: null });
  }, [state.focusRequest, dispatch]);

  async function runBackup() {
    if (busy) return;
    setBusy(true);
    const out = await backupNow(saveIfNeeded);
    setBusy(false);
    if (out.kind === 'error') return setError(out.message);
    dispatch({ type: 'notice', text: backupNowNotice(out) });
    await reload();
  }

  const backups = list?.backups ?? [];
  const shown = showAll ? backups : backups.slice(0, INITIAL_ROWS);
  const newest = backups.find((b) => !b.damaged);

  return (
    <section aria-labelledby="settings-backups" className="max-w-3xl space-y-3">
      <h2 id="settings-backups" ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
        {BACKUP_TEXTS.sectionTitle}
      </h2>
      <p className="text-sm text-ink-muted">
        {BACKUP_TEXTS.intro} {BACKUP_TEXTS.retention}
      </p>
      {list?.lastError && (
        <ErrorMessage>
          <strong>Letzte automatische Sicherung fehlgeschlagen.</strong> {list.lastError}
        </ErrorMessage>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void runBackup()}
          aria-disabled={busy || undefined}
          className={`${button} flex items-center gap-2`}
        >
          <DatabaseBackup aria-hidden="true" size={16} />
          {busy ? 'Sichert …' : 'Jetzt sichern'}
        </button>
        <span className="text-sm text-ink-muted" data-testid="last-backup">
          {list === null
            ? 'Sicherungen werden gelesen …'
            : newest
              ? `Neueste Sicherung: ${entryDate(newest)}`
              : 'Noch keine Sicherung.'}
        </span>
      </div>

      {backups.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Sicherungen, neueste zuerst</caption>
            <thead className="border-b border-border bg-canvas text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Zeitpunkt
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Anlass
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Inhalt
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Aktion</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {shown.map((b) => (
                <tr key={b.id} data-testid="backup-row">
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{entryDate(b)}</td>
                  <td className={`px-3 py-1.5 ${b.damaged ? 'font-semibold text-danger' : ''}`}>
                    {reasonLabel(b)}
                  </td>
                  <td className="px-3 py-1.5 text-ink-muted">{entryContent(b)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      aria-label={`Sicherung vom ${entryDate(b)} wiederherstellen`}
                      aria-disabled={b.damaged || undefined}
                      title={b.damaged ? BACKUP_TEXTS.damaged : undefined}
                      onClick={() => !b.damaged && dispatch({ type: 'openRestore', backupId: b.id })}
                      className={`flex items-center gap-1.5 rounded-sm px-2 py-1 ${
                        b.damaged ? 'cursor-default text-ink-disabled' : 'hover:bg-hover'
                      }`}
                    >
                      <History aria-hidden="true" size={15} /> Wiederherstellen …
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {backups.length > INITIAL_ROWS && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className={button}>
          {showAll ? 'Weniger anzeigen' : `Alle ${backups.length} Sicherungen anzeigen`}
        </button>
      )}

      <div className="space-y-2 rounded-sm border-l-4 border-accent bg-selected p-3 text-sm">
        <h3 className="font-semibold">Kopie ausserhalb des Computers</h3>
        <p>{BACKUP_TEXTS.notExternal}</p>
        <p data-testid="last-export">
          Letzte Projektübergabe (.ajournal):{' '}
          <strong>{project.lastExportAt ? formatDateTime(project.lastExportAt) : 'noch nie'}</strong>
        </p>
        <button
          type="button"
          onClick={() => dispatch({ type: 'openArchive', mode: 'export' })}
          className={`${button} flex items-center gap-2`}
        >
          <HardDriveUpload aria-hidden="true" size={16} /> Projekt übergeben …
        </button>
      </div>
    </section>
  );
}

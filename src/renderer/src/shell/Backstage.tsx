// Datei-Menü im Stil der Office-«Backstage»-Ansicht: Projekt- und
// Programmfunktionen getrennt vom Schreiben. Esc oder «Zurück» schliesst.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  FileDown,
  FileInput,
  FilePlus,
  FolderOpen,
  Info,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { ARCHIVE_TEXTS } from '@shared/archive';
import { useApp } from '../state/AppContext';
import type { BackstagePage } from '../state/app-state';
import { formatDateTime } from '../project/messages';
import { ConfirmForce, ErrorMessage } from '../project/Notices';
import { useProjectActions } from '../project/useProjectActions';
import { handleRovingKeys } from './roving';

const PAGES: { id: BackstagePage; label: string; icon: LucideIcon }[] = [
  { id: 'neu', label: 'Neu', icon: FilePlus },
  { id: 'oeffnen', label: 'Öffnen', icon: FolderOpen },
  { id: 'importieren', label: 'Importieren', icon: FileInput },
  { id: 'exportieren', label: 'Exportieren', icon: FileDown },
  { id: 'einstellungen', label: 'Einstellungen', icon: Settings },
  { id: 'info', label: 'Info', icon: Info },
];

export function Backstage({
  page,
  onClose,
  version,
}: {
  page: BackstagePage;
  onClose: () => void;
  version: string | null;
}) {
  const { dispatch } = useApp();
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  // Beim Öffnen den Fokus auf den aktiven Menüpunkt setzen
  useEffect(() => {
    currentRef.current?.focus();
  }, []);

  // Fokus im Datei-Menü halten (Tab am Ende springt zum Anfang) + Esc schliesst
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    // Nur Elemente, die per Tab tatsächlich erreichbar sind (tabIndex >= 0).
    // Menüpunkte mit tabindex=-1 (Pfeiltasten-Gruppe) zählen nicht mit.
    const focusables = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]') ?? [],
    ).filter((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled'));
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Datei"
      data-region="backstage"
      className="flex min-h-0 flex-1"
      onKeyDown={onKeyDown}
    >
      <div className="flex w-56 shrink-0 flex-col bg-accent-strong py-2 text-white">
        <button
          type="button"
          onClick={onClose}
          className="mx-2 mb-3 flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-white/15"
          title="Zurück (Esc)"
        >
          <ArrowLeft aria-hidden="true" size={18} /> Zurück
        </button>
        <ul onKeyDown={(e) => handleRovingKeys(e, 'vertical')}>
          {PAGES.map((p) => {
            const current = p.id === page;
            const Icon = p.icon;
            return (
              <li key={p.id}>
                <button
                  ref={current ? currentRef : undefined}
                  type="button"
                  data-roving
                  aria-current={current ? 'page' : undefined}
                  tabIndex={current ? 0 : -1}
                  onClick={() => dispatch({ type: 'openBackstage', page: p.id })}
                  className={`flex w-full items-center gap-3 border-l-[3px] px-4 py-2.5 text-left text-sm ${
                    current
                      ? 'border-white bg-white/20 font-semibold'
                      : 'border-transparent hover:bg-white/10'
                  }`}
                >
                  <Icon aria-hidden="true" size={18} />
                  {p.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <section
        className="min-w-0 flex-1 overflow-auto bg-surface p-10"
        aria-label={PAGES.find((p) => p.id === page)?.label}
      >
        <BackstageContent page={page} version={version} />
      </section>
    </div>
  );
}

function BackstageContent({ page, version }: { page: BackstagePage; version: string | null }) {
  switch (page) {
    case 'neu':
      return <NewPage />;
    case 'oeffnen':
      return <OpenPage />;
    case 'importieren':
      return <ImportPage />;
    case 'exportieren':
      return <ExportPage />;
    case 'einstellungen':
      return <SettingsPage />;
    case 'info':
      return (
        <div className="max-w-2xl space-y-4 text-sm">
          <h2 className="text-2xl font-semibold">Info</h2>
          <p>
            <strong>Lernjournal</strong> {version && <>Version {version}</>}
          </p>
          <ProjectLine />
          <p>
            Lernjournal hilft Lernenden Medientechnolog*innen EFZ, ihre Lerndokumentation (Lernberichte nach
            Art. 12 der Bildungsverordnung) zu führen und daraus ein persönliches Fachbuch aufzubauen.
          </p>
          <p className="rounded-sm border-l-4 border-accent bg-selected p-3">
            <strong>Inoffizielles Hilfsmittel.</strong> Lernjournal wird nicht von SBFI, dpsuisse oder
            Prüfungsorganen herausgegeben. Massgebend sind die Bildungsverordnung, der Bildungsplan und die
            Ausführungsbestimmungen zum Qualifikationsverfahren.
          </p>
          <h3 className="pt-2 text-base font-semibold">Datenschutz</h3>
          <p>
            Alle Daten bleiben auf deinem Computer. Lernjournal braucht kein Konto, sendet nichts ins Internet
            und sammelt keine Nutzungsdaten. Achte beim Weitergeben von Exporten auf Kundendaten,
            Geschäftsgeheimnisse deines Lehrbetriebs und Personen auf Fotos.
          </p>
        </div>
      );
  }
}

// Exportieren (AJ-12/13): geöffnetes Journal direkt als Word, sonst zur Ansicht
// «Export» mit Auswahl eines Journals oder mehrerer Journale (Sammel-DOCX).
// Darunter die Übergabe des ganzen Projekts als .ajournal (AJ-14).
function ExportPage() {
  const { state, dispatch } = useApp();
  const open = state.openJournal;
  return (
    <div className="max-w-2xl space-y-4 text-sm">
      <h2 className="text-2xl font-semibold">Exportieren</h2>
      <p>
        Journale als Word-Dokument ausgeben, z. B. für die Besprechung mit deiner Berufsbildnerin oder deinem
        Berufsbildner. Änderungen in Word fliessen nicht in Lernjournal zurück.
      </p>
      <div className="flex flex-wrap gap-2">
        {open && (
          <button
            type="button"
            className={primaryButton}
            onClick={() => dispatch({ type: 'openExport', journalIds: [open.id] })}
          >
            «{open.title.trim() || 'Ohne Titel'}» als Word exportieren …
          </button>
        )}
        <button
          type="button"
          className={secondaryButton}
          onClick={() => dispatch({ type: 'navigate', view: 'export' })}
        >
          {open ? 'Anderes Journal oder mehrere Journale …' : 'Journal oder mehrere Journale wählen …'}
        </button>
      </div>
      <p className="text-ink-muted">
        Mehrere Journale ergeben ein Dokument mit Titelseite, Inhaltsverzeichnis und jedem Journal auf einer
        neuen Seite.
      </p>
      <section aria-labelledby="bs-archive" className="space-y-3 border-t border-border-subtle pt-5">
        <h3 id="bs-archive" className="text-base font-semibold">
          {ARCHIVE_TEXTS.exportTitle}
        </h3>
        <p>{ARCHIVE_TEXTS.exportIntro}</p>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => dispatch({ type: 'openArchive', mode: 'export' })}
        >
          Projekt übergeben …
        </button>
        <p className="text-ink-muted">{ARCHIVE_TEXTS.exportStorage}</p>
      </section>
    </div>
  );
}

// Importieren (AJ-14): .ajournal-Datei als neues Lernjournal übernehmen
function ImportPage() {
  const { dispatch } = useApp();
  return (
    <div className="max-w-2xl space-y-3 text-sm">
      <h2 className="text-2xl font-semibold">Importieren</h2>
      <p>{ARCHIVE_TEXTS.importIntro}</p>
      <button
        type="button"
        className={primaryButton}
        onClick={() => dispatch({ type: 'openArchive', mode: 'import' })}
      >
        Projekt importieren (.ajournal) …
      </button>
      <p className="text-ink-muted">
        Eine .ajournal-Datei erstellst du auf dem bisherigen Computer unter Datei → Exportieren → «Projekt
        übergeben».
      </p>
    </div>
  );
}

const secondaryButton = 'rounded-sm border border-border-strong px-4 py-2 text-sm hover:bg-hover';
const primaryButton =
  'rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong';

function ProjectLine() {
  const { state } = useApp();
  if (!state.project) return null;
  return (
    <p>
      Geöffnetes Projekt: <strong>{state.project.title}</strong>
      <br />
      <span className="break-all text-ink-muted">{state.project.path}</span>
    </p>
  );
}

function NewPage() {
  const { dispatch } = useApp();
  return (
    <div className="max-w-2xl space-y-3 text-sm">
      <h2 className="text-2xl font-semibold">Neu</h2>
      <p>
        Ein neues Lernjournal ist ein eigener Ordner mit Datenbank, Bildern und Sicherungen. In der Regel
        genügt ein Lernjournal für die ganze Lehre.
      </p>
      <button type="button" className={primaryButton} onClick={() => dispatch({ type: 'openWizard' })}>
        Neues Lernjournal anlegen …
      </button>
    </div>
  );
}

function OpenPage() {
  const { state } = useApp();
  const actions = useProjectActions();
  return (
    <div className="max-w-2xl space-y-4 text-sm">
      <h2 className="text-2xl font-semibold">Öffnen</h2>
      <button
        type="button"
        className={primaryButton}
        onClick={() => void actions.chooseAndOpen()}
        disabled={actions.busy}
      >
        Anderes Lernjournal öffnen …
      </button>
      {actions.error && <ErrorMessage>{actions.error}</ErrorMessage>}
      {actions.confirmForce && (
        <ConfirmForce
          message={actions.confirmForce.message}
          onConfirm={() => void actions.open(actions.confirmForce!.path, true)}
          onCancel={() => actions.setConfirmForce(null)}
        />
      )}
      {state.recent.length > 0 && (
        <section aria-labelledby="bs-recent">
          <h3 id="bs-recent" className="mb-2 font-semibold">
            Zuletzt verwendet
          </h3>
          <ul className="divide-y divide-border-subtle rounded-md border border-border">
            {state.recent.map((r) => {
              const current = state.project?.path.toLowerCase() === r.path.toLowerCase();
              return (
                <li key={r.path}>
                  <button
                    type="button"
                    onClick={() => void actions.open(r.path)}
                    disabled={actions.busy}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {r.title} {current && <span className="font-normal text-ink-muted">(geöffnet)</span>}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">{r.path}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">{formatDateTime(r.lastOpened)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function SettingsPage() {
  const { dispatch } = useApp();
  return (
    <div className="max-w-2xl space-y-3 text-sm">
      <h2 className="text-2xl font-semibold">Einstellungen</h2>
      <p>Profil, Fachrichtung, Lehrbeginn und Speicherort deines Lernjournals.</p>
      <button
        type="button"
        className={primaryButton}
        onClick={() => dispatch({ type: 'navigate', view: 'einstellungen' })}
      >
        Einstellungen öffnen
      </button>
    </div>
  );
}

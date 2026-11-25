// Menüband: «Datei»-Knopf, Register und eine kompakte Befehlszeile.
import { useId, useState } from 'react';
import { LayoutTemplate, Search } from 'lucide-react';
import { journalIdFromHref, journalLinkHref } from '@shared/links';
import { useActiveEditor } from '../editor/EditorContext';
import { CrossRefPicker } from '../editor/CrossRefPicker';
import { LinkDialog } from '../editor/LinkDialog';
import { MerkstelleDialog } from '../editor/MerkstelleDialog';
import { displayTitle, openLinkedJournal } from '../journal/actions';
import { JournalPicker } from '../journal/JournalPicker';
import { DEFAULT_FILTER, isFiltered } from '../journal/journal-filter';
import { JournalFilterFields } from '../journal/JournalFilterFields';
import { useApp } from '../state/AppContext';
import { commands } from '../state/commands';
import { formatShortcut } from '../state/shortcuts';
import { activeLinkKind, inTable, RIBBON, ribbonTabs, type RibbonCtx } from './ribbon-items';
import { RibbonToolbar } from './RibbonToolbar';
import { handleRovingKeys } from './roving';

export function Ribbon({ fileButtonRef }: { fileButtonRef: React.RefObject<HTMLButtonElement | null> }) {
  const { state, dispatch } = useApp();
  const { editor } = useActiveEditor();
  useActiveEditor(); // abonniert «tick»: Knopfzustände folgen der Einfügemarke
  const baseId = useId();
  const [linkOpen, setLinkOpen] = useState(false);
  const [journalLinkOpen, setJournalLinkOpen] = useState(false);
  const fileCmd = commands['file.open'];

  const ctx: RibbonCtx = {
    state,
    dispatch,
    editor,
    openLinkDialog: () => setLinkOpen(true),
    openJournalLinkDialog: () => setJournalLinkOpen(true),
  };
  const linkKind = activeLinkKind(editor);
  // Ziel des Journal-Links an der Einfügemarke (zum Öffnen aus dem Dialog)
  const currentTarget =
    linkKind === 'journal' && editor ? journalIdFromHref(editor.getAttributes('link')['href']) : null;
  const tabs = ribbonTabs(ctx);
  // Kontextuelles Register verschwindet, wenn die Einfügemarke die Tabelle verlässt
  const activeTab = state.ribbonTab === 'tabelle' && !inTable(ctx) ? 'start' : state.ribbonTab;

  return (
    <header data-region="ribbon" aria-label="Menüband" className="border-b border-border bg-surface">
      <div className="flex items-end gap-1 px-2 pt-1">
        <button
          ref={fileButtonRef}
          type="button"
          className="mb-1 rounded-sm bg-action px-3 py-1 text-sm font-semibold text-white hover:bg-action-hover"
          aria-haspopup="dialog"
          aria-expanded={state.backstage !== null}
          aria-keyshortcuts={fileCmd.shortcut}
          title={`${fileCmd.label} (${formatShortcut(fileCmd.shortcut!)})`}
          onClick={() => fileCmd.run(state, dispatch)}
        >
          Datei
        </button>
        <div
          role="tablist"
          aria-label="Register"
          className="flex"
          onKeyDown={(e) => handleRovingKeys(e, 'horizontal', '[role="tab"]')}
        >
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                // Register wechselt schon beim Fokussieren (wie in Office).
                // onMouseDown verhindert, dass der Editor beim Klick den Fokus verliert.
                onMouseDown={(e) => e.preventDefault()}
                onFocus={() => dispatch({ type: 'selectRibbonTab', tab: tab.id })}
                onClick={() => dispatch({ type: 'selectRibbonTab', tab: tab.id })}
                className={`border-b-[3px] px-3 py-1 text-sm ${
                  selected ? 'border-accent font-semibold' : 'border-transparent'
                } ${
                  tab.contextual
                    ? 'ribbon-tab-contextual'
                    : selected
                      ? 'text-ink'
                      : 'text-ink-muted hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-haspopup="dialog"
          disabled={state.creatingJournal !== null}
          onClick={() => dispatch({ type: 'openJournalTemplates' })}
          className="mb-1 ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-accent-strong hover:bg-selected disabled:opacity-50"
        >
          <LayoutTemplate aria-hidden="true" size={16} /> Vorlagen
        </button>
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${activeTab}`}
        className="border-t border-border-subtle bg-ribbon px-2 py-1"
      >
        {activeTab === 'start' && state.view !== 'journal' ? (
          // Ausserhalb des Editors (AJ-25): statt ausgegrauter Formatierung
          // Schnellsuche und Filter – das Dashboard wirkt ruhiger.
          <RibbonSearchBar />
        ) : (
          <RibbonToolbar
            key={activeTab}
            groups={RIBBON[activeTab]}
            ctx={ctx}
            label={`Befehle ${tabs.find((t) => t.id === activeTab)?.label ?? ''}`}
          />
        )}
      </div>
      {linkOpen && editor && (
        <LinkDialog
          initial={linkKind === 'web' ? String(editor.getAttributes('link')['href'] ?? '') : ''}
          onCancel={() => {
            setLinkOpen(false);
            editor.commands.focus();
          }}
          onRemove={
            linkKind === 'web'
              ? () => {
                  setLinkOpen(false);
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                }
              : null
          }
          onSubmit={(url) => {
            setLinkOpen(false);
            const e = editor.chain().focus();
            if (editor.state.selection.empty && !editor.isActive('link')) {
              // Ohne Markierung: Adresse selbst als verlinkten Text einfügen
              e.insertContent({
                type: 'text',
                text: url,
                marks: [{ type: 'link', attrs: { href: url } }],
              }).run();
            } else {
              e.extendMarkRange('link').setLink({ href: url }).run();
            }
          }}
        />
      )}
      {/* Querverweis «[[…]]» (AJ-27) und Merkstelle (AJ-33) für den aktiven Abschnitt */}
      {state.crossRef && editor && !editor.isDestroyed && state.view === 'journal' && (
        <CrossRefPicker
          editor={editor}
          source={state.crossRef.source}
          onClose={() => dispatch({ type: 'closeCrossRef' })}
        />
      )}
      {state.merkstelleDialog && editor && !editor.isDestroyed && state.view === 'journal' && (
        <MerkstelleDialog editor={editor} onClose={() => dispatch({ type: 'closeMerkstelleDialog' })} />
      )}
      {journalLinkOpen && editor && state.openJournal && (
        <JournalPicker
          title="Link zu Journal"
          confirmLabel={linkKind === 'journal' ? 'Link ändern' : 'Link einfügen'}
          excludeIds={[state.openJournal.id]}
          restoreFocus={false}
          note="Der Link zeigt auf das Journal, es wird nichts kopiert. Strg+Klick auf den Link öffnet das Journal; dort erscheint dieses Journal unter «Erwähnt in»."
          actions={
            linkKind === 'journal' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setJournalLinkOpen(false);
                    editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  }}
                  className="rounded-sm px-3 py-2 text-sm hover:bg-hover"
                >
                  Link entfernen
                </button>
                {currentTarget && (
                  <button
                    type="button"
                    onClick={() => {
                      setJournalLinkOpen(false);
                      void openLinkedJournal(dispatch, currentTarget);
                    }}
                    className="rounded-sm px-3 py-2 text-sm hover:bg-hover"
                  >
                    Journal öffnen
                  </button>
                )}
              </>
            ) : null
          }
          onCancel={() => {
            setJournalLinkOpen(false);
            editor.commands.focus();
          }}
          onPick={(id) => {
            setJournalLinkOpen(false);
            const href = journalLinkHref(id);
            const title = displayTitle(state.journals.find((j) => j.id === id)?.title ?? '');
            const e = editor.chain().focus();
            if (editor.state.selection.empty && !editor.isActive('link')) {
              // Ohne Markierung: Titel des Journals als verlinkten Text einfügen.
              // Das Leerzeichen danach beendet den Link, damit Weitertippen normaler Text ist.
              e.insertContent([
                { type: 'text', text: title, marks: [{ type: 'link', attrs: { href } }] },
                { type: 'text', text: ' ' },
              ]).run();
            } else {
              e.extendMarkRange('link').setLink({ href }).run();
            }
          }}
        />
      )}
    </header>
  );
}

// Menüband «Start» ausserhalb eines Journals: Suchfeld (öffnet die
// Schnellsuche Strg+K) und Filter für die Journalliste (Status, Lernort,
// Lehrjahr). Eine Filteränderung zeigt sofort die gefilterte Journalliste.
// Bewusst keine Werkzeugleiste mit Pfeiltasten-Navigation: Die Pfeiltasten
// gehören hier den Auswahllisten.
function RibbonSearchBar() {
  const { state, dispatch } = useApp();
  const quick = commands['search.quick'];
  const filtered = isFiltered({ ...state.journalFilter, text: '' });
  const showList = () => {
    if (state.view !== 'journale') dispatch({ type: 'navigate', view: 'journale' });
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-0.5">
      <button
        type="button"
        aria-keyshortcuts={quick.shortcut}
        onClick={() => quick.run(state, dispatch)}
        className="flex w-80 max-w-full items-center gap-2 rounded-sm border border-border-strong bg-surface px-2.5 py-1 text-left text-sm text-ink-muted hover:border-accent"
      >
        <Search aria-hidden="true" size={16} />
        <span className="flex-1">Journale, Schlagwörter und Text durchsuchen …</span>
        <kbd className="rounded-sm border border-border px-1 text-xs">{formatShortcut(quick.shortcut!)}</kbd>
      </button>
      {/* In der Ansicht «Journale» stehen dieselben Filter direkt über der
          Liste – dort im Menüband nicht noch einmal (keine Doppelungen) */}
      {state.view !== 'journale' && (
        <div role="group" aria-label="Journale filtern" className="flex flex-wrap items-center gap-3">
          <JournalFilterFields onChange={showList} />
          {filtered && (
            <button
              type="button"
              className="rounded-sm px-2 py-1 text-sm text-accent underline hover:bg-hover"
              onClick={() =>
                dispatch({
                  type: 'setJournalFilter',
                  filter: { ...DEFAULT_FILTER, text: state.journalFilter.text },
                })
              }
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

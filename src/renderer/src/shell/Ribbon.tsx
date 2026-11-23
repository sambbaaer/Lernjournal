// Menüband: «Datei»-Knopf, Register und eine kompakte Befehlszeile.
import { useId, useState } from 'react';
import { journalIdFromHref, journalLinkHref } from '@shared/links';
import { useActiveEditor } from '../editor/EditorContext';
import { LinkDialog } from '../editor/LinkDialog';
import { displayTitle, openLinkedJournal } from '../journal/actions';
import { JournalPicker } from '../journal/JournalPicker';
import { useApp } from '../state/AppContext';
import { commands } from '../state/commands';
import { formatShortcut } from '../state/shortcuts';
import { activeLinkKind, inTable, RIBBON, ribbonTabs, type RibbonCtx, type RibbonItem } from './ribbon-items';
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
          className="mb-1 rounded-sm bg-accent px-3 py-1 text-sm font-semibold text-white hover:bg-accent-strong"
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
                  selected
                    ? 'border-accent font-semibold text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink'
                } ${tab.contextual ? 'text-accent-strong' : ''}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${activeTab}`}
        className="border-t border-border-subtle bg-ribbon px-2 py-1"
      >
        <div
          role="toolbar"
          aria-label={`Befehle ${tabs.find((t) => t.id === activeTab)?.label ?? ''}`}
          className="flex flex-wrap items-center gap-y-1"
          onKeyDown={(e) => handleRovingKeys(e, 'horizontal')}
        >
          {RIBBON[activeTab].map((group, gi) => (
            <div
              key={group.id}
              role="group"
              aria-label={group.label}
              className={`flex items-center gap-0.5 px-1 ${gi > 0 ? 'border-l border-border-subtle' : ''}`}
            >
              {group.items.map((item, ii) => (
                <RibbonButton key={item.id} item={item} ctx={ctx} first={gi === 0 && ii === 0} />
              ))}
            </div>
          ))}
        </div>
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

function RibbonButton({ item, ctx, first }: { item: RibbonItem; ctx: RibbonCtx; first: boolean }) {
  const reason = item.disabledReason(ctx);
  const pressed = item.pressed ? item.pressed(ctx) : undefined;
  const Icon = item.icon;
  const shortcut = item.shortcut ? ` (${formatShortcut(item.shortcut)})` : '';
  return (
    <button
      type="button"
      data-roving
      // Nicht verfügbare Befehle bleiben fokussierbar (aria-disabled statt
      // disabled), damit Tastatur- und Screenreader-Nutzende den Grund erfahren.
      aria-disabled={reason ? true : undefined}
      aria-pressed={pressed}
      aria-label={item.label}
      aria-keyshortcuts={item.shortcut}
      aria-description={reason ?? undefined}
      title={`${item.label}${shortcut}${reason ? ` – ${reason}` : ''}`}
      tabIndex={first ? 0 : -1}
      // Klick mit der Maus darf dem Editor den Fokus (und die Markierung) nicht nehmen
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (!reason) item.run?.(ctx);
      }}
      className={`flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-sm px-1.5 text-sm ${
        reason ? 'cursor-default text-ink-disabled' : 'text-ink hover:bg-hover active:bg-pressed'
      } ${pressed ? 'bg-selected outline outline-1 outline-accent' : ''}`}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
      {!item.iconOnly && <span>{item.label}</span>}
    </button>
  );
}

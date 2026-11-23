// Menüband: «Datei»-Knopf, Register und eine kompakte Befehlszeile.
import { useId, useRef } from 'react';
import { useApp } from '../state/AppContext';
import { commands } from '../state/commands';
import { formatShortcut } from '../state/shortcuts';
import { RIBBON, RIBBON_TABS, type RibbonItem } from './ribbon-items';
import { handleRovingKeys } from './roving';

export function Ribbon({ fileButtonRef }: { fileButtonRef: React.RefObject<HTMLButtonElement | null> }) {
  const { state, dispatch } = useApp();
  const baseId = useId();
  const tablistRef = useRef<HTMLDivElement>(null);
  const fileCmd = commands['file.open'];

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
          ref={tablistRef}
          role="tablist"
          aria-label="Register"
          className="flex"
          onKeyDown={(e) => handleRovingKeys(e, 'horizontal', '[role="tab"]')}
        >
          {RIBBON_TABS.map((tab) => {
            const selected = state.ribbonTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                // Register wechselt schon beim Fokussieren (wie in Office)
                onFocus={() => dispatch({ type: 'selectRibbonTab', tab: tab.id })}
                onClick={() => dispatch({ type: 'selectRibbonTab', tab: tab.id })}
                className={`border-b-[3px] px-3 py-1 text-sm ${
                  selected
                    ? 'border-accent font-semibold text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
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
        aria-labelledby={`${baseId}-tab-${state.ribbonTab}`}
        className="border-t border-border-subtle bg-ribbon px-2 py-1"
      >
        <div
          role="toolbar"
          aria-label={`Befehle ${RIBBON_TABS.find((t) => t.id === state.ribbonTab)?.label}`}
          className="flex flex-wrap items-center gap-y-1"
          onKeyDown={(e) => handleRovingKeys(e, 'horizontal')}
        >
          {RIBBON[state.ribbonTab].map((group, gi) => (
            <div
              key={group.id}
              role="group"
              aria-label={group.label}
              className={`flex items-center gap-0.5 px-1 ${gi > 0 ? 'border-l border-border-subtle' : ''}`}
            >
              {group.items.map((item, ii) => (
                <RibbonButton key={item.id} item={item} first={gi === 0 && ii === 0} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

function RibbonButton({ item, first }: { item: RibbonItem; first: boolean }) {
  const { state, dispatch } = useApp();
  const reason = item.disabledReason(state);
  const Icon = item.icon;
  const shortcut = item.shortcut ? ` (${formatShortcut(item.shortcut)})` : '';
  return (
    <button
      type="button"
      data-roving
      // Nicht verfügbare Befehle bleiben fokussierbar (aria-disabled statt
      // disabled), damit Tastatur- und Screenreader-Nutzende den Grund erfahren.
      aria-disabled={reason ? true : undefined}
      aria-label={item.label}
      aria-keyshortcuts={item.shortcut}
      aria-description={reason ?? undefined}
      title={`${item.label}${shortcut}${reason ? ` – ${reason}` : ''}`}
      tabIndex={first ? 0 : -1}
      onClick={() => {
        if (!reason) item.run?.(state, dispatch);
      }}
      className={`flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-sm px-1.5 text-sm ${
        reason ? 'cursor-default text-ink-disabled' : 'text-ink hover:bg-hover active:bg-pressed'
      }`}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
      {!item.iconOnly && <span>{item.label}</span>}
    </button>
  );
}

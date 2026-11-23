// Linke Navigation zwischen den Hauptansichten (SPEC «Navigation»).
import { BookOpen, FileOutput, House, NotebookPen, Settings, type LucideIcon } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { VIEW_LABELS, type View } from '../state/app-state';
import { handleRovingKeys } from './roving';

const ITEMS: { view: View; icon: LucideIcon }[] = [
  { view: 'start', icon: House },
  { view: 'journale', icon: NotebookPen },
  { view: 'fachbuch', icon: BookOpen },
  { view: 'export', icon: FileOutput },
];

export function NavigationPane() {
  const { state, dispatch } = useApp();
  const button = (view: View, Icon: LucideIcon) => {
    // Ein geöffnetes Journal gehört zur Ansicht «Journale»
    const current = state.view === view || (view === 'journale' && state.view === 'journal');
    return (
      <li key={view}>
        <button
          type="button"
          data-roving
          aria-current={current ? 'page' : undefined}
          tabIndex={current ? 0 : -1}
          onClick={() => dispatch({ type: 'navigate', view })}
          // Auswahl zusätzlich mit Balken links markiert – bleibt auch im
          // Windows-Kontrastmodus sichtbar (nicht nur über Hintergrundfarbe)
          className={`flex w-full items-center gap-3 border-l-[3px] px-3 py-2 text-left text-sm ${
            current ? 'border-accent bg-selected font-semibold' : 'border-transparent hover:bg-hover'
          }`}
        >
          <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
          {VIEW_LABELS[view]}
        </button>
      </li>
    );
  };
  return (
    <nav
      data-region="navigation"
      aria-label="Hauptnavigation"
      className="flex w-52 shrink-0 flex-col justify-between border-r border-border bg-surface py-2"
      onKeyDown={(e) => handleRovingKeys(e, 'vertical')}
    >
      <ul>{ITEMS.map((i) => button(i.view, i.icon))}</ul>
      <ul>{button('einstellungen', Settings)}</ul>
    </nav>
  );
}

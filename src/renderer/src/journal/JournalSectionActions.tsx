import { useRef } from 'react';
import { ChevronDown, ChevronUp, Ellipsis, PencilLine, Trash2 } from 'lucide-react';

export function JournalSectionActions({
  label,
  canMoveUp,
  canMoveDown,
  onRename,
  onMove,
  onRemove,
}: {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const toggle = useRef<HTMLElement>(null);

  function close() {
    if (menu.current) menu.current.open = false;
    toggle.current?.focus();
  }

  const actions = [
    { label: 'Umbenennen …', Icon: PencilLine, run: onRename },
    { label: 'Nach oben verschieben', Icon: ChevronUp, run: () => onMove(-1), disabled: !canMoveUp },
    { label: 'Nach unten verschieben', Icon: ChevronDown, run: () => onMove(1), disabled: !canMoveDown },
    { label: 'Abschnitt entfernen …', Icon: Trash2, run: onRemove },
  ];

  return (
    <details
      ref={menu}
      className="relative shrink-0"
      onBlur={(event) => {
        if (menu.current && !event.currentTarget.contains(event.relatedTarget)) menu.current.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu.current?.open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <summary
        ref={toggle}
        title={`Abschnitt bearbeiten · ${label}`}
        aria-label={`Abschnitt bearbeiten · ${label}`}
        className="flex h-7 w-8 cursor-pointer list-none items-center justify-center rounded-md text-ink-muted hover:bg-hover"
      >
        <Ellipsis aria-hidden="true" size={18} />
      </summary>
      <div className="absolute right-0 z-10 mt-1 min-w-52 rounded-md border border-border-strong bg-surface p-1 text-sm shadow-md">
        {actions.map(({ label: action, Icon, run, disabled }) => (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => {
              close();
              run();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-hover disabled:text-ink-disabled"
          >
            <Icon aria-hidden="true" size={16} /> {action}
          </button>
        ))}
      </div>
    </details>
  );
}

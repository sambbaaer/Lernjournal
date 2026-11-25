// Befehlszeile des Menübands: immer EINE Zeile (wie das vereinfachte
// Menüband in Word/Excel). Platzverteilung siehe ribbon-layout.ts.
//
// So funktioniert das Messen: Zwei unsichtbare Kopien der Gruppen (mit und
// ohne Beschriftung) liegen ausserhalb der sichtbaren Leiste. Ein
// ResizeObserver meldet jede Grössenänderung (Fenster, Schrift geladen) –
// dann wird neu verteilt. Die Kopien sind «inert» und aria-hidden, also für
// Tastatur und Bildschirmleser nicht vorhanden.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Ellipsis } from 'lucide-react';
import { formatShortcut } from '../state/shortcuts';
import { fitRibbon, type RibbonLayout } from './ribbon-layout';
import { isMenu, type RibbonCtx, type RibbonEntry, type RibbonGroup, type RibbonItem } from './ribbon-items';
import { handleRovingKeys } from './roving';

const MORE_BUTTON_WIDTH = 44;

function tooltip(item: RibbonItem, reason: string | null) {
  const shortcut = item.shortcut ? ` (${formatShortcut(item.shortcut)})` : '';
  return `${item.label}${shortcut}${item.hint ? ` – ${item.hint}` : ''}${reason ? ` – ${reason}` : ''}`;
}

const buttonClass = (disabled: boolean, pressed: boolean) =>
  `flex h-8 min-w-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 text-sm ${
    disabled ? 'cursor-default text-ink-disabled' : 'text-ink hover:bg-hover active:bg-pressed'
  } ${pressed ? 'bg-selected outline outline-1 outline-accent' : ''}`;

// --- Einzelner Befehl --------------------------------------------------------

function RibbonButton({
  item,
  ctx,
  first,
  compact,
  measure,
}: {
  item: RibbonItem;
  ctx: RibbonCtx;
  first: boolean;
  compact: boolean;
  measure?: boolean;
}) {
  const reason = item.disabledReason(ctx);
  const pressed = item.pressed ? item.pressed(ctx) : undefined;
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-roving={measure ? undefined : true}
      // Nicht verfügbare Befehle bleiben fokussierbar (aria-disabled statt
      // disabled), damit Tastatur- und Screenreader-Nutzende den Grund erfahren.
      aria-disabled={reason ? true : undefined}
      aria-pressed={pressed}
      aria-label={item.label}
      aria-keyshortcuts={item.shortcut}
      aria-description={reason ?? undefined}
      title={tooltip(item, reason)}
      tabIndex={first && !measure ? 0 : -1}
      // Klick mit der Maus darf dem Editor den Fokus (und die Markierung) nicht nehmen
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (!reason) item.run?.(ctx);
      }}
      className={buttonClass(!!reason, !!pressed)}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
      {!item.iconOnly && !compact && <span>{item.label}</span>}
    </button>
  );
}

// --- Aufklapp-Menü (Bausteine, Weitere Befehle) ------------------------------

type MenuSection = { label?: string; items: RibbonItem[] };

// Menüknopf nach WAI-ARIA «Menu Button»: Enter, Leertaste oder Pfeil runter
// öffnet, Pfeiltasten wählen, Enter führt aus, Esc schliesst und gibt den
// Fokus zurück. Die Liste liegt in einem Portal (die Leiste schneidet sonst ab).
function RibbonMenuButton({
  label,
  icon: Icon,
  sections,
  ctx,
  first,
  compact,
  iconOnly = false,
  measure,
}: {
  label: string;
  icon: RibbonItem['icon'];
  sections: MenuSection[];
  ctx: RibbonCtx;
  first: boolean;
  compact: boolean;
  iconOnly?: boolean;
  measure?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Rechte Fensterhälfte: Menü rechtsbündig unter dem Knopf, sonst linksbündig
  const [position, setPosition] = useState<{ left?: number; right?: number; top: number }>({
    left: 0,
    top: 0,
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const all = sections.flatMap((s) => s.items);
  const reasons = all.map((i) => i.disabledReason(ctx));
  // Ganzes Menü nicht verfügbar, wenn kein einziger Befehl geht
  const reason = reasons.every(Boolean) ? (reasons[0] ?? null) : null;
  const pressed = all.some((i) => i.pressed?.(ctx));

  function show() {
    const r = buttonRef.current?.getBoundingClientRect();
    if (r)
      setPosition(
        r.left > window.innerWidth / 2
          ? { right: Math.max(4, window.innerWidth - r.right), top: r.bottom + 2 }
          : { left: Math.max(4, r.left), top: r.bottom + 2 },
      );
    setOpen(true);
  }

  // Beim Öffnen den ersten verfügbaren Befehl fokussieren
  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    const firstEnabled = Array.from(items ?? []).find((el) => !el.hasAttribute('aria-disabled'));
    (firstEnabled ?? items?.[0])?.focus();
    // Klick ausserhalb schliesst (ohne Fokus zurückzuholen)
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function run(item: RibbonItem) {
    if (item.disabledReason(ctx)) return;
    close(false);
    // Fokus SOFORT zurück in den Editor: Tiptaps focus() wartet einen Bildaufbau,
    // und direkt danach getippte Zeichen landeten sonst noch im Menü
    if (ctx.editor && !ctx.editor.isDestroyed) ctx.editor.view.focus();
    item.run?.(ctx);
  }

  function onMenuKey(e: KeyboardEvent) {
    // Nicht an die Werkzeugleiste weitergeben (dort wandern Pfeiltasten)
    e.stopPropagation();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => items[(n + items.length) % items.length]?.focus();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      go(i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      go(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(items.length - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      close(true);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-roving={measure ? undefined : true}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        aria-disabled={reason ? true : undefined}
        aria-description={reason ?? undefined}
        title={reason ? `${label} – ${reason}` : label}
        tabIndex={first && !measure ? 0 : -1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? close(true) : !reason && show())}
        onKeyDown={(e) => {
          if (!reason && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            show();
          }
        }}
        className={buttonClass(!!reason, pressed || open)}
      >
        <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
        {!iconOnly && !compact && <span>{label}</span>}
        {!iconOnly && <ChevronDown aria-hidden="true" size={14} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKey}
            style={position}
            className="fixed z-50 max-h-[70vh] min-w-56 overflow-y-auto rounded-md border border-border-strong bg-surface p-1 text-sm shadow-lg"
          >
            {sections.map((section, si) => (
              <div
                key={section.label ?? si}
                role="group"
                aria-label={section.label}
                className={si > 0 ? 'mt-1 border-t border-border-subtle pt-1' : ''}
              >
                {section.label && (
                  <div aria-hidden="true" className="px-2.5 pb-0.5 pt-1 text-xs font-semibold text-ink-muted">
                    {section.label}
                  </div>
                )}
                {section.items.map((item) => (
                  <MenuItem key={item.id} item={item} ctx={ctx} onRun={() => run(item)} />
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function MenuItem({ item, ctx, onRun }: { item: RibbonItem; ctx: RibbonCtx; onRun: () => void }) {
  const reason = item.disabledReason(ctx);
  const checked = item.pressed ? item.pressed(ctx) : undefined;
  const Icon = item.icon;
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      aria-disabled={reason ? true : undefined}
      aria-description={reason ?? undefined}
      aria-keyshortcuts={item.shortcut}
      title={tooltip(item, reason)}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRun();
        }
      }}
      className={`flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left ${
        reason ? 'cursor-default text-ink-disabled' : 'hover:bg-hover focus:bg-hover'
      } ${checked ? 'font-semibold' : ''}`}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
      <span className="flex-1">{item.label}</span>
      {item.shortcut && <span className="text-xs text-ink-muted">{formatShortcut(item.shortcut)}</span>}
      {checked && <span aria-hidden="true">✓</span>}
    </button>
  );
}

// --- Gruppe und ganze Leiste -------------------------------------------------

function Entry({
  entry,
  ctx,
  first,
  compact,
  measure,
}: {
  entry: RibbonEntry;
  ctx: RibbonCtx;
  first: boolean;
  compact: boolean;
  measure?: boolean;
}) {
  return isMenu(entry) ? (
    <RibbonMenuButton
      label={entry.label}
      icon={entry.icon}
      sections={[{ items: entry.items }]}
      ctx={ctx}
      first={first}
      compact={compact}
      measure={measure}
    />
  ) : (
    <RibbonButton item={entry} ctx={ctx} first={first} compact={compact} measure={measure} />
  );
}

function Group({
  group,
  ctx,
  index,
  compact,
  measure,
}: {
  group: RibbonGroup;
  ctx: RibbonCtx;
  index: number;
  compact: boolean;
  measure?: boolean;
}) {
  return (
    <div
      role={measure ? undefined : 'group'}
      aria-label={measure ? undefined : group.label}
      className={`flex shrink-0 items-center gap-0.5 px-1 ${index > 0 ? 'border-l border-border-subtle' : ''}`}
    >
      {group.items.map((entry, ii) => (
        <Entry
          key={entry.id}
          entry={entry}
          ctx={ctx}
          first={index === 0 && ii === 0}
          compact={compact}
          measure={measure}
        />
      ))}
    </div>
  );
}

// Unsichtbare Kopie zum Messen der Gruppenbreiten
function Measure({
  groups,
  ctx,
  compact,
  innerRef,
}: {
  groups: RibbonGroup[];
  ctx: RibbonCtx;
  compact: boolean;
  innerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={innerRef}
      aria-hidden="true"
      inert
      className="pointer-events-none invisible absolute left-0 top-0 flex w-max whitespace-nowrap"
    >
      {groups.map((g, i) => (
        <Group key={g.id} group={g} ctx={ctx} index={i} compact={compact} measure />
      ))}
    </div>
  );
}

export function RibbonToolbar({
  groups,
  ctx,
  label,
}: {
  groups: RibbonGroup[];
  ctx: RibbonCtx;
  label: string;
}): ReactNode {
  const barRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<RibbonLayout>({ compactFrom: groups.length, visible: groups.length });

  // Neu verteilen, wenn sich die Breite der Leiste oder der Inhalt ändert.
  // Der ResizeObserver meldet sich auch gleich beim Beobachten (erste Messung).
  useLayoutEffect(() => {
    const bar = barRef.current;
    const full = fullRef.current;
    const compact = compactRef.current;
    if (!bar || !full || !compact) return;
    const widths = (el: HTMLElement) =>
      Array.from(el.children).map((c) => (c as HTMLElement).getBoundingClientRect().width);
    const observer = new ResizeObserver(() => {
      const next = fitRibbon(bar.clientWidth, widths(full), widths(compact), MORE_BUTTON_WIDTH);
      setLayout((prev) =>
        prev.compactFrom === next.compactFrom && prev.visible === next.visible ? prev : next,
      );
    });
    observer.observe(bar);
    observer.observe(full);
    observer.observe(compact);
    return () => observer.disconnect();
  }, [groups]);

  const visible = Math.min(layout.visible, groups.length);
  const hidden = groups.slice(visible);

  return (
    // overflow-hidden: die unsichtbaren Messkopien dürfen das Fenster nicht verbreitern
    <div className="relative overflow-hidden">
      <div
        ref={barRef}
        role="toolbar"
        aria-label={label}
        className="flex flex-nowrap items-center overflow-hidden"
        onKeyDown={(e) => handleRovingKeys(e, 'horizontal')}
      >
        {groups.slice(0, visible).map((group, gi) => (
          <Group key={group.id} group={group} ctx={ctx} index={gi} compact={gi >= layout.compactFrom} />
        ))}
        {hidden.length > 0 && (
          <div className="flex shrink-0 items-center border-l border-border-subtle px-1">
            <RibbonMenuButton
              label="Weitere Befehle"
              icon={Ellipsis}
              iconOnly
              ctx={ctx}
              first={false}
              compact
              // Ausgeblendete Gruppen als Abschnitte; Menüs darin werden aufgeklappt
              sections={hidden.map((g) => ({
                label: g.label,
                items: g.items.flatMap((e) => (isMenu(e) ? e.items : [e])),
              }))}
            />
          </div>
        )}
      </div>
      <Measure groups={groups} ctx={ctx} compact={false} innerRef={fullRef} />
      <Measure groups={groups} ctx={ctx} compact innerRef={compactRef} />
    </div>
  );
}

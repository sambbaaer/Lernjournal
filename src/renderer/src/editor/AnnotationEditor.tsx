// Bild-Schnellbeschriftung (AJ-32): Pfeile, Kreise, Nummern und kurze Texte
// direkt im Tool auf ein Foto setzen – ohne Bildbearbeitungsprogramm.
//
// Bedienung mit der Maus: Werkzeug wählen, auf dem Bild ziehen (Pfeil, Kreis)
// bzw. klicken (Nummer, Text). Mit der Tastatur: «In der Mitte hinzufügen»,
// dann in der Liste rechts die Form wählen und mit den Pfeiltasten
// verschieben (Umschalt = grössere Schritte), Entf löscht.
//
// Das Foto bleibt unverändert; gespeichert wird nur die Liste der Formen
// (relativ zur Bildgrösse) im Bild-Knoten des Journals.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Circle, Hash, Trash2, Type, Undo2 } from 'lucide-react';
import {
  ANNOTATION_COLOR_LABELS,
  ANNOTATION_COLORS,
  ANNOTATION_TYPE_LABELS,
  annotationSvg,
  MAX_ANNOTATION_TEXT,
  MAX_ANNOTATIONS,
  type Annotation,
  type AnnotationColor,
} from '@shared/annotations';
import { moveAnnotation, nextNumber, shapeFromDrag } from './annotation-logic';

type Tool = Annotation['type'];
const TOOLS: { id: Tool; icon: typeof Circle }[] = [
  { id: 'arrow', icon: ArrowUpRight },
  { id: 'ellipse', icon: Circle },
  { id: 'number', icon: Hash },
  { id: 'text', icon: Type },
];

export function AnnotationEditor({
  src,
  initial,
  onSave,
  onCancel,
}: {
  src: string;
  initial: Annotation[];
  onSave: (list: Annotation[]) => void;
  onCancel: () => void;
}) {
  const [shapes, setShapes] = useState<Annotation[]>(initial);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState<AnnotationColor>('rot');
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [message, setMessage] = useState('');
  const imgRef = useRef<HTMLImageElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const full = shapes.length >= MAX_ANNOTATIONS;

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);

  // Vorschau während des Ziehens mit anzeigen
  const preview = useMemo(() => {
    if (!drag) return shapes;
    const s = shapeFromDrag(tool, drag.x, drag.y, drag.x2, drag.y2, color);
    return s ? [...shapes, s] : shapes;
  }, [shapes, drag, tool, color]);
  const svg = useMemo(() => annotationSvg(preview, size.w, size.h), [preview, size]);

  function commit(next: Annotation[], note?: string) {
    setHistory((h) => [...h.slice(-30), shapes]);
    setShapes(next);
    if (note) setMessage(note);
  }

  function add(shape: Annotation) {
    if (full) {
      setMessage(`Höchstens ${MAX_ANNOTATIONS} Beschriftungen pro Bild.`);
      return;
    }
    commit([...shapes, shape], `${ANNOTATION_TYPE_LABELS[shape.type]} hinzugefügt.`);
    setSelected(shapes.length);
  }

  function relative(e: PointerEvent): { x: number; y: number } | null {
    const r = imgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function pointShape(x: number, y: number): Annotation | null {
    if (tool === 'number') return { type: 'number', x, y, n: nextNumber(shapes), color };
    if (tool === 'text') {
      const t = text.trim();
      if (!t) {
        setMessage('Zuerst den Text eingeben, dann auf das Bild klicken.');
        return null;
      }
      return {
        type: 'text',
        x: Math.min(x, 0.98),
        y: Math.min(y, 0.95),
        text: t.slice(0, MAX_ANNOTATION_TEXT),
        color,
      };
    }
    return null;
  }

  function onPointerDown(e: PointerEvent) {
    const p = relative(e);
    if (!p) return;
    if (tool === 'number' || tool === 'text') {
      const s = pointShape(p.x, p.y);
      if (s) add(s);
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ x: p.x, y: p.y, x2: p.x, y2: p.y });
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const p = relative(e);
    if (p) setDrag({ ...drag, x2: p.x, y2: p.y });
  }

  function onPointerUp() {
    if (!drag) return;
    const s = shapeFromDrag(tool, drag.x, drag.y, drag.x2, drag.y2, color);
    setDrag(null);
    if (s) add(s);
    else setMessage('Zum Zeichnen auf dem Bild ziehen.');
  }

  // Tastatur: Form in der Bildmitte anlegen (danach mit Pfeiltasten verschieben)
  function addCentered() {
    const s =
      tool === 'arrow' || tool === 'ellipse'
        ? shapeFromDrag(tool, 0.4, 0.4, 0.6, 0.6, color)
        : pointShape(0.5, 0.5);
    if (s) add(s);
  }

  function remove(index: number) {
    commit(
      shapes.filter((_, i) => i !== index),
      'Beschriftung gelöscht.',
    );
    setSelected(null);
  }

  function undo() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(history.slice(0, -1));
    setShapes(prev);
    setSelected(null);
    setMessage('Rückgängig gemacht.');
  }

  function onListKey(e: KeyboardEvent, index: number) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      commit(shapes.map((s, i) => (i === index ? moveAnnotation(s, move[0], move[1]) : s)));
    } else if (e.key === 'Delete') {
      e.preventDefault();
      remove(index);
    }
  }

  function onDialogKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      undo();
    } else if (e.key === 'Tab') {
      // Modal: Fokus im Dialog halten
      const items = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]') ??
          [],
      );
      const i = items.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
    }
  }

  const button =
    'inline-flex items-center gap-1.5 rounded-sm border border-border-strong px-2.5 py-1.5 text-sm hover:bg-hover disabled:opacity-50';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={onDialogKey}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        className="flex max-h-full w-full max-w-6xl flex-col gap-3 rounded-md bg-surface p-4 shadow-xl"
      >
        <h2 id={`${baseId}-title`} className="text-lg font-semibold">
          Bild beschriften
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Werkzeug" className="flex gap-1">
            {TOOLS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={tool === id}
                data-autofocus={id === 'arrow' ? '' : undefined}
                onClick={() => setTool(id)}
                className={`${button} ${tool === id ? 'bg-selected outline outline-1 outline-accent' : ''}`}
              >
                <Icon aria-hidden="true" size={16} /> {ANNOTATION_TYPE_LABELS[id]}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Farbe" className="flex gap-1">
            {(Object.keys(ANNOTATION_COLORS) as AnnotationColor[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                onClick={() => setColor(c)}
                className={`${button} ${color === c ? 'bg-selected outline outline-1 outline-accent' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-block size-3.5 rounded-full"
                  style={{ background: ANNOTATION_COLORS[c] }}
                />
                {ANNOTATION_COLOR_LABELS[c]}
              </button>
            ))}
          </div>
          {tool === 'text' && (
            <label className="flex items-center gap-2 text-sm">
              Text
              <input
                value={text}
                maxLength={MAX_ANNOTATION_TEXT}
                onChange={(e) => setText(e.target.value)}
                placeholder="z. B. Farbwerk 4"
                className="w-48 rounded-sm border border-border-strong px-2 py-1 text-sm"
              />
            </label>
          )}
          <button type="button" className={button} onClick={addCentered} disabled={full}>
            In der Mitte hinzufügen
          </button>
          <button type="button" className={button} onClick={undo} disabled={history.length === 0}>
            <Undo2 aria-hidden="true" size={16} /> Rückgängig
          </button>
        </div>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-sm bg-canvas p-2">
            <span className="lj-annotated">
              <img
                ref={imgRef}
                src={src}
                alt="Bild, das beschriftet wird"
                draggable={false}
                onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="block max-h-[65vh] max-w-full select-none"
              />
              <span
                aria-hidden="true"
                className="lj-annotation-layer"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              {/* Zeichenfläche über Bild und Beschriftung (Maus/Stift/Touch) */}
              <span
                aria-hidden="true"
                className="absolute inset-0 cursor-crosshair touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
              />
            </span>
          </div>
          <div className="flex w-64 shrink-0 flex-col gap-2">
            <h3 className="text-sm font-semibold">
              Beschriftungen ({shapes.length}/{MAX_ANNOTATIONS})
            </h3>
            {shapes.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Noch keine. Werkzeug wählen und auf dem Bild ziehen oder klicken.
              </p>
            ) : (
              <ul aria-label="Beschriftungen" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {shapes.map((s, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={selected === i}
                      aria-description="Pfeiltasten verschieben, Umschalt für grosse Schritte, Entf löscht"
                      onClick={() => setSelected(i)}
                      onKeyDown={(e) => onListKey(e, i)}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-hover ${
                        selected === i ? 'bg-selected' : ''
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block size-3 shrink-0 rounded-full"
                        style={{ background: ANNOTATION_COLORS[s.color] }}
                      />
                      <span className="truncate">
                        {ANNOTATION_TYPE_LABELS[s.type]}
                        {s.type === 'number' ? ` ${s.n}` : s.type === 'text' ? ` «${s.text}»` : ''} ·{' '}
                        {ANNOTATION_COLOR_LABELS[s.color]}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`${ANNOTATION_TYPE_LABELS[s.type]} löschen`}
                      onClick={() => remove(i)}
                      className="rounded-sm p-1.5 hover:bg-hover"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {shapes.length > 0 && (
              <button
                type="button"
                className={button}
                onClick={() => commit([], 'Alle Beschriftungen entfernt.')}
              >
                Alle entfernen
              </button>
            )}
          </div>
        </div>
        <p role="status" className="min-h-5 text-sm text-ink-muted">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={button} onClick={onCancel}>
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => onSave(shapes)}
            className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
          >
            Übernehmen
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

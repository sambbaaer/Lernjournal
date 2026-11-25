// Darstellung eines Bildes mit Legende im Editor (Tiptap-NodeView).
// Die Legende ist ein normales Eingabefeld; ihr Inhalt wird als Attribut des
// Knotens gespeichert und beim Word-Export als «Abbildung n: …» ausgegeben.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { ImageOff, PenLine } from 'lucide-react';
import { annotationSvg, describeAnnotations, parseAnnotations } from '@shared/annotations';
import { AnnotationEditor } from './AnnotationEditor';
import { captionFocus } from './insert-image';

export function FigureView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const mediaId = String(node.attrs['mediaId'] ?? '');
  const caption = String(node.attrs['caption'] ?? '');
  const [broken, setBroken] = useState(false);
  const [editing, setEditing] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Bild-Schnellbeschriftung (AJ-32): SVG deckungsgleich über dem Foto
  const annotations = useMemo(() => parseAnnotations(node.attrs['annotations']), [node.attrs]);
  const overlay = useMemo(
    () => (natural && annotations.length ? annotationSvg(annotations, natural.w, natural.h) : null),
    [annotations, natural],
  );
  const src = `app://lernjournal/media/${mediaId}`;

  // Frisch eingefügt: Cursor ins Legendenfeld
  useEffect(() => {
    if (captionFocus.mediaId === mediaId) {
      captionFocus.mediaId = null;
      inputRef.current?.focus();
    }
  }, [mediaId]);

  return (
    <NodeViewWrapper
      as="figure"
      className={`lj-figure ${selected ? 'is-selected' : ''}`}
      data-media-id={mediaId}
    >
      {broken ? (
        <div className="flex h-32 items-center justify-center gap-2 rounded-sm border border-dashed border-border text-sm text-ink-muted">
          <ImageOff aria-hidden="true" size={18} /> Bilddatei fehlt
        </div>
      ) : (
        <span className="lj-annotated">
          <img
            src={src}
            alt={
              (caption || 'Bild ohne Legende') +
              (annotations.length ? ` – beschriftet: ${describeAnnotations(annotations)}` : '')
            }
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setBroken(true)}
          />
          {overlay && (
            <span
              aria-hidden="true"
              className="lj-annotation-layer"
              dangerouslySetInnerHTML={{ __html: overlay }}
            />
          )}
        </span>
      )}
      {!broken && editor.isEditable && (
        <button
          type="button"
          contentEditable={false}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEditing(true)}
          className="lj-figure-annotate"
        >
          <PenLine aria-hidden="true" size={14} />
          {annotations.length ? `Beschriftung bearbeiten (${annotations.length})` : 'Bild beschriften …'}
        </button>
      )}
      {editing && (
        <AnnotationEditor
          src={src}
          initial={annotations}
          onCancel={() => {
            setEditing(false);
            editor.commands.focus();
          }}
          onSave={(list) => {
            setEditing(false);
            updateAttributes({ annotations: list });
          }}
        />
      )}
      <figcaption>
        <input
          ref={inputRef}
          aria-label="Bildlegende"
          value={caption}
          maxLength={500}
          placeholder="Legende hinzufügen, z. B. «Kontrollstreifen auf dem Druckbogen»"
          onChange={(e) => updateAttributes({ caption: e.target.value, alt: e.target.value })}
          onKeyDown={(e) => {
            // Enter: zurück in den Text unterhalb des Bildes
            if (e.key === 'Enter') {
              e.preventDefault();
              const pos = typeof getPos === 'function' ? getPos() : undefined;
              if (pos === undefined) return;
              // Fokus SOFORT in den Editor (Tiptaps focus() wartet einen Bildaufbau –
              // schnell getippte Zeichen landeten sonst noch in der Legende)
              e.currentTarget.blur();
              editor.commands.setTextSelection(pos + node.nodeSize);
              editor.view.focus();
            }
          }}
        />
      </figcaption>
    </NodeViewWrapper>
  );
}

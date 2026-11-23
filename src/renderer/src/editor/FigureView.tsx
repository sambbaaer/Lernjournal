// Darstellung eines Bildes mit Legende im Editor (Tiptap-NodeView).
// Die Legende ist ein normales Eingabefeld; ihr Inhalt wird als Attribut des
// Knotens gespeichert und beim Word-Export als «Abbildung n: …» ausgegeben.
import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { ImageOff } from 'lucide-react';
import { captionFocus } from './insert-image';

export function FigureView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const mediaId = String(node.attrs['mediaId'] ?? '');
  const caption = String(node.attrs['caption'] ?? '');
  const [broken, setBroken] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        <img
          src={`app://lernjournal/media/${mediaId}`}
          alt={caption || 'Bild ohne Legende'}
          draggable={false}
          onError={() => setBroken(true)}
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

// Bilder ins Journal einfügen: aufbereiten, im Projekt speichern, Knoten «figure»
// an der Einfügemarke (oder Drop-Position) einsetzen.
import type { Editor } from '@tiptap/react';
import type { Action } from '../state/app-state';
import { ImageError, processImage } from './image-processing';

// Nach dem Einfügen soll der Cursor direkt ins Legendenfeld (FigureView liest das)
export const captionFocus = { mediaId: null as string | null };

export async function insertImages(
  editor: Editor,
  files: File[],
  journalId: string,
  dispatch: (a: Action) => void,
  pos?: number,
): Promise<void> {
  const images = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (images.length === 0) return;
  let insertAt = pos;
  for (const file of images) {
    dispatch({ type: 'notice', text: `Bild «${file.name}» wird eingefügt …` });
    try {
      const { data, name } = await processImage(file);
      const res = await window.lernjournal.media.add({ journalId, data, originalName: name });
      if (!res.ok) throw new ImageError(res.error.message);
      const node = { type: 'figure', attrs: { mediaId: res.data.id, caption: '', alt: '' } };
      captionFocus.mediaId = res.data.id;
      if (insertAt !== undefined) {
        editor.chain().insertContentAt(insertAt, node).run();
        insertAt += 1;
      } else {
        editor.chain().focus().insertContent(node).run();
      }
      dispatch({ type: 'notice', text: 'Bild eingefügt. Tipp: Eine Legende erklärt, was zu sehen ist.' });
    } catch (err) {
      dispatch({
        type: 'notice',
        text: err instanceof ImageError ? err.message : `«${file.name}» konnte nicht eingefügt werden.`,
      });
    }
  }
}

// Nativer Dateidialog über ein unsichtbares Dateifeld (funktioniert in der Sandbox)
export function pickImageFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

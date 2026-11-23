// Welcher der drei Abschnitts-Editoren ist gerade aktiv? Das Menüband wirkt
// auf den zuletzt fokussierten Editor (wie Word auf die aktuelle Einfügemarke).
// «tick» zählt Änderungen, damit das Menüband z. B. «Fett» als gedrückt zeigt.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';

type Ctx = {
  editor: Editor | null;
  setEditor: (e: Editor | null) => void;
  tick: number;
  bump: () => void;
};
const EditorContext = createContext<Ctx | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [editor, setEditorState] = useState<Editor | null>(null);
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const setEditor = useCallback((e: Editor | null) => setEditorState((cur) => (cur === e ? cur : e)), []);
  const value = useMemo(() => ({ editor, setEditor, tick, bump }), [editor, setEditor, tick, bump]);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useActiveEditor(): Ctx {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useActiveEditor() ausserhalb von <EditorProvider>');
  return ctx;
}

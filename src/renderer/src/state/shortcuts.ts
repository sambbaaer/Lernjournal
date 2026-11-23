// Tastenkürzel als Text («Ctrl+Shift+F») beschreiben und mit einem
// Tastaturereignis vergleichen. Eine Stelle für Logik, Tooltips und Hilfe:
// Was im Tooltip steht, ist garantiert auch das, was funktioniert.

export type Shortcut = { ctrl: boolean; shift: boolean; alt: boolean; key: string };

// Minimal das, was wir aus einem KeyboardEvent brauchen (testbar ohne DOM).
export type KeyLike = {
  key: string;
  ctrlKey: boolean;
  metaKey?: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export function parseShortcut(text: string): Shortcut {
  const parts = text.split('+').map((p) => p.trim());
  const key = parts.pop();
  if (!key) throw new Error(`Leeres Tastenkürzel: «${text}»`);
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  for (const m of mods) {
    if (!['ctrl', 'shift', 'alt'].includes(m)) throw new Error(`Unbekannte Taste «${m}» in «${text}»`);
  }
  return { ctrl: mods.has('ctrl'), shift: mods.has('shift'), alt: mods.has('alt'), key: key.toLowerCase() };
}

export function matchesShortcut(event: KeyLike, shortcut: string | Shortcut): boolean {
  const s = typeof shortcut === 'string' ? parseShortcut(shortcut) : shortcut;
  // Ctrl auf Windows; metaKey (Cmd) zählt mit, falls später ein Mac-Build kommt.
  const ctrl = event.ctrlKey || Boolean(event.metaKey);
  return (
    ctrl === s.ctrl &&
    event.shiftKey === s.shift &&
    event.altKey === s.alt &&
    event.key.toLowerCase() === s.key
  );
}

// Anzeige im Tooltip mit deutscher Tastenbeschriftung: «Strg+Umschalt+F».
export function formatShortcut(text: string): string {
  const s = parseShortcut(text);
  const parts: string[] = [];
  if (s.ctrl) parts.push('Strg');
  if (s.alt) parts.push('Alt');
  if (s.shift) parts.push('Umschalt');
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key.charAt(0).toUpperCase() + s.key.slice(1));
  return parts.join('+');
}

// Suchen im geöffneten Journal (Strg+F) mit der CSS Custom Highlight API.
//
// Warum nicht die Seitensuche von Chromium (webContents.findInPage)? Sie findet
// den Begriff auch im Suchfeld selbst und nimmt dem Suchfeld bei jedem Schritt
// den Fokus. Diese Lösung markiert Treffer nur optisch – ohne den Text, die
// Auswahl oder den Fokus zu verändern – und durchsucht nur die Journalseite.

export type FindState = { ranges: Range[]; active: number };

// Alle Vorkommen (ohne Gross-/Kleinschreibung) in Textknoten unterhalb von root
export function findRanges(root: Element, query: string): Range[] {
  const q = query.trim().toLocaleLowerCase('de-CH');
  if (!q) return [];
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('[data-find-ignore], input, textarea, script, style')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? '').toLocaleLowerCase('de-CH');
    let from = 0;
    for (let i = text.indexOf(q, from); i !== -1; i = text.indexOf(q, from)) {
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + q.length);
      ranges.push(r);
      from = i + q.length;
    }
  }
  return ranges;
}

// Markierungen setzen: alle Treffer hell, aktiver Treffer kräftig; aktiven Treffer zeigen
export function paint(state: FindState): void {
  if (!('highlights' in CSS)) return;
  CSS.highlights.set('lj-find', new Highlight(...state.ranges));
  const active = state.ranges[state.active];
  if (active) {
    CSS.highlights.set('lj-find-active', new Highlight(active));
    active.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'instant' });
  } else {
    CSS.highlights.delete('lj-find-active');
  }
}

export function clearPaint(): void {
  if (!('highlights' in CSS)) return;
  CSS.highlights.delete('lj-find');
  CSS.highlights.delete('lj-find-active');
}

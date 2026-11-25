// Platzverteilung im Menüband – reine Logik, ohne Oberfläche testbar.
//
// Vorbild ist das vereinfachte Menüband von Word und Excel: Die Befehle
// stehen immer in EINER Zeile. Wird das Fenster schmaler,
//   1. verlieren die Gruppen von rechts nach links ihre Beschriftungen (nur
//      noch Symbole mit Tooltip),
//   2. dann wandern ganze Gruppen von rechts in «Weitere Befehle» (…).
// Nie entsteht eine zweite Zeile, die die Dokumentfläche nach unten schiebt.

export type RibbonLayout = {
  // Gruppen ab diesem Index nur mit Symbolen (Beschriftung im Tooltip und für
  // Bildschirmleser). Gleich der Anzahl Gruppen = alle mit Beschriftung.
  compactFrom: number;
  // Anzahl Gruppen, die sichtbar bleiben; der Rest steht unter «Weitere Befehle»
  visible: number;
};

// Wie in Office: Zuerst verlieren die Gruppen ganz rechts ihre Beschriftung,
// dann die links davon … Erst wenn alle nur noch Symbole zeigen und es immer
// noch nicht passt, wandern Gruppen von rechts in «Weitere Befehle».
export function fitRibbon(
  available: number,
  fullWidths: readonly number[],
  compactWidths: readonly number[],
  moreButtonWidth: number,
): RibbonLayout {
  const count = fullWidths.length;
  // Ein Pixel Spielraum gegen Rundungsfehler bei Zoom/Skalierung
  const limit = available - 1;
  let total = fullWidths.reduce((a, b) => a + b, 0);
  let compactFrom = count;
  while (total > limit && compactFrom > 0) {
    compactFrom--;
    total += compactWidths[compactFrom]! - fullWidths[compactFrom]!;
  }
  if (total <= limit) return { compactFrom, visible: count };
  let visible = count;
  total += moreButtonWidth;
  // Mindestens eine Gruppe bleibt sichtbar
  while (visible > 1 && total > limit) {
    visible--;
    total -= compactWidths[visible]!;
  }
  return { compactFrom: 0, visible };
}

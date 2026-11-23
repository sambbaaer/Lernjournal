// Vorschlag-Kategorien bei Projektanlage (R-05): die 7 Handlungskompetenz-
// bereiche aus dem Bildungsplan Medientechnologin/Medientechnologe EFZ
// (Berufsnummer 34200, Stand 12.10.2018) – siehe docs/QUELLEN.md, Abschnitt 2.4.
// Lernende können sie abwählen, umbenennen oder löschen (Einfachheit vor Vollständigkeit).
export const BIPLA_CATEGORIES: readonly { code: string; name: string }[] = [
  { code: 'a', name: 'a – Umsetzen von produktionsbezogenen Massnahmen' },
  { code: 'b', name: 'b – Betreuen und Beraten von Kundinnen und Kunden' },
  { code: 'c', name: 'c – Planen und Vorbereiten der Arbeiten' },
  { code: 'd', name: 'd – Aufbereiten von Daten' },
  { code: 'e', name: 'e – Ausführen von Druckaufträgen' },
  { code: 'f', name: 'f – Ausführen von Weiterverarbeitungsaufträgen und nachgelagerten Arbeiten' },
  { code: 'g', name: 'g – Warten und Instandhalten von Druckmaschinen' },
];

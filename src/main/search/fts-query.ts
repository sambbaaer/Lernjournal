// Suchbegriffe der Lernenden → sichere FTS5-Abfrage.
//
// Warum nicht einfach die Eingabe an MATCH übergeben? FTS5 hat eine eigene
// Abfragesprache (AND, OR, NOT, Klammern, Anführungszeichen, «*», «:»). Eine
// Eingabe wie «Farbe (CMYK» oder «NOT» würde sonst einen Syntaxfehler werfen
// oder etwas anderes suchen als gemeint. Darum zerlegen wir die Eingabe selbst
// in Wörter und bauen die Abfrage aus lauter Wörtern in Anführungszeichen.
//
// Regeln (für Lernende, nicht für Fachleute – wie Strg+F in Word):
//  - Alle Wörter müssen vorkommen (UND), Reihenfolge egal.
//  - Auch Wortteile zählen: «messung» findet «Farbmessung», «maschine» die
//    «Druckmaschine» (Trigramm-Index, wichtig bei zusammengesetzten Wörtern).
//  - Gross/Klein und Akzente egal (Tokenizer «trigram remove_diacritics 1»).
//  - Umlaut-Schreibweisen egal: «Kuehlung», «Kühlung» und «Kuhlung» finden
//    einander, ebenso «Strasse» und «Straße» (Varianten mit OR).
//  - Wörter mit weniger als 3 Zeichen werden ignoriert (ein Trigramm-Index
//    kann sie nicht finden; siehe ADR 0004).
import { MIN_WORD_LENGTH, searchableWords } from '@shared/search';

// Schreibvarianten eines (klein geschriebenen) Wortes. Jede Regel wird auf
// alle bisherigen Varianten angewendet, damit auch Kombinationen entstehen
// («strasse» + «ä» …). Ergebnis ist eine kleine Menge (höchstens 16).
export function spellingVariants(word: string): string[] {
  const rules: ((w: string) => string)[] = [
    (w) => w.replace(/ß/g, 'ss'),
    (w) => w.replace(/ss/g, 'ß'),
    // Umschreibung → Umlaut ohne Punkte (der Index vergleicht «ü» als «u»)
    (w) => w.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u'),
    // Umlaut → Umschreibung (falls im Journal «Kuehlung» steht)
    (w) => w.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'),
  ];
  let variants = new Set([word]);
  for (const rule of rules) variants = new Set([...variants, ...[...variants].map(rule)]);
  // Zu kurz gewordene Varianten («que» → «qu») findet der Index nicht
  return [...variants].filter((v) => v === word || v.length >= MIN_WORD_LENGTH);
}

// FTS5-Abfrage oder null, wenn die Eingabe kein suchbares Wort enthält.
// Wörter werden mit explizitem AND verbunden: Das implizite UND (Leerzeichen)
// erlaubt FTS5 nur zwischen einfachen Phrasen, nicht nach einer Klammer.
// Ein Wort in Anführungszeichen ist für FTS5 immer nur Text – Schlüsselwörter
// wie «NOT» verlieren so ihre Bedeutung. Anführungszeichen können in den
// Wörtern nicht vorkommen (nur Buchstaben/Ziffern), Escaping ist also unnötig.
export function buildFtsQuery(input: string): string | null {
  const words = searchableWords(input);
  if (words.length === 0) return null;
  return words
    .map((w) => {
      const alternatives = spellingVariants(w).map((v) => `"${v}"`);
      return alternatives.length === 1 ? alternatives[0]! : `(${alternatives.join(' OR ')})`;
    })
    .join(' AND ');
}

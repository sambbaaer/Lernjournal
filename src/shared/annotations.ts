// Bild-Schnellbeschriftung (AJ-32): Pfeile, Kreise, Nummern und kurze Texte
// über einem Foto (Maschine, Werkstück, Druckbogen, Skizze).
//
// Nicht destruktiv: Die Formen liegen als kleine Liste im Bild-Knoten des
// Journals (Attribut «annotations»), das Foto selbst bleibt unverändert. So
// lässt sich jede Beschriftung später ändern oder entfernen.
//
// Koordinaten sind relativ zur Bildgrösse (0 = links/oben, 1 = rechts/unten).
// Dadurch passt die Beschriftung bei jeder Anzeigegrösse – im Editor, im PDF
// und im Word-Export (dort als zusammengerechnetes Bild).
//
// annotationSvg() erzeugt EINE SVG-Darstellung für alle drei Stellen, damit
// Editor, PDF und Word garantiert gleich aussehen.
import { z } from 'zod';

export const ANNOTATION_COLORS = {
  rot: '#e0242b',
  gelb: '#f2b705',
  blau: '#1d6fdc',
} as const;
export type AnnotationColor = keyof typeof ANNOTATION_COLORS;
export const ANNOTATION_COLOR_LABELS: Record<AnnotationColor, string> = {
  rot: 'Rot',
  gelb: 'Gelb',
  blau: 'Blau',
};

export const MAX_ANNOTATIONS = 40;
export const MAX_ANNOTATION_TEXT = 80;

const unit = z.number().finite().min(0).max(1);
const color = z.enum(Object.keys(ANNOTATION_COLORS) as [AnnotationColor, ...AnnotationColor[]]);

export const AnnotationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('arrow'), x1: unit, y1: unit, x2: unit, y2: unit, color }),
  z.strictObject({
    type: z.literal('ellipse'),
    x: unit,
    y: unit,
    w: z.number().finite().min(0.01).max(1),
    h: z.number().finite().min(0.01).max(1),
    color,
  }),
  z.strictObject({ type: z.literal('number'), x: unit, y: unit, n: z.number().int().min(1).max(99), color }),
  z.strictObject({
    type: z.literal('text'),
    x: unit,
    y: unit,
    text: z.string().trim().min(1).max(MAX_ANNOTATION_TEXT),
    color,
  }),
]);
export type Annotation = z.infer<typeof AnnotationSchema>;
export const AnnotationsSchema = z.array(AnnotationSchema).max(MAX_ANNOTATIONS);

export const ANNOTATION_TYPE_LABELS: Record<Annotation['type'], string> = {
  arrow: 'Pfeil',
  ellipse: 'Kreis',
  number: 'Nummer',
  text: 'Text',
};

// Ungültiges oder Fehlendes → leere Liste (Anzeige soll nie abstürzen)
export function parseAnnotations(value: unknown): Annotation[] {
  const r = AnnotationsSchema.safeParse(value);
  return r.success ? r.data : [];
}

// Kurze Beschreibung für Bildschirmleser und Suche: «1 Pfeil, Nummer 1, Text «Rakel»»
export function describeAnnotations(list: readonly Annotation[]): string {
  return list
    .map((a) => {
      switch (a.type) {
        case 'arrow':
          return 'Pfeil';
        case 'ellipse':
          return 'Kreis';
        case 'number':
          return `Nummer ${a.n}`;
        case 'text':
          return `Text «${a.text}»`;
      }
    })
    .join(', ');
}

// Texte der Beschriftungen (für Suchindex und Klartext)
export function annotationTexts(list: readonly Annotation[]): string[] {
  return list.flatMap((a) => (a.type === 'text' ? [a.text] : []));
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// SVG über einem Bild der Grösse width × height (Pixel). Strichstärke und
// Schrift wachsen mit der Bildgrösse, damit sie auch auf grossen Fotos lesbar sind.
export function annotationSvg(list: readonly Annotation[], width: number, height: number): string {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const base = Math.max(w, h);
  const stroke = Math.max(2, base * 0.006);
  const font = Math.max(12, base * 0.028);
  const parts: string[] = [];
  for (const a of list) {
    const c = ANNOTATION_COLORS[a.color];
    switch (a.type) {
      case 'arrow': {
        const x1 = a.x1 * w;
        const y1 = a.y1 * h;
        const x2 = a.x2 * w;
        const y2 = a.y2 * h;
        // Pfeilspitze als Dreieck am Ende (x2/y2)
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = stroke * 5;
        const p1 = [x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45)];
        const p2 = [x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45)];
        // Linie endet vor der Spitze, damit sie nicht über die Spitze hinausragt
        const ex = x2 - head * 0.8 * Math.cos(angle);
        const ey = y2 - head * 0.8 * Math.sin(angle);
        parts.push(
          `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="white" stroke-width="${stroke * 2}" stroke-linecap="round" opacity="0.7"/>`,
          `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="${c}" stroke-width="${stroke}" stroke-linecap="round"/>`,
          `<polygon points="${x2},${y2} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}" fill="${c}" stroke="white" stroke-width="${stroke * 0.4}"/>`,
        );
        break;
      }
      case 'ellipse': {
        const cx = (a.x + a.w / 2) * w;
        const cy = (a.y + a.h / 2) * h;
        const rx = (a.w / 2) * w;
        const ry = (a.h / 2) * h;
        parts.push(
          `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="white" stroke-width="${stroke * 2}" opacity="0.7"/>`,
          `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="${stroke}"/>`,
        );
        break;
      }
      case 'number': {
        const r = font * 0.75;
        const cx = a.x * w;
        const cy = a.y * h;
        parts.push(
          `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" stroke="white" stroke-width="${stroke * 0.6}"/>`,
          `<text x="${cx}" y="${cy}" fill="${a.color === 'gelb' ? '#1a1a1a' : 'white'}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${font}" text-anchor="middle" dominant-baseline="central">${a.n}</text>`,
        );
        break;
      }
      case 'text': {
        // Callout: Textfeld mit farbigem Rahmen; Breite grob aus der Zeichenzahl
        const x = a.x * w;
        const y = a.y * h;
        const pad = font * 0.35;
        const boxW = Math.min(w - x, a.text.length * font * 0.56 + pad * 2);
        const boxH = font * 1.4;
        parts.push(
          `<rect x="${x}" y="${y}" width="${Math.max(boxW, font)}" height="${boxH}" rx="${pad}" fill="white" fill-opacity="0.92" stroke="${c}" stroke-width="${stroke * 0.8}"/>`,
          `<text x="${x + pad}" y="${y + boxH / 2}" fill="#1a1a1a" font-family="Segoe UI, Arial, sans-serif" font-size="${font}" dominant-baseline="central">${esc(a.text)}</text>`,
        );
        break;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none">${parts.join('')}</svg>`;
}

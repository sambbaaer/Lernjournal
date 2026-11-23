// Zeigt Text mit Treffermarkierungen (Steuerzeichen \u0002 … \u0003 aus der Suche)
// als <mark>. Kein dangerouslySetInnerHTML: Journalinhalte bleiben reiner Text.
import { HL_END, HL_START } from '@shared/ipc';

export function Highlight({ text }: { text: string }) {
  const parts: { t: string; hit: boolean }[] = [];
  let rest = text;
  while (rest.length > 0) {
    const s = rest.indexOf(HL_START);
    if (s === -1) {
      parts.push({ t: rest, hit: false });
      break;
    }
    if (s > 0) parts.push({ t: rest.slice(0, s), hit: false });
    const e = rest.indexOf(HL_END, s + 1);
    const end = e === -1 ? rest.length : e;
    parts.push({ t: rest.slice(s + 1, end), hit: true });
    rest = e === -1 ? '' : rest.slice(e + 1);
  }
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-highlight px-0.5 text-ink">
            {p.t}
          </mark>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  );
}

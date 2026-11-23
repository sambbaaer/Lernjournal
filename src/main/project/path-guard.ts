// Freigabeliste für Ordnerpfade (SPEC: «validierte Dateipfade»).
//
// Die Oberfläche schickt Pfade an den Hauptprozess (z. B. «öffne dieses
// Projekt»). Damit ein kompromittierter Renderer nicht beliebige Ordner
// anlegen oder öffnen kann, akzeptieren wir nur Pfade, die
//   - der Nutzer im nativen Windows-Dialog gewählt hat,
//   - in der Liste «Zuletzt geöffnet» stehen oder
//   - der Hauptprozess selbst vorgeschlagen hat.
import path from 'node:path';

export class PathGuard {
  private readonly allowed = new Set<string>();

  // Windows unterscheidet bei Pfaden nicht zwischen Gross- und Kleinschreibung
  private key(p: string): string {
    const resolved = path.resolve(p);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  allow(p: string): void {
    this.allowed.add(this.key(p));
  }

  isAllowed(p: string): boolean {
    // Nur absolute Pfade; relative Angaben wie «..\\..» werden nicht aufgelöst
    if (!path.isAbsolute(p)) return false;
    return this.allowed.has(this.key(p));
  }
}

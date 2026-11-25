// Dauerhafte MCP-Einstellungen dieses Windows-Benutzers: Zugangsschlüssel und
// «automatisch aktivieren».
//
// Warum dauerhaft? Früher entstand bei jeder Aktivierung ein neuer Schlüssel.
// Jeder MCP-Client (Claude Desktop, VS Code, Claude Code …) musste danach neu
// eingerichtet werden – in der Praxis «funktionierte MCP nicht». Jetzt bleibt
// der Schlüssel gleich, bis die Lernenden ihn selbst erneuern.
//
// Wo? Im userData-Ordner der App (Store-MSIX leitet in den Paket-Container um,
// Portable-EXE nutzt %APPDATA%\Lernjournal). Die Datei muss eine Deinstallation
// nicht überleben (AGENTS.md): Fehlt sie, entsteht einfach ein neuer Schlüssel.
// Bewusst NICHT im Projektordner – der wird auf USB-Sticks kopiert und
// weitergegeben, der Schlüssel gehört aber zu diesem Computer.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Stored = { token: string; autoStart: boolean };

// 32 zufällige Bytes, base64url → 43 Zeichen ohne Sonderzeichen (passt in Header und JSON)
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export class McpAccessStore {
  // Erst beim ersten Zugriff laden: Ein zweiter Programmstart, der sich sofort
  // wieder beendet (Einzelinstanz), soll keine Datei anlegen.
  private cached: Stored | null = null;

  constructor(private readonly file: string) {}

  private get data(): Stored {
    return (this.cached ??= this.load());
  }

  private set data(value: Stored) {
    this.cached = value;
  }

  get token(): string {
    return this.data.token;
  }

  get autoStart(): boolean {
    return this.data.autoStart;
  }

  setAutoStart(enabled: boolean) {
    this.data = { ...this.data, autoStart: enabled };
    this.save();
  }

  // Neuer Schlüssel: Alle bisher eingerichteten Clients verlieren den Zugang.
  renew(): string {
    this.data = { ...this.data, token: newToken() };
    this.save();
    return this.data.token;
  }

  private load(): Stored {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Stored>;
      if (typeof raw.token === 'string' && TOKEN.test(raw.token))
        return { token: raw.token, autoStart: raw.autoStart === true };
    } catch {
      // Fehlt oder beschädigt → neu anlegen (unten)
    }
    const fresh = { token: newToken(), autoStart: false };
    this.save(fresh);
    return fresh;
  }

  // Atomar schreiben (Temp-Datei + Umbenennen); nur für den eigenen Benutzer lesbar.
  // Ein Schreibfehler (z. B. schreibgeschützter Ordner) bricht nichts ab: Der
  // Schlüssel gilt dann bis zum Programmende.
  private save(value: Stored = this.data) {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch (err) {
      console.error(`[mcp] Einstellungen nicht gespeichert: ${(err as Error).message}`);
    }
  }
}

function newToken() {
  return randomBytes(32).toString('base64url');
}

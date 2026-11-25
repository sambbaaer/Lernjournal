# MCP: Lernjournal mit einem KI-Assistenten verbinden

## Was ist MCP?

**MCP** steht für «Model Context Protocol». Das ist ein offener Standard, über den ein KI-Assistent wie Claude mit Programmen auf deinem Computer arbeiten kann. Man kann es sich wie einen Stecker vorstellen: Lernjournal bietet eine Steckdose an, der Assistent steckt sich ein und erhält genau die Werkzeuge, die Lernjournal ihm gibt.

Mit MCP kann ein Assistent in deinem geöffneten Projekt

- Journale **suchen und lesen**,
- **Textkorrekturen vorschlagen** (z. B. Rechtschreibung, klarere Formulierungen),
- **passende Journale zum Verknüpfen vorschlagen**,
- auf ausdrücklichen Wunsch einen **neuen Entwurf vorschlagen**.

**Lernjournal ändert nie etwas von selbst.** Jeder Vorschlag erscheint in Lernjournal unter **Einstellungen → MCP** und wird erst übernommen, wenn du auf **Übernehmen** bzw. **Entwurf anlegen** klickst. Löschen, Archivieren, Abgeben oder ein anderes Projekt öffnen kann der Assistent nicht.

MCP ist freiwillig. Ohne MCP funktioniert Lernjournal genau gleich.

### Datenschutz in einem Satz

Die Verbindung zwischen Assistent und Lernjournal läuft nur auf deinem Computer (`127.0.0.1`), aber der Assistent kann die gelesenen Texte an seinen eigenen Dienst senden (bei Claude an Anthropic). Verbinde also nur einen Assistenten, dem du deine Journale anvertraust, und achte auf Geschäftsgeheimnisse und Kundendaten.

## So funktioniert es (Überblick)

```
Claude Desktop ──stdio──▶ Lernjournal-Erweiterung (.mcpb) ──HTTP 127.0.0.1:47651──▶ Lernjournal
Claude Code / VS Code ────────────────────────────────────HTTP 127.0.0.1:47651──▶ Lernjournal
```

- Lernjournal lauscht nur, wenn du MCP aktivierst, und nur auf deinem eigenen Computer.
- Jeder Client braucht den **Zugangsschlüssel**. Er bleibt gleich, bis du ihn unter **Einstellungen → MCP → Schlüssel erneuern** änderst. Darum musst du jeden Assistenten nur **einmal** einrichten.
- Lernjournal muss geöffnet sein, ein Projekt muss offen sein und MCP muss aktiv sein. Tipp: **«Beim Öffnen eines Projekts automatisch aktivieren»** einschalten.

## Einrichtung

### Schritt 1: MCP in Lernjournal aktivieren

1. Lernjournal öffnen und dein Projekt öffnen.
2. **Einstellungen → MCP → MCP für dieses Projekt aktivieren**.
3. Empfohlen: **Beim Öffnen eines Projekts automatisch aktivieren** anhaken.

### Schritt 2: Assistent einrichten (einmalig)

#### Claude Desktop (Windows, macOS) – empfohlen

1. In Lernjournal: **Einstellungen → MCP → Erweiterung für Claude Desktop speichern …**. Es entsteht die Datei `Lernjournal.mcpb` (Vorschlag: Ordner «Downloads»).
2. Die Datei doppelklicken. Claude Desktop öffnet sich und zeigt die Erweiterung «Lernjournal». Auf **Installieren** klicken.
   Alternativ in Claude Desktop: **Einstellungen → Erweiterungen**, dann die Datei ins Fenster ziehen.
3. Fertig. In einem neuen Chat z. B. fragen: «Welche Journale habe ich im Lernjournal?»

Claude Desktop bringt die nötige Laufzeit selbst mit. Du musst nichts weiter installieren, auch kein Node.js. Das funktioniert auch auf dem eingeschränkten Schul-Laptop, sofern Claude Desktop installiert ist.

> **Nicht so:** In Claude unter «Konnektoren → Benutzerdefinierten Konnektor hinzufügen» die Adresse `http://127.0.0.1:47651/mcp` eintragen. Solche Konnektoren verbindet Claude aus dem Internet (aus der Anthropic-Cloud). Diese erreicht Lernjournal auf deinem Computer nie. Das war der häufigste Grund, warum «MCP nicht funktionierte».

#### Claude Code (Kommandozeile, Windows/macOS/Linux)

1. In Lernjournal: **Befehl für Claude Code kopieren**.
2. In PowerShell oder im Terminal einfügen und ausführen. Der Befehl sieht so aus:

```bash
claude mcp add --transport http lernjournal http://127.0.0.1:47651/mcp --header "Authorization: Bearer <Zugangsschlüssel>"
```

3. Prüfen mit `claude mcp list`. «lernjournal» sollte als verbunden erscheinen, solange Lernjournal mit aktivem MCP läuft.

#### VS Code (GitHub Copilot) und andere Clients mit HTTP-Unterstützung

1. In Lernjournal: **Einrichtung (JSON) kopieren**.
2. In VS Code: Befehlspalette (`Ctrl+Shift+P`) → **MCP: Open User Configuration** → kopierten Block einfügen (bzw. den Eintrag unter `servers` ergänzen):

```json
{
  "servers": {
    "lernjournal": {
      "type": "http",
      "url": "http://127.0.0.1:47651/mcp",
      "headers": { "Authorization": "Bearer <Zugangsschlüssel>" }
    }
  }
}
```

Andere Clients brauchen dieselben drei Angaben: Transport **Streamable HTTP**, Adresse und Header `Authorization: Bearer <Zugangsschlüssel>`. Die Felder heissen je nach Client etwas anders. Adresse und Schlüssel lassen sich in Lernjournal einzeln kopieren.

## Werkzeuge

| Werkzeug | Funktion |
|---|---|
| `journal_search` | Bestehende Journale suchen oder ohne Suchbegriff auflisten. |
| `journal_read` | Journaltext, Abschnitte, Verknüpfungen und die Revision für Textkorrekturen lesen. |
| `journal_propose_edit` | Einen eindeutigen Text innerhalb eines Absatzes ersetzen oder einen Absatz anhängen. |
| `journal_propose_link` | Zwei bestehende Journale für eine beidseitig sichtbare Verknüpfung vorschlagen. |
| `journal_propose_draft` | Nach separater Freigabe einen Lernbericht als Entwurf vorschlagen. |
| `proposal_status` | Den Status einer Einzelfreigabe anhand ihrer ID abfragen. |

Solange Lernjournal nicht erreichbar ist, zeigt die Claude-Desktop-Erweiterung stattdessen das Werkzeug `lernjournal_verbindung`. Es erklärt, was zu tun ist. Sobald Lernjournal mit aktivem MCP läuft, lädt Claude die echten Werkzeuge automatisch nach.

Bei einer Überarbeitung siehst du in Lernjournal den bisherigen und den vorgeschlagenen Text. Wurde das Journal inzwischen geändert, wird der Vorschlag nicht übernommen. Der Assistent kann den aktuellen Stand erneut lesen und einen neuen Vorschlag machen.

**Neue Journalentwürfe** erlaubst du separat mit «Neue Journalentwürfe vorschlagen erlauben». Diese Erlaubnis gilt nur für die laufende Freigabe.

## Fehlerbehebung

| Was du siehst | Ursache | Lösung |
|---|---|---|
| Claude sagt, Lernjournal sei nicht erreichbar (Werkzeug `lernjournal_verbindung`) | Lernjournal ist geschlossen, kein Projekt offen oder MCP nicht aktiv. | Lernjournal und Projekt öffnen, MCP aktivieren. Am besten «automatisch aktivieren» einschalten. |
| «Der Zugangsschlüssel passt nicht» bzw. HTTP 401 | Schlüssel wurde erneuert. | Erweiterung neu speichern und installieren bzw. Befehl/JSON neu kopieren. |
| Konnektor in Claude mit URL `127.0.0.1` funktioniert nicht | Konnektoren laufen über die Anthropic-Cloud. | Stattdessen die Erweiterung `Lernjournal.mcpb` verwenden. |
| Gelber Hinweis «Der übliche Anschluss (Port) war belegt» | Ein anderes Programm nutzt Port 47651. | Lernjournal neu starten. Bleibt der Hinweis, das andere Programm beenden. |
| HTTP 403 | Aufruf nicht an `127.0.0.1` oder `localhost`, oder von einer Webseite aus. | Adresse aus Lernjournal kopieren. Webseiten dürfen bewusst nicht zugreifen. |
| HTTP 503 | Das freigegebene Projekt wurde geschlossen oder gewechselt. | Projekt wieder öffnen und MCP aktivieren. |

Protokolle von Claude Desktop liegen unter Windows meist in `%APPDATA%\Claude\logs\` (Datei mit «lernjournal» im Namen). Dort meldet sich die Brücke mit `[lernjournal-bridge]`.

## Technischer Hintergrund

- **Transport:** Streamable HTTP nach MCP-Spezifikation 2025-11-25, offizielles TypeScript-SDK, zustandslos. [MCP-Transportspezifikation](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- **Sicherheit:** Bindung nur an `127.0.0.1`; Prüfung von Host (`127.0.0.1` oder `localhost` mit Port 47651), Origin und Bearer-Schlüssel (zeitkonstanter Vergleich). Der Schlüssel liegt in `mcp.json` im App-Datenordner, nie im Projektordner, weil dieser kopiert und weitergegeben wird. Ein Projektwechsel verwirft offene Vorschläge.
- **Claude Desktop:** Claude Desktop startet lokale MCP-Server nur über stdio. Die Erweiterung `Lernjournal.mcpb` ist ein [MCP Bundle](https://github.com/modelcontextprotocol/mcpb) mit einer kleinen Brücke (`src/main/mcp/bridge/lernjournal-bridge.mjs`, nur Node-Bordmittel). Sie leitet stdio an HTTP weiter. Adresse und Schlüssel stehen im Manifest der Erweiterung.
- **Microsoft Store (MSIX):** Lernjournal läuft als Desktop-App mit voller Vertrauensstufe («runFullTrust»), nicht in einem AppContainer. Die Loopback-Sperre für AppContainer-Apps betrifft deshalb weder Lernjournal noch Claude Desktop, VS Code oder Claude Code. Die Windows-Firewall fragt nicht nach, weil nur `127.0.0.1` verwendet wird. [Microsoft zu IPC und Loopback](https://learn.microsoft.com/en-us/windows/apps/develop/communication/interprocess-communication#loopback)
- Entscheide: [ADR 0011](adr/0011-lokaler-mcp-zugang.md)

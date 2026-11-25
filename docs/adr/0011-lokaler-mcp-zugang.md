# ADR 0011 – Lokaler MCP-Zugang

**Status** angenommen am 24.11.2026.

Das Microsoft-Store-taugliche klassische Win32-Modell erlaubt die lokale Kommunikation mit einem laufenden Desktop-Prozess. MCP läuft bei Bedarf im bestehenden Electron-Hauptprozess über Streamable HTTP. Renderer-Sandbox, Electron-Fuses und die Sperre ausgehender Internetzugriffe bleiben aktiv. Der Listener bindet an `127.0.0.1`, prüft Host, Origin und einen zufälligen Sitzungsschlüssel und wird beim Projektwechsel oder Schliessen beendet. Protokoll und Tool-Schemata verwenden das offizielle TypeScript-SDK. [MCP-Transportspezifikation](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) · [Microsoft zur MSIX-Containerisierung](https://learn.microsoft.com/en-us/windows/msix/msix-containerization-overview)

Der MCP-Zugang bietet Suche und Lesen für das ausdrücklich freigegebene Projekt. Schreibwerkzeuge reichen Vorschläge ein. Die Liste mit Vorschlägen und Beschlüssen bleibt im Arbeitsspeicher der Freigabe. Nur die App-Oberfläche kann Vorschläge bestätigen. Sie zeigt die Textänderung bzw. die Namen der zu verknüpfenden Journale. Das Öffnen eines anderen Projekts verwirft offene Vorschläge und die Freigabe für neue Entwürfe.

Textkorrekturen verwenden Abschnitts-IDs, eindeutige Textstellen und eine Revision aus Titel und Editorinhalt. Speichern nutzt den bestehenden Journal- und Link-Dienst mit Validierung, Transaktion und Suchindex. Neue Einträge werden ausschliesslich als Entwürfe angelegt, nachdem die separate Option aktiv und der einzelne Vorschlag bestätigt wurde.

## Nachtrag 25.11.2026 – Einrichtung, die tatsächlich funktioniert

Nach der Store-Veröffentlichung liess sich MCP in der Praxis nicht verbinden. Ursachen:

1. **Claude Desktop** erreicht lokale HTTP-Server nicht: «Benutzerdefinierte Konnektoren» werden aus der Anthropic-Cloud verbunden, `claude_desktop_config.json` kennt nur stdio-Server. [Claude-Hilfe zu Remote-MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
2. Der **Zugangsschlüssel** entstand bei jeder Aktivierung neu, jede Einrichtung war nach dem nächsten Start ungültig.
3. Clients mit `localhost` statt `127.0.0.1` erhielten wegen der Host-Prüfung **403**.

Entscheid:

- Der Schlüssel bleibt pro Windows-Benutzer bestehen (`mcp.json` im userData-Ordner, nicht im Projektordner) und wird nur auf Wunsch erneuert. Ein Erneuern gilt sofort.
- Host und Origin dürfen `127.0.0.1` oder `localhost` mit dem eigenen Port sein. Der Schutz vor DNS-Rebinding bleibt erhalten.
- Opt-in «Beim Öffnen eines Projekts automatisch aktivieren» (Standard aus).
- Für Claude Desktop erzeugt Lernjournal eine Erweiterung `Lernjournal.mcpb` ([MCP Bundle](https://github.com/modelcontextprotocol/mcpb)) mit einer stdio-Brücke aus Node-Bordmitteln. Claude Desktop führt sie mit seiner eingebauten Node-Laufzeit aus. Ist Lernjournal nicht erreichbar, antwortet die Brücke selbst mit einem Hinweis-Werkzeug und meldet `tools/list_changed`, sobald die Verbindung steht.
- Verworfen: eine stdio-Betriebsart der Lernjournal-EXE über den App Execution Alias. Sie bräuchte eine zweite Instanz neben der Einzelinstanz-Sperre und funktioniert mit der portablen EXE (selbstentpackend) nicht zuverlässig.


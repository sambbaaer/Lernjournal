# ADR 0011 – Lokaler MCP-Zugang

**Status** angenommen am 24.11.2026.

Das Microsoft-Store-taugliche klassische Win32-Modell erlaubt die lokale Kommunikation mit einem laufenden Desktop-Prozess. MCP läuft bei Bedarf im bestehenden Electron-Hauptprozess über Streamable HTTP. Renderer-Sandbox, Electron-Fuses und die Sperre ausgehender Internetzugriffe bleiben aktiv. Der Listener bindet an `127.0.0.1`, prüft Host, Origin und einen zufälligen Sitzungsschlüssel und wird beim Projektwechsel oder Schliessen beendet. Protokoll und Tool-Schemata verwenden das offizielle TypeScript-SDK. [MCP-Transportspezifikation](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) · [Microsoft zur MSIX-Containerisierung](https://learn.microsoft.com/en-us/windows/msix/msix-containerization-overview)

Der MCP-Zugang bietet Suche und Lesen für das ausdrücklich freigegebene Projekt. Schreibwerkzeuge reichen Vorschläge ein. Die Liste mit Vorschlägen und Beschlüssen bleibt im Arbeitsspeicher der Freigabe. Nur die App-Oberfläche kann Vorschläge bestätigen. Sie zeigt die Textänderung bzw. die Namen der zu verknüpfenden Journale. Das Öffnen eines anderen Projekts verwirft offene Vorschläge und die Freigabe für neue Entwürfe.

Textkorrekturen verwenden Abschnitts-IDs, eindeutige Textstellen und eine Revision aus Titel und Editorinhalt. Speichern nutzt den bestehenden Journal- und Link-Dienst mit Validierung, Transaktion und Suchindex. Neue Einträge werden ausschliesslich als Entwürfe angelegt, nachdem die separate Option aktiv und der einzelne Vorschlag bestätigt wurde.

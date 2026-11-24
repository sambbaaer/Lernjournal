# MCP in Lernjournal verwenden

## Verbinden

1. Öffne dein Projekt und wähle **Einstellungen → MCP → MCP für dieses Projekt aktivieren**.
2. Füge deinem lokalen MCP-Client einen Server mit dem Transport **Streamable HTTP** hinzu. Kopiere die Adresse aus Lernjournal. Sie beginnt mit `http://127.0.0.1:` und endet mit `/mcp`.
3. Kopiere den **Zugangsschlüssel**. Setze ihn im Client als Bearer-Token. Falls der Client HTTP-Header erwartet, heisst der Header `Authorization` und hat den Wert `Bearer <Zugangsschlüssel>`.

Die Freigabe gilt für das gerade geöffnete Projekt. Nach dem Schliessen, Wechseln oder Deaktivieren endet sie. Bei der nächsten Freigabe erstellt Lernjournal einen neuen Zugangsschlüssel. Ein verbundener Client kann den Text des Projekts lesen und je nach Anbieter an einen Dienst weitergeben.

## Journale bearbeiten

| Werkzeug | Funktion |
|---|---|
| `journal_search` | Bestehende Journale suchen oder ohne Suchbegriff auflisten. |
| `journal_read` | Journaltext, Abschnitte, Verknüpfungen und die Revision für Textkorrekturen lesen. |
| `journal_propose_edit` | Einen eindeutigen Text innerhalb eines Absatzes ersetzen oder einen Absatz anhängen. |
| `journal_propose_link` | Zwei bestehende Journale für eine beidseitig sichtbare Verknüpfung vorschlagen. |
| `journal_propose_draft` | Nach separater Freigabe einen Lernbericht als Entwurf vorschlagen. |
| `proposal_status` | Den Status einer Einzelfreigabe anhand ihrer ID abfragen. |

Neue Vorschläge erscheinen unter **Einstellungen → MCP**. Bei einer Überarbeitung siehst du den bisherigen und den vorgeschlagenen Text. Wenn sich das Journal inzwischen geändert hat, kann der Client den aktuellen Stand erneut lesen und einen neuen Vorschlag erstellen.

**Neue Journalentwürfe** kannst du für die laufende Verbindung separat erlauben. Jeder Entwurf wird erst mit **Entwurf anlegen** gespeichert. Der Client erhält dadurch keine Berechtigung zur Löschung, Archivierung, Abgabe oder zum Projektwechsel.

## Windows Store

Der Listener läuft im Hauptprozess der geöffneten Electron-App. Der Microsoft Store kann einen klassischen Win32-Installer als EXE verteilen. Dieses Modell verwendet weiterhin den üblichen Desktop-Prozess. Für MSIX hängt die Verbindung auch von der Vertrauensstufe und den Loopback-Regeln des vorgesehenen Clients ab. Die Prüfung einer konkreten MSIX- oder Store-Installation steht separat aus. [Win32-Verteilung im Microsoft Store](https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store) · [Microsoft zu IPC und Loopback](https://learn.microsoft.com/en-us/windows/apps/develop/communication/interprocess-communication#loopback)

# ADR 0010 – PDF-Export, QV-Vormerkung und Farbschema

**Status** angenommen am 24.11.2026.

## PDF

Einzel- und Sammel-PDF verwenden die bereits für DOCX aufbereiteten Journaldaten und Medien. Das helle Drucklayout enthält den gespeicherten Rich Text in HTML. Nutzereingaben werden HTML-kodiert. Bilder werden nur über bereits aufgelöste Medien-IDs geliefert und für PDF auf die benötigte Druckauflösung verkleinert.

Das Druckfenster läuft mit Sandbox, separater flüchtiger Session, gesperrtem Netzwerk und ohne Skripte oder Preload. `printToPDF` erzeugt durchsuchbare, getaggte PDFs mit Seitenzahlen und Dokumentgliederung. Der gemeinsame Exporthandler verwendet den nativen Speichern-Dialog und atomares Schreiben. Der Exporthinweis gilt für beide Formate. [Electron-Dokumentation zu `printToPDF`](https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions)

## QV und Darstellung

Schema v6 ergänzt die freiwillige Vormerkung `qv_selected` am Journal. Bestehende Journale und Duplikate haben standardmässig keine Vormerkung. Sicherungen und Projektübergabe enthalten den Wert als Teil der SQLite-Datenbank. Die Vormerkung lässt sich im Sammelexport in die bestehende sortierbare Auswahl übernehmen. Das Ziel von standardmässig zwölf Journalen ist ein konfigurierbarer Hinweis.

Farbschema und QV-Mindestanzahl sind lokale App-Einstellungen. Gemeinsame CSS-Farbwerte passen die Oberfläche an das gewählte Farbschema an. Windows-Kontrastdesigns verwenden weiterhin Systemfarben.

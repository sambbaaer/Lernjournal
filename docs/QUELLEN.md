# Lernjournal – Offizielle Grundlagen und abgeleitete Anforderungen

Stand: 2026-11-23. Dieses Dokument trennt strikt zwischen **offiziellen Vorgaben** (Bund, OdA, Prüfungsorganisation) und **eigenen Produktentscheiden**. Anforderungen mit Kennung `R-xx` werden in SPEC und BACKLOG referenziert.

**Verifikationsstatus:**
- ✔ = Wortlaut bzw. Inhalt aus der Quelle bestätigt
- ◐ = sinngemäss aus Sekundärquelle/Suchauszug, Original-PDF noch gegenlesen
- ? = offen, vor Umsetzung des betroffenen Tickets klären

## 1. Quellenverzeichnis

| Nr. | Dokument | Herausgeber | Stand | Fundort | Status |
|---|---|---|---|---|---|
| Q1 | Verordnung des SBFI über die berufliche Grundbildung Medientechnologin/Medientechnologe EFZ (BiVo), SR 412.101.221.03 | SBFI | 12.10.2018, in Kraft 1.1.2019; konsolidierte Fassung 1.4.2024 | fedlex.admin.ch (SR 412.101.221.03) | ◐ |
| Q2 | Bildungsplan Medientechnologin/Medientechnologe EFZ (Berufsnummer 34200) | OdA (heute dpsuisse), genehmigt SBFI | 12.10.2018 | [dpsuisse.ch – Bildungsplan PDF](https://dpsuisse.ch/hubfs/Grundbildung/Medientechnologe/medientechnologe_bipla_d_215521.pdf?hsLang=de) | ✔ (Struktur via BiPla-Datenbank) |
| Q3 | Ausführungsbestimmungen zum Qualifikationsverfahren Medientechnologe EFZ (Print), inkl. Unterlagen IPA | dpsuisse / Prüfungskommission | aktuelle Fassung auf dpsuisse.ch prüfen | [dpsuisse.ch – Unterlagen Ausbildung + QV](https://dpsuisse.ch/unterlagen-ausbildung-qv), [copyprintsuisse.ch – Ausführungsbestimmungen](https://www.copyprintsuisse.ch/dokumente/medientechnologe/Medientechnologe_Ausfuehrungsbestimmungen_d.pdf) | ◐ |
| Q4 | Informationen zur Grundbildung Medientechnologe EFZ (Lerndokumentation, Bildungsbericht, Checklisten) | COPYPRINTSUISSE | – | [copyprintsuisse.ch – Grundbildung](https://www.copyprintsuisse.ch/pages/grundbildung.html) | ◐ |
| Q5 | QV Fachrichtung Siebdruck (VPA) | Verband Werbetechnik+Print | – | [vwp.swiss – QV Siebdruck](https://www.vwp.swiss/bildung/ausbildungen/medientechnologe-in-fachrichtung-siebdruck-efz/qualifikationsverfahren-qv-medientechnologin-medientechnologe-siebdruck-efz/) | ◐ |
| Q6 | Lerndokumentation und Bildungsbericht (berufsneutral), Formulare | SDBB / berufsbildung.ch | – | [berufsbildung.ch – Dokumentieren und bewerten](https://www.berufsbildung.ch/de/lehrverlauf/dokumentieren-und-bewerten), [Lexikon Bildungsbericht](https://www.berufsbildung.ch/de/lexikon/bildungsbericht) | ◐ |
| Q7 | Lerndokumentationen – Überblick | EHB (heute EHB/SFUVET) | – | [edudoc.ch – EHB Lerndokumentationen](https://edudoc.ch/record/99550/files/EHB_Lerndokumentationen_Ueberblick.pdf) | ? |
| Q8 | Bundesgesetz über den Datenschutz (DSG), SR 235.1 | Bund | in Kraft 1.9.2023 | fedlex.admin.ch | ✔ (allgemein bekannt) |
| Q9 | Web Content Accessibility Guidelines (WCAG) 2.2 | W3C | 2023 | w3.org | ✔ |

Hinweis: fedlex.admin.ch und dpsuisse.ch waren aus der Planungsumgebung nicht direkt abrufbar. Die Inhalte stammen aus Suchauszügen und der BiPla-Datenbank «Lern mit Ben». **Vor Implementierung von AJ-18 bis AJ-21 sind Q1 und Q3 im Original gegenzulesen** (Ticket AJ-00c). Die QV-Eckwerte (12 Lerndokumentationen, PDF-Upload) sind fachlich bestätigt, siehe Abschnitt 4.

## 2. Was die Vorgaben sagen

### 2.1 Lerndokumentation (BiVo, 7. Abschnitt, Art. 12) – Q1 ◐
Sinngemäss nach dem SBFI-Mustertext, der in den Bildungsverordnungen verwendet wird:
1. Die lernende Person führt während der Bildung in beruflicher Praxis eine Lerndokumentation, in der sie laufend die wesentlichen Arbeiten im Zusammenhang mit den zu erwerbenden Handlungskompetenzen festhält.
2. Die Berufsbildnerin oder der Berufsbildner kontrolliert und unterzeichnet die Lerndokumentation **mindestens einmal pro Semester** und bespricht sie mit der lernenden Person.

Das Führen ist **obligatorisch** (Q4).

### 2.2 Bildungsbericht (BiVo, Art. 13 ff.) – Q1/Q6 ◐
Die Berufsbildnerin oder der Berufsbildner hält den Bildungsstand am Ende jedes Semesters in einem Bildungsbericht fest und bespricht ihn mit der lernenden Person. Im SDBB-Gesprächsablauf wird die Lerndokumentation dabei kommentiert. **Der Bildungsbericht ist Aufgabe des Lehrbetriebs, nicht der lernenden Person** – er gehört nicht in die App (höchstens als Verweis).

### 2.3 Qualifikationsverfahren (QV) – Q3/Q4/Q5 ◐
- Fachrichtungen **Print** und **Printmediatechnik**: individuelle praktische Arbeit (**IPA**) mit Ausführung/Resultat, Dokumentation und Fachgespräch. Gewichtungen laut Ausführungsbestimmungen (Werte im Original prüfen).
- Laut COPYPRINTSUISSE werden **mindestens 12 Lerndokumentationen mit der Aufgabenstellung eingereicht**; sie bilden die **Grundlage für das Fachgespräch** am Schluss der IPA. **Fachlich bestätigt (2026-11-23) für Print und Printmediatechnik.** ✔
- Die Lerndokumentationen **dürfen während der praktischen Arbeit als Hilfsmittel** verwendet werden.
- dpsuisse: Die IPA-Dokumentation wird in **PkOrg hochgeladen**; Fachkraft/Expertinnen können zusätzlich eine gedruckte Fassung verlangen. Upload-Format **PDF** (fachlich bestätigt), keine Maximalgrösse bekannt. ✔
- Fachrichtung **Siebdruck**: vorgegebene praktische Arbeit (**VPA**, ca. 20 Stunden im Lehrbetrieb, Q5). Ob dort Lerndokumentationen eingereicht werden: **?**
- Widerspruch klären **?**: Eine dpsuisse-Information hält fest, das Fachgespräch beziehe sich «ausschliesslich auf die Projektarbeit». Ob das für Medientechnologe EFZ oder nur für andere Berufe gilt, ist offen.

### 2.4 Bildungsplan – Q2 ✔
- 7 Handlungskompetenzbereiche (a–g), 34 Handlungskompetenzen, 133 Leistungsziele.
- Jedes Leistungsziel kann an bis zu drei Lernorten vorkommen (Betrieb, Berufsfachschule, üK), jeweils mit eigener Taxonomiestufe K1–K6. Im Betrieb sind 86 von 118 Zielen K3 («Anwenden»).
- 70 Ziele sind fachrichtungsspezifisch (Print, Printmediatechnik, Siebdruck).
- Kompetenzdimensionen: Fach-, Methoden-, Sozial- und Selbstkompetenz. Die Selbstkompetenz verlangt ausdrücklich, das eigene Denken und Handeln **eigenverantwortlich zu reflektieren** – das stützt den Abschnitt «Reflexion».

Handlungskompetenzbereiche:

| Code | Bereich |
|---|---|
| a | Umsetzen von produktionsbezogenen Massnahmen |
| b | Betreuen und Beraten von Kundinnen und Kunden |
| c | Planen und Vorbereiten der Arbeiten |
| d | Aufbereiten von Daten |
| e | Ausführen von Druckaufträgen |
| f | Ausführen von Weiterverarbeitungsaufträgen und nachgelagerten Arbeiten |
| g | Warten und Instandhalten von Druckmaschinen |

### 2.5 Datenschutz – Q8
Die App verarbeitet Personendaten (Name der lernenden Person, evtl. Fotos von Mitarbeitenden) und **Geschäftsgeheimnisse** des Lehrbetriebs (Kundenaufträge, Maschinendaten, Kundenlogos). Lokale Speicherung ohne Übermittlung ist datenschutzfreundlich; das Risiko liegt beim **Export und Weitergeben**.

## 3. Abgeleitete Anforderungen

| ID | Anforderung | Grundlage | Prio |
|---|---|---|---|
| R-01 | Ein Journaleintrag entspricht einer «Lerndokumentation» im Sinne der BiVo; App-Begriffe und Hilfetexte nennen den offiziellen Begriff mindestens einmal. | 2.1 | P0 |
| R-02 | Die Inhalte bleiben **Eigentum und Werk der lernenden Person**; die App bewertet nicht und erzeugt keine Noten. | 2.1, AGENTS | P0 |
| R-03 | Einträge sind einem Lernort zuordenbar (Betrieb, üK, Berufsfachschule); Standard «Betrieb». | 2.1, 2.4 | P0 |
| R-04 | Profil enthält Fachrichtung (Print, Printmediatechnik, Siebdruck), **Standard Print**; Hilfetexte zum QV richten sich danach. Fokus und Tests auf Print. | 2.3, 2.4 | P0 |
| R-05 | Die 7 Handlungskompetenzbereiche a–g werden bei Projektanlage als **Vorschlag-Kategorien** angeboten (abwählbar, umbenennbar). | 2.4 | P0 |
| R-06 | **Semesterbesprechung:** Journale eines Zeitraums als Übersicht/DOCX mit Feldern für Datum, Name und Unterschrift der Berufsbildnerin/des Berufsbildners ausgeben. In der App lässt sich «besprochen am …» festhalten (Selbstauskunft, keine digitale Signatur). | 2.1 | P1 |
| R-07 | Nach einer Besprechung ist der besprochene Stand nachvollziehbar (Snapshot/Version); spätere Änderungen sind als solche erkennbar. | 2.1 | P1 |
| R-08 | **QV-Mappe:** Auswahl von Journalen (Hinweis, wenn weniger als 12 – Standard für Print/Printmediatechnik, konfigurierbar), **PDF als Hauptformat** für den Upload in PkOrg, zusätzlich DOCX zum Weiterbearbeiten und Ausdruck. Dateigrösse nach Export anzeigen; Bilder für PDF moderat komprimieren. | 2.3 | P1 |
| R-09 | Handlungskompetenzen/Leistungsziele (inkl. Wortlaut, Mitlieferung zulässig) aus einem **versionierten, offline mitgelieferten Katalog** einem Journal zuordnen – **freiwillig**, nie Pflicht beim Schreiben; Abdeckungsübersicht als Orientierung, **nicht** als amtliche Zuordnung oder Bewertung. | 2.4 | P1 |
| R-10 | Vor jedem Export: Hinweis auf Geschäftsgeheimnisse, Kundendaten und Personen auf Bildern; einmalig pro Export bestätigbar. | 2.5 | P0 |
| R-11 | Keine Übermittlung von Daten an Dritte; keine Telemetrie. Datenschutzhinweis in der App. | 2.5 | P0 |
| R-12 | Der Bildungsbericht wird **nicht** in der App geführt (Aufgabe des Betriebs). | 2.2 | Nicht-Ziel |
| R-13 | Bedienung nach WCAG 2.2 AA sinngemäss (Kontrast, Fokus, Tastatur, Skalierung). | Q9 | P0 |
| R-14 | Lernjournal ist ein **inoffizielles Hilfsmittel** (nicht von SBFI, dpsuisse oder Prüfungsorganen herausgegeben). Hinweis in «Über» und Onboarding; keine Logos der Verbände; Quellen mit Stand verlinken. | Produktentscheid | P0 |

## 4. Geklärte Fragen (2026-11-23, Rückmeldung Projektleitung)
1. **Mindestzahl 12** gilt weiterhin für Print und Printmediatechnik. **Fokus der App ist Print.**
2. **Wortlaut der Leistungsziele** darf mitgeliefert werden, muss aber nicht. Die App ist **keine offizielle Anwendung**; Ziel ist, Lernenden das Führen des Journals zu vereinfachen (→ R-14, R-09 freiwillig).
3. **PkOrg-Upload: PDF**, keine Maximalgrösse bekannt (→ R-08).

## 5. Offene Fragen
1. Ist eine Revision der BiVo/des Bildungsplans Medientechnologe angekündigt? (Katalog muss dann mehrere Versionen parallel führen.)
2. Bevorzugen Lehrbetriebe eine Unterschrift auf Papier, auf PDF oder genügt ein Gesprächsvermerk?
3. Wie sieht die ZIP-Vorlage von COPYPRINTSUISSE (10 Register) aus – lohnt sich eine Exportvorlage, die diese Gliederung nachbildet?
4. Siebdruck (VPA): Werden Lerndokumentationen eingereicht? (niedrige Priorität, Fokus Print)

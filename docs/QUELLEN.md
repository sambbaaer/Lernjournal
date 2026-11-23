# Lernjournal – Offizielle Grundlagen und abgeleitete Anforderungen

Stand: 2026-11-23. Dieses Dokument trennt strikt zwischen **offiziellen Vorgaben** (Bund, OdA, Prüfungsorganisation) und **eigenen Produktentscheiden**. Anforderungen mit Kennung `R-xx` werden in SPEC und BACKLOG referenziert.

**Verifikationsstatus:**
- ✔ = Wortlaut bzw. Inhalt aus der Quelle bestätigt
- ◐ = sinngemäss aus Sekundärquelle/Suchauszug, Original-PDF noch gegenlesen
- ? = offen, vor Umsetzung des betroffenen Tickets klären

## 1. Quellenverzeichnis

| Nr. | Dokument | Herausgeber | Stand | Fundort | Status |
|---|---|---|---|---|---|
| Q1 | Verordnung des SBFI über die berufliche Grundbildung Medientechnologin/Medientechnologe EFZ (BiVo), SR 412.101.221.03 | SBFI | vom 12.10.2018, in Kraft 1.1.2019, **Stand 1.1.2026** (seit 2024 nur Verweisanpassungen) | [fedlex – ELI cc/2018/651](https://www.fedlex.admin.ch/eli/cc/2018/651/de) | ✔ Original gelesen |
| Q2 | Bildungsplan Medientechnologin/Medientechnologe EFZ (Berufsnummer 34200) | OdA, genehmigt SBFI | 12.10.2018 | [dpsuisse.ch – Bildungsplan PDF](https://dpsuisse.ch/hubfs/medientechnologe_bipla_d_215521.pdf?hsLang=de) | ✔ (Struktur via BiPla-Datenbank) |
| Q3 | Ausführungsbestimmungen zum QV mit Abschlussprüfung Medientechnologin/Medientechnologe EFZ (erlassen PBS 28.2.2019, Änderungen vom 10.2.2021) | PBS / dpsuisse | 2021 | [dpsuisse.ch – Ausführungsbestimmungen 2021](https://dpsuisse.ch/hubfs/QV%20Unterlagen/Deutsch/Medientechnologe%20EFZ%20Siebdruck/08_Medientechnologe_Ausfuehrungsbestimmungen_20210323.pdf?hsLang=de) | ✔ Original gelesen |
| Q3a | IPA-Unterlagenpaket Medientechnologe EFZ (u. a. «Leitfaden Lerndokumentationen», «Leitfaden Fachgespräch», beide 5.11.2025; Info-Präsentation IPA Print, Januar 2025) | dpsuisse | 2025 | [dpsuisse.ch – QV_Medientechnologen_IPA_Unterlagen.zip](https://dpsuisse.ch/hubfs/Grundbildung/QV-Unterlagen/QV_Medientechnologen_IPA_Unterlagen.zip?hsLang=de), Übersicht: [dpsuisse.ch – QV Unterlagen](https://dpsuisse.ch/de/qv-unterlagen) | ✔ Original gelesen |
| Q4 | Informationen zur Grundbildung Medientechnologe EFZ | COPYPRINTSUISSE | – | [copyprintsuisse.ch – Grundbildung](https://www.copyprintsuisse.ch/pages/grundbildung.html) | ◐ (durch Q3/Q3a überholt) |
| Q5 | QV Fachrichtung Siebdruck | Verband Werbetechnik+Print | – | [vwp.swiss – QV Siebdruck](https://www.vwp.swiss/bildung/ausbildungen/medientechnologe-in-fachrichtung-siebdruck-efz/qualifikationsverfahren-qv-medientechnologin-medientechnologe-siebdruck-efz/) | ◐ widerspricht Q1 (siehe 2.3) |
| Q6 | Lerndokumentation und Bildungsbericht (berufsneutral), Formulare | SDBB / berufsbildung.ch | – | [berufsbildung.ch – Dokumentieren und bewerten](https://www.berufsbildung.ch/de/lehrverlauf/dokumentieren-und-bewerten) | ◐ |
| Q7 | Lerndokumentationen – Überblick | EHB | – | [edudoc.ch – EHB Lerndokumentationen](https://edudoc.ch/record/99550/files/EHB_Lerndokumentationen_Ueberblick.pdf) | ? (nicht benötigt) |
| Q8 | Bundesgesetz über den Datenschutz (DSG), SR 235.1 | Bund | in Kraft 1.9.2023 | fedlex.admin.ch | ✔ |
| Q9 | Web Content Accessibility Guidelines (WCAG) 2.2 | W3C | 2023 | w3.org | ✔ |

Q1, Q3 und Q3a wurden am 2026-11-23 im Original gelesen (Ticket AJ-00c). Zitate unten sind wörtlich.

## 2. Was die Vorgaben sagen

### 2.1 Lerndokumentation (BiVo Art. 12) – Q1 ✔
> 1 Die lernende Person führt während der Bildung in beruflicher Praxis eine Lerndokumentation, in der sie laufend alle wesentlichen Arbeiten im Zusammenhang mit den zu erwerbenden Handlungskompetenzen festhält.
> 2 Mindestens einmal pro Semester kontrolliert und unterzeichnet die Berufsbildnerin oder der Berufsbildner die Lerndokumentation und bespricht sie mit der lernenden Person.

Leitfaden Lerndokumentationen (Q3a, «bietet keine rechtliche Grundlage»):
- Die Lerndokumentation besteht aus **Lernberichten**; sie dient «als Nachschlagewerk für die gesamte Lehrzeit». → stützt das Fachbuch-Konzept.
- Der lernenden Person muss «während der Arbeitszeit genügend Zeit eingeräumt werden».
- Berufsbildende achten auf «die sachliche Richtigkeit, die Vollständigkeit, die Sauberkeit, die Darstellung wie auch die Übersichtlichkeit». → saubere Exporte sind ein Kernnutzen.

Ausführungsbestimmungen (Q3): «In der Lerndokumentation dokumentieren und reflektieren die Lernenden ihre Arbeiten» – Reflexion ist ausdrücklich genannt.

### 2.2 Bildungsbericht (BiVo Art. 13) – Q1 ✔
Die Berufsbildnerin oder der Berufsbildner hält am Ende jedes Semesters den Bildungsstand in einem Bildungsbericht fest und bespricht ihn. **Aufgabe des Lehrbetriebs** – gehört nicht in die App.

### 2.3 Qualifikationsverfahren (BiVo Art. 18/19, Q3, Q3a) ✔
- Praktische Arbeit als **IPA, 20–32 Stunden**, gegen Ende der Lehre, für **alle Fachrichtungen** (BiVo unterscheidet nicht). Gewichtung innerhalb der IPA: Ausführung und Resultat 60 %, Dokumentation 10 %, Präsentation 10 %, Fachgespräch 20 %. Die IPA zählt 40 % der Gesamtnote und muss mindestens 4 sein.
- **Hilfsmittel** (BiVo Art. 18 Abs. 1 lit. a Ziff. 3): «die Lerndokumentation und die Unterlagen der überbetrieblichen Kurse dürfen als Hilfsmittel verwendet werden». → Lernende brauchen während der IPA schnellen Zugriff (Suche, Ausdruck/PDF).
- **Zeitpunkt der Einreichung** (Q3, Phase 1 «Planen und Vorbereiten»): Die vorgesetzte Fachkraft reicht das Auftragsformular ein; «Gleichzeitig werden die Lerndokumentationen eingereicht.» → Die Auswahl muss **vor** der IPA fertig sein, nicht erst am Schluss.
- **Anzahl** (Q3): «Es werden mindestens 12 Lerndokumentationen eingereicht.» Leitfaden (Q3a): «12 einzelne Lernberichte», die «sinnvollerweise einen Bezug zu den Arbeiten» der IPA haben.
- **Fachgespräch** (Q3a): 30–60 Minuten; Fragen beziehen sich «ausschliesslich» auf die Ausführung, die IPA-Dokumentation «wie zu den eingereichten 12 Lerndokumentationen». Damit ist der frühere Widerspruch aufgelöst.
- **Keine Bewertung** (Q3): Die Lerndokumentation «dient den Experten zur Vorbereitung des Fachgesprächs sie darf nicht bewertet werden oder in die Bewertung einfliessen.»
- **Begriffsabgrenzung:** Während der IPA führt die kandidierende Person ein **«Arbeitsjournal»** (tägliches Vorgehen, Teil der IPA-Dokumentation). Das ist **nicht** dasselbe wie die Lerndokumentation und nicht Gegenstand dieser App.
- **Upload:** Einreichung als **PDF** über PkOrg (fachlich bestätigt durch Projektleitung), keine Maximalgrösse bekannt.
- **Siebdruck:** VWP (Q5) nennt eine vorgegebene praktische Arbeit; BiVo und Ausführungsbestimmungen sehen für alle Fachrichtungen die IPA und 12 Lerndokumentationen vor. Die App folgt den Originaldokumenten (Q1/Q3).

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
| R-01 | Ein Journaleintrag entspricht einem **Lernbericht** der Lerndokumentation (BiVo Art. 12, Leitfaden); Hilfetexte nennen die offiziellen Begriffe. Nicht mit dem IPA-«Arbeitsjournal» verwechseln. | 2.1, 2.3 | P0 |
| R-02 | Die Inhalte bleiben **Eigentum und Werk der lernenden Person**; die App bewertet nicht und erzeugt keine Noten (die Lerndokumentation «darf nicht bewertet werden»). | 2.1, 2.3 | P0 |
| R-03 | Einträge sind einem Lernort zuordenbar (Betrieb, üK, Berufsfachschule); Standard «Betrieb». | 2.1, 2.4 | P0 |
| R-04 | Profil enthält Fachrichtung (Print, Printmediatechnik, Siebdruck), **Standard Print**; Hilfetexte zum QV richten sich danach. Fokus und Tests auf Print. | 2.3, 2.4 | P0 |
| R-05 | Die 7 Handlungskompetenzbereiche a–g werden bei Projektanlage als **Vorschlag-Kategorien** angeboten (abwählbar, umbenennbar). | 2.4 | P0 |
| R-06 | **Semesterbesprechung:** Journale eines Zeitraums als Übersicht/DOCX mit Feldern für Datum, Name und Unterschrift der Berufsbildnerin/des Berufsbildners ausgeben. In der App lässt sich «besprochen am …» festhalten (Selbstauskunft, keine digitale Signatur). | 2.1 | ~~P1~~ → P2 (voraussichtlich nicht genutzt) |
| R-07 | Nach einer Besprechung ist der besprochene Stand nachvollziehbar (Snapshot/Version); spätere Änderungen sind als solche erkennbar. | 2.1 | ~~P1~~ → P2 |
| R-08 | **QV-Mappe:** Auswahl von Journalen (Hinweis, wenn weniger als 12 – Standard für alle Fachrichtungen, konfigurierbar), **PDF als Hauptformat** für den Upload in PkOrg, zusätzlich DOCX zum Weiterbearbeiten und Ausdruck. Dateigrösse nach Export anzeigen; Bilder für PDF moderat komprimieren. | 2.3 | P1 |
| R-09 | Handlungskompetenzen/Leistungsziele (inkl. Wortlaut, Mitlieferung zulässig) aus einem **versionierten, offline mitgelieferten Katalog** einem Journal zuordnen – **freiwillig**, nie Pflicht beim Schreiben; Abdeckungsübersicht als Orientierung, **nicht** als amtliche Zuordnung oder Bewertung. | 2.4 | P1 |
| R-10 | Vor jedem Export: Hinweis auf Geschäftsgeheimnisse, Kundendaten und Personen auf Bildern; einmalig pro Export bestätigbar. | 2.5 | P0 |
| R-11 | Keine Übermittlung von Daten an Dritte; keine Telemetrie. Datenschutzhinweis in der App. | 2.5 | P0 |
| R-12 | Der Bildungsbericht wird **nicht** in der App geführt (Aufgabe des Betriebs). | 2.2 | Nicht-Ziel |
| R-13 | Bedienung nach WCAG 2.2 AA sinngemäss (Kontrast, Fokus, Tastatur, Skalierung). | Q9 | P0 |
| R-15 | **IPA-Bezug:** Beim Zusammenstellen der QV-Mappe Journale nach Stichwort, Kategorie, Tag und (P1) Kompetenz filtern, damit Lernberichte mit Bezug zur geplanten IPA schnell gefunden werden. Hinweis, dass die Mappe **mit der Aufgabenstellung** (vor der IPA) eingereicht wird. | 2.3 | P1 |
| R-16 | **Hilfsmittel während der IPA:** Volltextsuche und Einzel-/Sammelexport funktionieren offline und schnell; Lernende können ihr Journal während der IPA nachschlagen. | 2.3 | P0 (durch Suche/Export abgedeckt) |
| R-14 | Lernjournal ist ein **inoffizielles Hilfsmittel** (nicht von SBFI, dpsuisse oder Prüfungsorganen herausgegeben). Hinweis in «Über» und Onboarding; keine Logos der Verbände; Quellen mit Stand verlinken. | Produktentscheid | P0 |

## 4. Geklärte Fragen (2026-11-23, Rückmeldung Projektleitung)
1. **Mindestzahl 12** gilt weiterhin (laut Q3 für alle Fachrichtungen). **Fokus der App ist Print.**
2. **Wortlaut der Leistungsziele** darf mitgeliefert werden, muss aber nicht. Die App ist **keine offizielle Anwendung**; Ziel ist, Lernenden das Führen des Journals zu vereinfachen (→ R-14, R-09 freiwillig).
3. **PkOrg-Upload: PDF**, keine Maximalgrösse bekannt (→ R-08).

4. **Revision BiVo/Bildungsplan:** angekündigt, aber frühestens in rund 6 Jahren. → Vorerst nur mit dem Bildungsplan 2018 planen; das Katalogformat bleibt versioniert, ein Parallelbetrieb mehrerer Versionen wird **nicht** vorab gebaut.
5. **Semesterbesprechung/Unterschrift in der App:** wird voraussichtlich nicht genutzt. → R-06/R-07 nach P2 verschoben; Besprechungen laufen weiterhin mit einem normalen DOCX/PDF-Export.
6. **Exportvorlage nach 10er-Register (COPYPRINTSUISSE):** nicht gewünscht.

7. **Original-Quellen gegengelesen (AJ-00c):** BiVo Stand 1.1.2026, Ausführungsbestimmungen 2021 und Leitfäden 2025 bestätigen die Eckwerte. Neu daraus: Einreichung **vor** der IPA, Bezug der Lernberichte zur IPA, Hilfsmittel-Recht, keine Bewertung (→ R-15, R-16).

## 5. Offene Fragen
- Keine blockierenden. Bei Unsicherheit zu Siebdruck bei der Prüfungsorganisation nachfragen (niedrige Priorität).

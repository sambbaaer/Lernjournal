import {
  DEFAULT_JOURNAL_TEMPLATE,
  EMPTY_DOCUMENT,
  LEGACY_SECTION_KEYS,
  type JournalTemplateId,
  type JournalSection,
  type LegacySectionKey,
  type LegacySections,
  type Sections,
} from './journal';

type TemplateSection = { key: LegacySectionKey; heading: string | null; hint: string };
type JournalTemplate = { label: string; description: string; sections: readonly TemplateSection[] };

// Vorlagen liefern den Startinhalt. Danach gehören Überschriften und
// Reihenfolge dem jeweiligen Journal.
export const JOURNAL_TEMPLATES: Record<JournalTemplateId, JournalTemplate> = {
  report: {
    label: 'Lernbericht',
    description: 'Auftrag, Durchführung und Reflexion festhalten.',
    sections: [
      {
        key: 'auftrag',
        heading: 'Auftrag / Ausgangslage',
        hint: 'Was war die Aufgabe, was das Ziel? Für wen (ohne vertrauliche Details)?',
      },
      {
        key: 'durchfuehrung',
        heading: 'Durchführung',
        hint: 'Wie und weshalb hast du gearbeitet? Schritte, Material, Maschinen, Einstellungen, Sicherheit.',
      },
      {
        key: 'reflexion',
        heading: 'Reflexion',
        hint: 'Was lief gut, was war schwierig, was machst du nächstes Mal anders?',
      },
    ],
  },
  blank: {
    label: 'Freier Eintrag',
    description: 'Platz für eigene Notizen, Bilder und Tabellen.',
    sections: [{ key: 'durchfuehrung', heading: null, hint: 'Hier schreiben …' }],
  },
  machine: {
    label: 'Maschinenwerte',
    description: 'Formate, Geschwindigkeit und weitere Kennwerte in einer Tabelle erfassen.',
    sections: [
      { key: 'auftrag', heading: 'Maschine und Einsatz', hint: 'Hersteller, Modell und Einsatzgebiet.' },
      { key: 'durchfuehrung', heading: 'Kennwerte', hint: '' },
      {
        key: 'reflexion',
        heading: 'Hinweise zur Praxis',
        hint: 'Was ist bei Einstellungen, Material oder Sicherheit zu beachten? Woher stammen die Werte?',
      },
    ],
  },
  workflow: {
    label: 'Arbeitsablauf',
    description: 'Vorbereitung, nummerierte Arbeitsschritte und Kontrolle dokumentieren.',
    sections: [
      { key: 'auftrag', heading: 'Vorbereitung', hint: 'Was brauchst du für die Arbeit?' },
      { key: 'durchfuehrung', heading: 'Arbeitsschritte', hint: '' },
      {
        key: 'reflexion',
        heading: 'Kontrolle und Ergebnis',
        hint: 'Woran erkennst du, dass das Ergebnis stimmt?',
      },
    ],
  },
};

export function sectionHint(template: JournalTemplateId, id: JournalSection['id'], heading: string | null) {
  const original = JOURNAL_TEMPLATES[template].sections.find((s) => s.key === id && s.heading === heading);
  if (original) return original.hint;
  // Angefügte Vorlagen erhalten neue IDs. Standardüberschriften behalten ihre Schreibhilfe.
  if (heading === null) return 'Hier schreiben …';
  return (
    Object.values(JOURNAL_TEMPLATES)
      .flatMap((t) => t.sections)
      .find((s) => s.heading === heading)?.hint ?? 'Hier schreiben …'
  );
}

function paragraph(text = '') {
  return text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' };
}

function tableRow(cellType: 'tableHeader' | 'tableCell', labels: string[]) {
  return {
    type: 'tableRow',
    content: labels.map((label) => ({ type: cellType, content: [paragraph(label)] })),
  };
}

export const EMPTY_LEGACY_SECTIONS: LegacySections = {
  auftrag: EMPTY_DOCUMENT,
  durchfuehrung: EMPTY_DOCUMENT,
  reflexion: EMPTY_DOCUMENT,
};

export function sectionsFromLegacy(template: JournalTemplateId, legacy: LegacySections): Sections {
  const initial = JOURNAL_TEMPLATES[template].sections;
  const sections: Sections = initial.map(({ key, heading }) => ({ id: key, heading, doc: legacy[key] }));
  const empty = JSON.stringify(EMPTY_DOCUMENT);
  // Auch Inhalt aus historisch ausgeblendeten Speicherplätzen behalten.
  for (const key of LEGACY_SECTION_KEYS) {
    if (!initial.some((section) => section.key === key) && JSON.stringify(legacy[key]) !== empty) {
      const heading = JOURNAL_TEMPLATES.report.sections.find((section) => section.key === key)!.heading;
      sections.push({ id: key, heading, doc: legacy[key] });
    }
  }
  return sections;
}

export function newJournalSections(template: JournalTemplateId = DEFAULT_JOURNAL_TEMPLATE): Sections {
  const sections = structuredClone(EMPTY_LEGACY_SECTIONS);
  if (template === 'machine') {
    sections.durchfuehrung = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            tableRow('tableHeader', ['Kennwert', 'Wert', 'Einheit / Hinweis']),
            tableRow('tableCell', ['Maximales Format', '', '']),
            tableRow('tableCell', ['Maximale Geschwindigkeit', '', '']),
            tableRow('tableCell', ['Material / Grammatur', '', '']),
          ],
        },
        paragraph(),
      ],
    };
  } else if (template === 'workflow') {
    sections.durchfuehrung = {
      type: 'doc',
      content: [{ type: 'orderedList', content: [{ type: 'listItem', content: [paragraph()] }] }],
    };
  }
  return sectionsFromLegacy(template, sections);
}

// Editor-Schema = Whitelist der erlaubten Inhalte (SPEC «Erlaubte Editor-Knoten»).
//
// Wird an ZWEI Stellen verwendet:
//   Renderer:      Tiptap-Editor (was man eingeben/einfügen kann)
//   Hauptprozess:  Prüfung vor dem Speichern (was in die Datenbank darf)
// So kann auch ein manipulierter Renderer keine fremden Knoten, Skript-Links
// oder kaputten Strukturen speichern. Übernommen aus Spike AJ-00b (ADR 0002).
import { getSchema, mergeAttributes, Node } from '@tiptap/core';
import { TableKit } from '@tiptap/extension-table';
import { Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { SECTION_KEYS, type Sections } from './journal';

// Bild + Legende als EINE Einheit; Bilddatei liegt im Projektordner (AJ-07)
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { mediaId: { default: null }, caption: { default: '' }, alt: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'figure[data-media-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-media-id': HTMLAttributes['mediaId'] })];
  },
});

// Erlaubte Link-Ziele: Web (https/http) und interne Journal-Links. Alles andere
// (javascript:, file:, data: …) wird weder eingefügt noch gespeichert.
export const ALLOWED_LINK = /^(https?:\/\/|lernjournal:\/\/journal\/)/i;

export function baseExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] }, // H1 ist dem Journaltitel vorbehalten
      codeBlock: false,
      code: false,
      blockquote: false,
      horizontalRule: false,
      link: {
        openOnClick: false, // nie automatisch öffnen (SPEC)
        autolink: true,
        linkOnPaste: true,
        protocols: ['https', 'http'],
        isAllowedUri: (url) => ALLOWED_LINK.test(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null, title: 'Strg+Klick zum Öffnen' },
      },
    }),
    TableKit.configure({ table: { resizable: false } }),
    Figure,
  ];
}

export const editorSchema = getSchema(baseExtensions());

export class InvalidContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidContentError';
  }
}

// Höchstgrösse eines Journals als JSON (ohne Bilder, die liegen separat)
export const MAX_SECTIONS_BYTES = 2_000_000;

// Prüft alle drei Abschnitte. Wirft InvalidContentError mit verständlicher Meldung.
export function validateSections(sections: Sections): void {
  const size = JSON.stringify(sections).length;
  if (size > MAX_SECTIONS_BYTES) throw new InvalidContentError('Journal ist zu gross.');
  for (const key of SECTION_KEYS) {
    let node: PMNode;
    try {
      node = PMNode.fromJSON(editorSchema, sections[key]);
      node.check(); // Struktur gemäss Schema (z. B. Tabellenzeilen nur in Tabellen)
    } catch (err) {
      throw new InvalidContentError(`Ungültiger Inhalt in «${key}»: ${(err as Error).message}`);
    }
    node.descendants((n) => {
      // Überschriftenebene: Tiptap prüft Attribute beim Laden nicht – H1 ist dem Titel vorbehalten
      if (n.type.name === 'heading' && ![2, 3].includes(Number(n.attrs['level']))) {
        throw new InvalidContentError('Nur Überschriften der Ebenen 2 und 3 sind erlaubt.');
      }
      // Links prüfen (das Schema selbst kennt keine erlaubten Protokolle)
      for (const mark of n.marks) {
        if (mark.type.name === 'link' && !ALLOWED_LINK.test(String(mark.attrs['href'] ?? ''))) {
          throw new InvalidContentError('Unzulässiges Link-Ziel.');
        }
      }
    });
  }
}

import { describe, expect, it } from 'vitest';
import { EMPTY_SECTIONS, type Sections } from './journal';
import { InvalidContentError, validateSections } from './editor-schema';

const withAuftrag = (content: unknown[]): Sections => ({
  ...EMPTY_SECTIONS,
  auftrag: { type: 'doc', content },
});
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const t = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });

describe('Editor-Schema (Whitelist)', () => {
  it('akzeptiert leere Abschnitte und erlaubte Formatierungen', () => {
    validateSections(EMPTY_SECTIONS);
    validateSections(
      withAuftrag([
        { type: 'heading', attrs: { level: 2 }, content: [t('Vorgehen')] },
        p(
          t('fett', [{ type: 'bold' }]),
          t(' kursiv', [{ type: 'italic' }]),
          t(' unterstrichen', [{ type: 'underline' }]),
        ),
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [{ type: 'listItem', content: [p(t('Schritt'))] }],
        },
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Punkt'))] }] },
        p(t('Fogra', [{ type: 'link', attrs: { href: 'https://fogra.org' } }])),
        p(
          t('Anderes Journal', [
            { type: 'link', attrs: { href: 'lernjournal://journal/3f2a9c1e-6b7d-4e21-9a4f-0c5d8e7b1a23' } },
          ]),
        ),
        {
          type: 'table',
          content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('Farbe'))] }] }],
        },
        { type: 'figure', attrs: { mediaId: 'm1', caption: 'Bogen', alt: '' } },
      ]),
    );
  });

  it.each([
    ['Code-Block', [{ type: 'codeBlock', content: [t('x')] }]],
    ['Zitat', [{ type: 'blockquote', content: [p(t('x'))] }]],
    ['Überschrift H1', [{ type: 'heading', attrs: { level: 1 }, content: [t('x')] }]],
    ['Tabellenzeile ohne Tabelle', [{ type: 'tableRow', content: [] }]],
    ['unbekannter Knoten', [{ type: 'script', content: [] }]],
  ])('lehnt nicht erlaubte Inhalte ab: %s', (_name, content) => {
    expect(() => validateSections(withAuftrag(content))).toThrow(InvalidContentError);
  });

  it.each([
    'javascript:alert(1)',
    'file:///C:/Windows/system.ini',
    'data:text/html,<script>',
    ' JAVASCRIPT:x',
  ])('lehnt gefährliche Link-Ziele ab: %s', (href) => {
    expect(() => validateSections(withAuftrag([p(t('Klick', [{ type: 'link', attrs: { href } }]))]))).toThrow(
      InvalidContentError,
    );
  });

  it('begrenzt die Grösse', () => {
    const big = withAuftrag([p(t('x'.repeat(2_100_000)))]);
    expect(() => validateSections(big)).toThrow(/zu gross/);
  });
});

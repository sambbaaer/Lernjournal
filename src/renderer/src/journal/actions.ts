// Journal-Aktionen der Oberfläche: rufen den Hauptprozess auf und aktualisieren
// den Zustand. Von Menüband, Tastatur, Listen und Dokumentansicht gemeinsam genutzt.
import type { JournalSummary } from '@shared/journal';
import type { IpcResult } from '@shared/ipc';
import type { JournalLinks } from '@shared/links';
import type { Taxonomy, TaxonomyKind } from '@shared/taxonomy';
import { saveIfNeeded } from '../editor/save-registry';
import type { Action } from '../state/app-state';

type Dispatch = (a: Action) => void;
const fail = (d: Dispatch, text: string) => d({ type: 'notice', text });

export async function loadJournals(d: Dispatch): Promise<void> {
  const res = await window.lernjournal.journal.list({ includeArchived: true });
  if (res.ok) d({ type: 'journalsLoaded', journals: res.data });
  else fail(d, 'Journale konnten nicht geladen werden.');
}

// Neues Journal (Strg+N): Zuerst sofort den Platzhalter zeigen (blendet das
// bisherige Journal aus und nimmt Tastatureingaben an), dann im Hauptprozess
// anlegen. So kann, wer gleich lostippt, nie das vorherige Journal ändern –
// auch wenn das Anlegen auf einem langsamen Datenträger etwas dauert.
export async function createJournal(d: Dispatch): Promise<void> {
  d({ type: 'journalCreating' });
  const res = await window.lernjournal.journal.create().catch(() => null);
  if (!res?.ok) {
    d({ type: 'journalCreateFailed' });
    return fail(d, 'Journal konnte nicht angelegt werden.');
  }
  d({ type: 'journalCreated', journal: res.data });
}

export async function openJournal(d: Dispatch, id: string): Promise<void> {
  const res = await window.lernjournal.journal.get({ id });
  if (!res.ok) return fail(d, 'Journal konnte nicht geöffnet werden.');
  d({ type: 'journalOpened', journal: res.data });
}

export async function setJournalStatus(
  d: Dispatch,
  id: string,
  status: JournalSummary['status'],
): Promise<void> {
  const res = await window.lernjournal.journal.setStatus({ id, status });
  if (!res.ok) return fail(d, 'Status konnte nicht geändert werden.');
  d({ type: 'journalUpserted', journal: res.data });
  const msg = {
    draft: 'Wieder als Entwurf markiert.',
    completed: 'Als abgeschlossen markiert.',
    archived: 'Archiviert.',
  };
  d({ type: 'notice', text: msg[status] });
}

export async function duplicateJournal(d: Dispatch, id: string): Promise<void> {
  const res = await window.lernjournal.journal.duplicate({ id });
  if (!res.ok) return fail(d, 'Journal konnte nicht dupliziert werden.');
  d({ type: 'journalUpserted', journal: res.data });
  d({ type: 'journalOpened', journal: res.data });
  d({ type: 'notice', text: 'Kopie angelegt.' });
  void loadTaxonomy(d); // Anzahl Journale je Kategorie/Schlagwort hat sich geändert
}

export async function deleteJournal(d: Dispatch, id: string): Promise<void> {
  const res = await window.lernjournal.journal.delete({ id });
  if (!res.ok) return fail(d, 'Journal konnte nicht gelöscht werden.');
  d({ type: 'journalRemoved', id });
  d({ type: 'notice', text: 'Journal gelöscht.' });
  void loadTaxonomy(d); // Schlagwörter nur dieses Journals sind mit entfernt
}

// --- Kategorien und Schlagwörter (AJ-09) -------------------------------------

export async function loadTaxonomy(d: Dispatch): Promise<void> {
  const res = await window.lernjournal.taxonomy.list();
  if (res.ok) d({ type: 'taxonomyLoaded', taxonomy: res.data });
  else fail(d, 'Kategorien und Schlagwörter konnten nicht geladen werden.');
}

// Zuordnung im geöffneten Journal: sofort speichern, mit Speicherstatus wie beim Schreiben
async function saveAssignment(
  d: Dispatch,
  call: () => Promise<IpcResult<{ journal: JournalSummary; taxonomy: Taxonomy }>>,
): Promise<boolean> {
  d({ type: 'setSaveStatus', status: { kind: 'saving' } });
  const res = await call().catch(() => null);
  if (!res?.ok) {
    d({ type: 'setSaveStatus', status: { kind: 'error', message: 'Zuordnung nicht gespeichert.' } });
    return false;
  }
  d({ type: 'journalUpserted', journal: res.data.journal });
  d({ type: 'taxonomyLoaded', taxonomy: res.data.taxonomy });
  d({ type: 'setSaveStatus', status: { kind: 'saved', at: Date.now() } });
  return true;
}

export function setJournalCategories(d: Dispatch, id: string, categoryIds: string[]) {
  return saveAssignment(d, () => window.lernjournal.journal.setCategories({ id, categoryIds }));
}

export function setJournalTags(d: Dispatch, id: string, names: string[]) {
  return saveAssignment(d, () => window.lernjournal.journal.setTags({ id, names }));
}

// --- Journal-Verknüpfungen (AJ-10) -------------------------------------------

export async function loadLinks(d: Dispatch, journalId: string): Promise<void> {
  const res = await window.lernjournal.journal.links({ id: journalId }).catch(() => null);
  if (res?.ok) d({ type: 'linksLoaded', journalId, links: res.data });
  else fail(d, 'Verknüpfungen konnten nicht geladen werden.');
}

// Verknüpfen/Lösen: sofort gespeichert, mit Speicherstatus wie beim Schreiben
async function saveLink(
  d: Dispatch,
  journalId: string,
  call: () => Promise<IpcResult<{ journal: JournalSummary; links: JournalLinks }>>,
): Promise<boolean> {
  d({ type: 'setSaveStatus', status: { kind: 'saving' } });
  const res = await call().catch(() => null);
  if (!res?.ok) {
    d({ type: 'setSaveStatus', status: { kind: 'error', message: 'Verknüpfung nicht gespeichert.' } });
    // Meldungen aus dem Dienst («… gibt es nicht mehr») sind für Lernende formuliert
    fail(d, taxonomyErrorText(res, 'Verknüpfung konnte nicht gespeichert werden.'));
    return false;
  }
  d({ type: 'journalUpserted', journal: res.data.journal });
  d({ type: 'linksLoaded', journalId, links: res.data.links });
  d({ type: 'setSaveStatus', status: { kind: 'saved', at: Date.now() } });
  return true;
}

export function linkJournals(d: Dispatch, id: string, otherId: string) {
  return saveLink(d, id, () => window.lernjournal.journal.link({ id, otherId }));
}

export function unlinkJournals(d: Dispatch, id: string, otherId: string) {
  return saveLink(d, id, () => window.lernjournal.journal.unlink({ id, otherId }));
}

// Verknüpftes Journal öffnen: zuerst Ausstehendes im aktuellen Journal
// speichern – sonst sähe das Ziel einen eben eingefügten Text-Link noch nicht
// als «Erwähnt in».
export async function openLinkedJournal(d: Dispatch, id: string): Promise<void> {
  await saveIfNeeded();
  await openJournal(d, id);
}

// Verwaltung (Einstellungen). Liefert null bei Erfolg, sonst die Fehlermeldung.
// Meldungen mit Code INVALID_REQUEST stammen aus dem Dienst und sind für
// Lernende formuliert («… gibt es schon»), alles andere bleibt allgemein.
export async function changeTaxonomy(
  d: Dispatch,
  call: () => Promise<IpcResult<Taxonomy>>,
  { reloadJournals = false } = {},
): Promise<string | null> {
  const res = await call().catch(() => null);
  if (!res?.ok) return taxonomyErrorText(res);
  d({ type: 'taxonomyLoaded', taxonomy: res.data });
  // Zusammenführen/Löschen ändert die Zuordnungen der Journale
  if (reloadJournals) await loadJournals(d);
  return null;
}

export function taxonomyErrorText(
  res: { ok: false; error: { code: string; message: string } } | null,
  fallback = 'Änderung konnte nicht gespeichert werden.',
): string {
  return res?.error.code === 'INVALID_REQUEST' && res.error.message !== 'Ungültige Daten'
    ? res.error.message
    : fallback;
}

export const TAXONOMY_LABELS: Record<TaxonomyKind, { one: string; many: string }> = {
  category: { one: 'Kategorie', many: 'Kategorien' },
  tag: { one: 'Schlagwort', many: 'Schlagwörter' },
};

export function displayTitle(title: string): string {
  return title.trim() || 'Ohne Titel';
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

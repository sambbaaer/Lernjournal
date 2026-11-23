// Journal-Aktionen der Oberfläche: rufen den Hauptprozess auf und aktualisieren
// den Zustand. Von Menüband, Tastatur, Listen und Dokumentansicht gemeinsam genutzt.
import type { JournalSummary } from '@shared/journal';
import type { Action } from '../state/app-state';

type Dispatch = (a: Action) => void;
const fail = (d: Dispatch, text: string) => d({ type: 'notice', text });

export async function loadJournals(d: Dispatch): Promise<void> {
  const res = await window.lernjournal.journal.list({ includeArchived: true });
  if (res.ok) d({ type: 'journalsLoaded', journals: res.data });
  else fail(d, 'Journale konnten nicht geladen werden.');
}

export async function createJournal(d: Dispatch): Promise<void> {
  const res = await window.lernjournal.journal.create();
  if (!res.ok) return fail(d, 'Journal konnte nicht angelegt werden.');
  d({ type: 'journalUpserted', journal: res.data });
  d({ type: 'journalOpened', journal: res.data });
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
}

export async function deleteJournal(d: Dispatch, id: string): Promise<void> {
  const res = await window.lernjournal.journal.delete({ id });
  if (!res.ok) return fail(d, 'Journal konnte nicht gelöscht werden.');
  d({ type: 'journalRemoved', id });
  d({ type: 'notice', text: 'Journal gelöscht.' });
}

export function displayTitle(title: string): string {
  return title.trim() || 'Ohne Titel';
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

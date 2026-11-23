// Verständliche Meldungen zu den Ergebnissen beim Öffnen/Anlegen.
import type { OpenResult } from '@shared/ipc';

export function openResultMessage(r: OpenResult): string | null {
  switch (r.status) {
    case 'opened':
      return null;
    case 'locked-here':
      return 'Dieses Projekt ist bereits geöffnet – in diesem oder einem anderen Lernjournal-Fenster.';
    case 'locked-elsewhere':
      return r.holder
        ? `Dieses Projekt ist auf dem Computer «${r.holder.hostname}» geöffnet (seit ${formatDateTime(r.holder.startedAt)}).`
        : 'Dieses Projekt ist vermutlich auf einem anderen Computer geöffnet.';
    case 'newer-version':
      return r.message;
    case 'not-a-project':
      return 'In diesem Ordner wurde kein Lernjournal-Projekt gefunden.';
    case 'not-allowed':
      return 'Dieser Ordner kann nicht verwendet werden. Bitte einen leeren oder neuen Ordner wählen.';
    case 'corrupt':
      return 'Die Projektdatei ist beschädigt und kann nicht geöffnet werden. Stelle eine Sicherung wieder her (Ordner «backups»).';
  }
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' });
}

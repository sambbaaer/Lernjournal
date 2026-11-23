// Macht `window.lernjournal` (aus dem Preload) in TypeScript bekannt.
import type { LernjournalApi } from '@shared/api';

declare global {
  interface Window {
    lernjournal: LernjournalApi;
  }
}

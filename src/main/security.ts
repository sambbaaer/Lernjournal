// Sicherheitseinstellungen für Fenster und Inhalte (SPEC «Autosave, Backup und Sicherheit»).
// Reine Funktionen ohne Electron-Import → mit Vitest prüfbar.
import path from 'node:path';

// Eigenes Protokoll für die Oberfläche im fertigen Programm: app://lernjournal/…
// Vorteil gegenüber file://: Die Oberfläche hat keinen Zugriff auf das ganze
// Dateisystem, und wir können einen strengen CSP-Header mitschicken.
export const APP_SCHEME = 'app';
export const APP_HOST = 'lernjournal';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

// Einstellungen, mit denen JEDES Fenster erstellt wird.
export function secureWebPreferences(preloadPath: string) {
  return {
    preload: preloadPath,
    contextIsolation: true, // Preload und Seite haben getrennte JavaScript-Welten
    nodeIntegration: false, // Seite hat kein require(), kein process
    sandbox: true, // Renderer läuft in der Chromium-Sandbox
    webSecurity: true, // Same-Origin-Policy bleibt aktiv
    allowRunningInsecureContent: false,
    webviewTag: false, // keine eingebetteten Fremdseiten
    spellcheck: true,
    // Navigation per Drag & Drop einer Datei ins Fenster unterbinden
    navigateOnDragDrop: false,
  } as const;
}

// Darf diese URL unsere Oberfläche sein? Nur die eigene App-Herkunft und –
// während der Entwicklung – der lokale Vite-Server.
export function isTrustedUrl(url: string, devServerUrl?: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST) return true;
  if (devServerUrl) {
    const dev = new URL(devServerUrl);
    return u.origin === dev.origin;
  }
  return false;
}

// Content-Security-Policy: Was darf die Seite laden?
// Produktion: nur eigene Dateien; keine Fremd-Skripte, kein eval, keine Netzwerkzugriffe.
// Entwicklung: Vite braucht ein Inline-Skript (React Fast Refresh) und eine
// WebSocket-Verbindung für das Neuladen.
export function contentSecurityPolicy(devServerUrl?: string): string {
  const prod = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // Tiptap/React setzen teils style-Attribute
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ];
  if (!devServerUrl) return prod.join('; ');
  const ws = devServerUrl.replace(/^http/, 'ws');
  return (
    prod
      // Bilder kommen auch im Dev-Modus über app://lernjournal/media/…
      .map((d) => (d.startsWith('img-src') ? `img-src 'self' data: blob: ${APP_ORIGIN}` : d))
      .map((d) => (d.startsWith('script-src') ? "script-src 'self' 'unsafe-inline'" : d))
      .map((d) => (d.startsWith('connect-src') ? `connect-src 'self' ${ws}` : d))
      .join('; ')
  );
}

// Übersetzt app://lernjournal/pfad in eine Datei im Renderer-Ordner.
// Gibt null zurück, wenn der Pfad aus dem Ordner ausbrechen würde (../ usw.).
export function resolveAppFile(rendererDir: string, requestUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(requestUrl);
  } catch {
    return null;
  }
  if (u.protocol !== `${APP_SCHEME}:` || u.host !== APP_HOST) return null;
  let rel: string;
  try {
    rel = decodeURIComponent(u.pathname);
  } catch {
    return null; // kaputte %-Kodierung
  }
  if (rel.includes('\0')) return null;
  if (rel === '/' || rel === '') rel = '/index.html';
  const root = path.resolve(rendererDir);
  const file = path.resolve(root, '.' + rel);
  // Datei muss INNERHALB des Renderer-Ordners liegen
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

// Inhaltstyp nach Dateiendung. Unbekanntes wird als Binärdaten ausgeliefert,
// dank «nosniff» interpretiert der Browser es dann nicht als Skript.
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
export function mimeTypeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

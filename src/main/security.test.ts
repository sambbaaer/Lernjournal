// Tests der Sicherheitsfunktionen (ohne Electron).
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contentSecurityPolicy,
  isTrustedUrl,
  mimeTypeFor,
  resolveAppFile,
  secureWebPreferences,
} from './security';

describe('secureWebPreferences', () => {
  it('setzt die Pflicht-Einstellungen aus der SPEC', () => {
    const p = secureWebPreferences('/x/preload.cjs');
    expect(p.contextIsolation).toBe(true);
    expect(p.nodeIntegration).toBe(false);
    expect(p.sandbox).toBe(true);
    expect(p.webSecurity).toBe(true);
    expect(p.webviewTag).toBe(false);
  });
});

describe('isTrustedUrl', () => {
  it('vertraut nur der eigenen App-Herkunft', () => {
    expect(isTrustedUrl('app://lernjournal/index.html')).toBe(true);
    expect(isTrustedUrl('app://andere/index.html')).toBe(false);
    expect(isTrustedUrl('https://lernjournal.example')).toBe(false);
    expect(isTrustedUrl('file:///C:/Windows/system32')).toBe(false);
    expect(isTrustedUrl('kein url')).toBe(false);
    expect(isTrustedUrl('')).toBe(false);
  });
  it('vertraut dem Dev-Server nur, wenn einer gesetzt ist', () => {
    expect(isTrustedUrl('http://localhost:5173/', undefined)).toBe(false);
    expect(isTrustedUrl('http://localhost:5173/x', 'http://localhost:5173')).toBe(true);
    expect(isTrustedUrl('http://localhost:5174/', 'http://localhost:5173')).toBe(false);
  });
});

describe('contentSecurityPolicy', () => {
  it('ist in Produktion streng: keine Inline-Skripte, kein Netzwerk', () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });
  it('erlaubt in der Entwicklung Vite-HMR', () => {
    const csp = contentSecurityPolicy('http://localhost:5173');
    expect(csp).toContain('ws://localhost:5173');
  });
});

describe('resolveAppFile', () => {
  const root = path.resolve('/app/renderer');
  it('liefert Dateien innerhalb des Renderer-Ordners', () => {
    expect(resolveAppFile(root, 'app://lernjournal/')).toBe(path.join(root, 'index.html'));
    expect(resolveAppFile(root, 'app://lernjournal/assets/a.js')).toBe(path.join(root, 'assets', 'a.js'));
  });
  it('verhindert Ausbruch aus dem Ordner (Pfad-Traversal)', () => {
    // Der URL-Parser normalisiert «..» bereits – das Ergebnis bleibt im Ordner
    expect(resolveAppFile(root, 'app://lernjournal/../../etc/passwd')).toBe(path.join(root, 'etc', 'passwd'));
    expect(resolveAppFile(root, 'app://lernjournal/%2e%2e/%2e%2e/secret.txt')).toBe(
      path.join(root, 'secret.txt'),
    );
    // Kodierte Schrägstriche überstehen den Parser – hier greift unsere eigene Prüfung
    expect(resolveAppFile(root, 'app://lernjournal/assets/%2e%2e%2f%2e%2e%2fsecret')).toBeNull();
    expect(resolveAppFile(root, 'app://lernjournal/a%00.js')).toBeNull();
    // Windows: kodierte Backslashes dürfen ebenfalls nicht ausbrechen
    const win = resolveAppFile(root, 'app://lernjournal/assets/%5c..%5c..%5c..%5csecret');
    expect(win === null || win.startsWith(root + path.sep)).toBe(true);
    expect(resolveAppFile(root, 'app://lernjournal/%E0%A4%A')).toBeNull();
  });
  it('lehnt fremde Herkunft ab', () => {
    expect(resolveAppFile(root, 'app://boese/index.html')).toBeNull();
    expect(resolveAppFile(root, 'file:///etc/passwd')).toBeNull();
  });
});

describe('mimeTypeFor', () => {
  it('kennt die üblichen Typen, sonst Binärdaten', () => {
    expect(mimeTypeFor('a/index.html')).toMatch(/^text\/html/);
    expect(mimeTypeFor('a/x.JS')).toMatch(/^text\/javascript/);
    expect(mimeTypeFor('a/x.exe')).toBe('application/octet-stream');
  });
});

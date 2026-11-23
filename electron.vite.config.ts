// Build-Konfiguration für die drei Teile einer Electron-App:
//   main     – Hauptprozess (Node.js): Fenster, Dateien, Datenbank
//   preload  – schmale Brücke zwischen Hauptprozess und Oberfläche
//   renderer – die Oberfläche (React), läuft wie eine Webseite in der Sandbox
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Gemeinsamer Code (Typen, IPC-Verträge) liegt in src/shared und wird
// über den Alias «@shared» in allen drei Teilen gleich importiert.
const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') };

export default defineConfig({
  main: {
    resolve: { alias },
  },
  preload: {
    resolve: { alias },
    build: {
      rollupOptions: {
        // Preload-Skripte in einer Sandbox müssen CommonJS sein (kein ESM).
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    // Oberfläche verkleinern (schnellerer Start); Haupt-/Preload-Code bleibt lesbar für Fehlersuche
    build: { minify: true },
  },
});

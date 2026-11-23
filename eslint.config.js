// ESLint (Flat Config). Prüft Code-Qualität; Formatierung macht Prettier.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  // Nicht prüfen: Build-Ausgaben, Abhängigkeiten, Wegwerf-Spikes
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'spikes/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/main/**', 'src/preload/**', '*.config.ts', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // E2E-Tests laufen in Node, die page.evaluate-Funktionen aber im Fenster
    files: ['e2e/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['src/renderer/**'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Sicherheitsregel: Die Oberfläche darf Node/Electron nie direkt importieren.
      // Alles läuft über window.lernjournal (Preload-Brücke).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'node:*', 'fs', 'path', 'child_process'],
              message: 'Renderer hat keinen Node-/Electron-Zugriff – window.lernjournal verwenden.',
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);

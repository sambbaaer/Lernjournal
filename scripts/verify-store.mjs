// Store-Paket prüfen (npm run verify:store): dieselbe Prüfung wie
// verify-package.mjs, aber mit der Partner-Center-Identität statt der
// Platzhalter des Testbuilds. Die Identität wird beim Laden von
// electron-builder.ts aus den Umgebungsvariablen gelesen – darum zuerst die
// Variablen setzen, dann die Prüfung dynamisch laden.
import { PARTNER_CENTER_DEFAULTS } from './store-defaults.mjs';

for (const [name, value] of Object.entries(PARTNER_CENTER_DEFAULTS)) process.env[name] ??= value;
await import('./verify-package.mjs');

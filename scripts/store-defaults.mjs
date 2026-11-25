// Partner-Center-Standardwerte für Lernjournal (docs/STORE.md). Gemeinsam für
// den Store-Build (dist-store.mjs) und dessen Prüfung (verify-store.mjs), damit
// beide garantiert dieselbe Identität erwarten. Umgebungsvariablen
// LERNJOURNAL_STORE_* haben immer Vorrang.
export const PARTNER_CENTER_DEFAULTS = {
  LERNJOURNAL_STORE_IDENTITY_NAME: 'SamuelBaer.Lernjournal',
  LERNJOURNAL_STORE_PUBLISHER: 'CN=729E5805-5EBC-4960-8F61-C476DD08925A',
  LERNJOURNAL_STORE_PUBLISHER_DISPLAY_NAME: 'Samuel Baer',
};

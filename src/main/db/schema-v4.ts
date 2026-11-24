// Bestehende Journale behalten als Lernberichte ihre drei Abschnitte.
export const SCHEMA_V4 = /* sql */ `
ALTER TABLE journal ADD COLUMN template TEXT NOT NULL DEFAULT 'report'
  CHECK (template IN ('report', 'blank', 'machine', 'workflow'));
`;

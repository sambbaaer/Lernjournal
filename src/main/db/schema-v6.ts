// Eigene, freiwillige Vormerkung für den QV-Export.
export const SCHEMA_V6 = /* sql */ `
ALTER TABLE journal ADD COLUMN qv_selected INTEGER NOT NULL DEFAULT 0
  CHECK (qv_selected IN (0, 1));
`;

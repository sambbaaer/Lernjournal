// Rotation der Sicherungen (AJ-15): «letzte 10 + je ein Monatsstand» als
// reine Funktion mit Grenzfällen. Zusammenspiel mit echten Dateien und dem
// Bildvorrat: backup.test.ts.
import { describe, expect, it } from 'vitest';
import { BACKUP_POLICY } from '@shared/backup';
import { backupIdFor, dateFromBackupId } from './backup-format';
import { backupsToKeep, type RotationItem } from './rotation';

const item = (d: Date): RotationItem => ({ id: backupIdFor(d), createdAt: d });
const hours = (start: Date, n: number) =>
  Array.from({ length: n }, (_, i) => item(new Date(start.getTime() + i * 3600_000)));

describe('backupsToKeep', () => {
  it('behält die neuesten 10, ältere am selben Tag fallen weg', () => {
    const items = hours(new Date(2026, 10, 24, 6), 15);
    const keep = backupsToKeep(items, BACKUP_POLICY);
    expect([...keep].sort()).toEqual(
      items
        .slice(5)
        .map((i) => i.id)
        .sort(),
    );
  });

  it('weniger als 10: alle bleiben', () => {
    const items = hours(new Date(2026, 10, 24, 6), 4);
    expect(backupsToKeep(items, BACKUP_POLICY).size).toBe(4);
  });

  it('je Monat bleibt die neueste Sicherung (Stand am Monatsende), Monatsgrenze in Ortszeit', () => {
    const items = [
      item(new Date(2026, 7, 31, 23, 59)), // 31.8. 23:59 → August
      item(new Date(2026, 7, 2, 8)),
      item(new Date(2026, 8, 1, 0, 0)), // 1.9. 00:00 → September
      item(new Date(2026, 8, 15, 12)),
      ...hours(new Date(2026, 10, 20, 8), 12),
    ];
    const keep = backupsToKeep(items, BACKUP_POLICY);
    expect(keep.has(items[0]!.id)).toBe(true); // neueste im August
    expect(keep.has(items[1]!.id)).toBe(false);
    expect(keep.has(items[3]!.id)).toBe(true); // neueste im September
    expect(keep.has(items[2]!.id)).toBe(false);
    expect(keep.size).toBe(12);
  });

  it('Monatsstände nur für die neuesten keepMonths Monate', () => {
    const items = Array.from({ length: 60 }, (_, m) => item(new Date(2022, m, 10)));
    const keep = backupsToKeep(items, BACKUP_POLICY);
    expect(keep.size).toBe(BACKUP_POLICY.keepMonths);
    expect(keep.has(items[59]!.id)).toBe(true);
    expect(keep.has(items[60 - BACKUP_POLICY.keepMonths]!.id)).toBe(true);
    expect(keep.has(items[60 - BACKUP_POLICY.keepMonths - 1]!.id)).toBe(false);
  });

  it('geschützte Sicherungen bleiben immer – auch mit «falschem» Datum (Uhr verstellt)', () => {
    const items = hours(new Date(2026, 10, 24, 6), 12);
    const wrongClock = item(new Date(2019, 0, 1));
    const keep = backupsToKeep([...items, wrongClock], { keepLatest: 10, keepMonths: 1 }, [wrongClock.id]);
    expect(keep.has(wrongClock.id)).toBe(true);
    // ohne Schutz fiele sie weg
    expect(backupsToKeep([...items, wrongClock], { keepLatest: 10, keepMonths: 1 }).has(wrongClock.id)).toBe(
      false,
    );
    // Unbekannte IDs im Schutz erzeugen nichts
    expect(backupsToKeep(items, BACKUP_POLICY, ['gibt-es-nicht']).has('gibt-es-nicht')).toBe(false);
  });

  it('Sicherung in der Zukunft (Uhr war vorgestellt) zählt als neueste', () => {
    const items = hours(new Date(2026, 10, 24, 6), 10);
    const future = item(new Date(2030, 0, 1));
    const keep = backupsToKeep([...items, future], BACKUP_POLICY);
    expect(keep.has(future.id)).toBe(true);
    expect(keep.has(items[0]!.id)).toBe(false);
  });

  it('gleicher Zeitpunkt: eindeutiges Ergebnis nach ID', () => {
    const d = new Date(2026, 10, 24, 6);
    const items = Array.from({ length: 12 }, (_, i) => ({ id: backupIdFor(d, i), createdAt: d }));
    const a = [...backupsToKeep(items, BACKUP_POLICY)].sort();
    const b = [...backupsToKeep([...items].reverse(), BACKUP_POLICY)].sort();
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
  });
});

describe('IDs der Sicherungen', () => {
  it('UTC-Zeitstempel im Namen, Zähler bei Gleichstand, zurück in ein Datum', () => {
    const d = new Date(Date.UTC(2026, 10, 24, 8, 30, 5, 7));
    expect(backupIdFor(d)).toBe('sicherung-2026-11-24T08-30-05-007Z');
    expect(backupIdFor(d, 2)).toBe('sicherung-2026-11-24T08-30-05-007Z-2');
    expect(dateFromBackupId(backupIdFor(d, 2))?.toISOString()).toBe(d.toISOString());
    expect(dateFromBackupId('sicherung-2026-13-45T99-00-00-000Z')).toBeNull();
    expect(dateFromBackupId('../sicherung-2026-11-24T08-30-05-007Z')).toBeNull();
  });
});

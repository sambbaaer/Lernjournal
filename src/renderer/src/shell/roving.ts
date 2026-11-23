// Pfeiltasten-Navigation innerhalb einer Gruppe (Register, Werkzeugleiste,
// Navigationsliste). Nur ein Element der Gruppe ist per Tab erreichbar; die
// Pfeiltasten wandern darin. So muss man nicht durch 20 Knöpfe tabben.
import type { KeyboardEvent } from 'react';

export function handleRovingKeys(
  event: KeyboardEvent<HTMLElement>,
  orientation: 'horizontal' | 'vertical',
  selector = '[data-roving]',
): void {
  const prev = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
  const next = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
  if (![prev, next, 'Home', 'End'].includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(selector));
  if (items.length === 0) return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  let target = current;
  if (event.key === prev) target = current <= 0 ? items.length - 1 : current - 1;
  if (event.key === next) target = current === items.length - 1 ? 0 : current + 1;
  if (event.key === 'Home') target = 0;
  if (event.key === 'End') target = items.length - 1;
  event.preventDefault();
  items[target]?.focus();
}

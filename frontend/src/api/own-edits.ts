/** Which rows this window has just changed: they do not need to flash as news. */
import type { Entity } from './types';

const OWN_MS = 5000;
const recent = new Map<string, number>();

export function markOwn(entity: Entity, id: number, now = Date.now()) {
  recent.set(`${entity}-${id}`, now);
}

export function isOwn(key: string, now = Date.now()): boolean {
  const at = recent.get(key);
  return at !== undefined && now - at < OWN_MS;
}

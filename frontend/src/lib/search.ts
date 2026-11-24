/** Filters in the address bar: reload, Back and bookmarks keep them. */
import type { Status } from '@/api/types';
import { isStatus } from './status';
import { VIEWS, type View } from './tree';

export interface TreeSearch {
  q?: string;
  view?: View;
  status?: Status[];
  project?: string;
  archived?: boolean;
  /** Row open in the side panel, e.g. "task-12". */
  item?: string;
}

export function parseTreeSearch(raw: Record<string, unknown>): TreeSearch {
  const result: TreeSearch = {};
  // The router reads ?q=5 as a number.
  if (typeof raw.q === 'string' || typeof raw.q === 'number') result.q = String(raw.q);
  if (VIEWS.includes(raw.view as View)) result.view = raw.view as View;
  const status = Array.isArray(raw.status) ? raw.status.filter(isStatus) : [];
  if (status.length > 0) result.status = status;
  if (typeof raw.project === 'string') result.project = raw.project;
  if (raw.archived === true) result.archived = true;
  if (typeof raw.item === 'string' && /^(project|milestone|task)-\d+$/.test(raw.item)) {
    result.item = raw.item;
  }
  return result;
}

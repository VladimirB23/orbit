import type { Changes } from '@/api/patch';
import type { NodeKey, TreeItem } from '@/lib/tree';

export type CellMenu = 'status' | 'start' | 'due' | 'actions';
export type TextCell = 'title' | 'note';
export type AddKind = 'milestone' | 'task';

/** What a row can ask the page to do. */
export interface RowActions {
  activate: (key: NodeKey) => void;
  toggle: (item: TreeItem) => void;
  open: (item: TreeItem) => void;
  complete: (item: TreeItem) => void;
  save: (item: TreeItem, changes: Changes) => Promise<boolean>;
  startEdit: (item: TreeItem, cell: TextCell) => void;
  stopEdit: (item: TreeItem, refocus: boolean) => void;
  setMenu: (item: TreeItem, menu: CellMenu | null) => void;
  startAdd: (item: TreeItem, kind: AddKind) => void;
  remove: (item: TreeItem) => void;
  /** The folder or the note of the project the row belongs to. */
  openPlace: (item: TreeItem, place: 'vscode' | 'note') => void;
  setArchived: (item: TreeItem, archived: boolean) => void;
}

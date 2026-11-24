/** Keyboard of a list of rows: the same on every screen that shows them. */
import { useEffect, useRef } from 'react';
import { hotkey } from '@/lib/hotkeys';
import type { NodeKey, Row, TreeItem } from '@/lib/tree';
import { focusRow } from './focus';
import type { AddKind, CellMenu, RowActions, TextCell } from './types';

export interface TreeUi {
  active: NodeKey | null;
  selected: string | null;
  editing: { key: NodeKey; cell: TextCell } | null;
  menu: { key: NodeKey; name: CellMenu } | null;
  adding: { parent: NodeKey; kind: AddKind } | null;
}

interface Options {
  rows: Row[];
  ui: TreeUi;
  actions: RowActions;
  /** Keys only this screen has; they win over the common ones. */
  more?: (event: React.KeyboardEvent, item: TreeItem) => (() => void) | undefined;
}

export function useRowKeys({ rows, ui, actions, more }: Options) {
  const root = useRef<HTMLDivElement>(null);

  // The active row may disappear (filtered, deleted): Tab must still reach the tree.
  const activeKey = rows.some((row) => row.item.key === ui.active)
    ? ui.active
    : (rows[0]?.item.key ?? null);

  // Bring the row of the side panel into view when it is opened from elsewhere.
  useEffect(() => {
    if (ui.selected === null) return;
    root.current
      ?.querySelector(`[data-key="${ui.selected}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [ui.selected]);

  function onKeyDown(event: React.KeyboardEvent) {
    const index = rows.findIndex((row) => row.item.key === activeKey);
    const row = rows[index];
    if (!row) return;
    const { item } = row;
    const onRow = event.target === event.currentTarget.querySelector(`[data-key="${item.key}"]`);

    const go = (to: number) => {
      const next = rows[Math.max(0, Math.min(to, rows.length - 1))];
      if (!next) return;
      actions.activate(next.item.key);
      focusRow(next.item.key);
      if (ui.selected !== null) actions.open(next.item);
    };

    const navigation: Record<string, () => void> = {
      ArrowDown: () => go(index + 1),
      ArrowUp: () => go(index - 1),
      Home: () => go(0),
      End: () => go(rows.length - 1),
      ArrowRight: () => {
        if (row.hasChildren && !row.open) actions.toggle(item);
        else if (row.hasChildren) go(index + 1);
      },
      ArrowLeft: () => {
        if (row.hasChildren && row.open) return actions.toggle(item);
        const parent = rows.findLastIndex((r, i) => i < index && r.depth < row.depth);
        if (parent >= 0) go(parent);
      },
    };
    // Enter and Space belong to a button when a button is focused.
    const onRowOnly: Record<string, () => void> = {
      Enter: () => actions.open(item),
      ' ': () => item.entity !== 'project' && actions.complete(item),
    };
    const letters: Record<string, () => void> = {
      s: () => actions.setMenu(item, 'status'),
      d: () => actions.setMenu(item, 'due'),
      c: () => actions.startEdit(item, 'note'),
      f2: () => actions.startEdit(item, 'title'),
      n: () => actions.startAdd(item, 'task'),
      'shift+n': () => actions.startAdd(item, 'milestone'),
      o: () => actions.openPlace(item, 'vscode'),
      'shift+o': () => actions.openPlace(item, 'note'),
      delete: () => item.entity !== 'project' && actions.remove(item),
    };

    const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
    const run =
      more?.(event, item) ||
      (plain && navigation[event.key]) ||
      (plain && onRow && onRowOnly[event.key]) ||
      letters[hotkey(event.nativeEvent) ?? ''];
    if (!run) return;
    event.preventDefault();
    event.stopPropagation();
    run();
  }

  return { root, activeKey, onKeyDown };
}

/** Index after the last visible row inside the branch that starts at `index`. */
function branchEnd(rows: Row[], index: number): number {
  const depth = rows[index]?.depth ?? 0;
  let end = index + 1;
  while ((rows[end]?.depth ?? -1) > depth) end += 1;
  return end;
}

/** Where the line for adding goes: after the whole branch of its parent. */
export function addingPlace(rows: Row[], adding: TreeUi['adding']) {
  const index = rows.findIndex((row) => row.item.key === adding?.parent);
  const parent = rows[index];
  return parent ? { parent, after: branchEnd(rows, index) - 1 } : null;
}

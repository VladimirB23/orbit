/** The tree grid: rows, keyboard and the line for adding. */
import { Fragment, useEffect, useRef } from 'react';
import type { Meta } from '@/api/types';
import type { Day } from '@/lib/dates';
import { hotkey } from '@/lib/hotkeys';
import type { NodeKey, Row, TreeItem } from '@/lib/tree';
import { focusRow } from './focus';
import { QuickAdd } from './quick-add';
import { TreeRow } from './tree-row';
import type { AddKind, CellMenu, RowActions, TextCell } from './types';

export interface TreeUi {
  active: NodeKey | null;
  selected: string | null;
  editing: { key: NodeKey; cell: TextCell } | null;
  menu: { key: NodeKey; name: CellMenu } | null;
  adding: { parent: NodeKey; kind: AddKind } | null;
}

interface Props {
  rows: Row[];
  today: Day;
  limits: Meta['limits'];
  ui: TreeUi;
  flashing: (row: Row) => boolean;
  actions: RowActions;
  onAddClose: (parent: TreeItem, refocus: boolean) => void;
  empty: React.ReactNode;
}

const HEADERS = [
  ['Название', 'pl-8'],
  ['Статус', 'pl-1.5'],
  ['Прогресс', 'col-progress pl-1.5'],
  ['Старт', 'col-start pl-1.5'],
  ['Срок', 'pl-1.5'],
  ['Комментарий', 'col-note pl-1.5'],
] as const;

/** Index after the last visible row inside the branch that starts at `index`. */
function branchEnd(rows: Row[], index: number): number {
  const depth = rows[index]?.depth ?? 0;
  let end = index + 1;
  while ((rows[end]?.depth ?? -1) > depth) end += 1;
  return end;
}

export function TreeView(props: Props) {
  const { rows, today, limits, ui, flashing, actions, onAddClose, empty } = props;
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
      (plain && navigation[event.key]) ||
      (plain && onRow && onRowOnly[event.key]) ||
      letters[hotkey(event.nativeEvent) ?? ''];
    if (!run) return;
    event.preventDefault();
    event.stopPropagation();
    run();
  }

  const addAfter = ui.adding
    ? branchEnd(
        rows,
        rows.findIndex((row) => row.item.key === ui.adding?.parent),
      ) - 1
    : -1;
  const parent = rows.find((row) => row.item.key === ui.adding?.parent);

  return (
    <div className="tree min-w-0 flex-1 overflow-auto">
      <div
        ref={root}
        role="treegrid"
        tabIndex={-1}
        aria-label="Проекты, этапы и задачи"
        aria-rowcount={rows.length + 1}
        onKeyDown={onKeyDown}
        className="outline-none"
      >
        <div
          role="row"
          className="tree-grid sticky top-0 z-25 h-8 border-border border-b bg-background px-3 text-muted-foreground text-xs"
        >
          {HEADERS.map(([title, className]) => (
            <div role="columnheader" key={title} className={className}>
              <span className={title === 'Статус' ? 'col-status-text' : undefined}>{title}</span>
            </div>
          ))}
          <div role="columnheader">
            <span className="sr-only">Действия</span>
          </div>
        </div>
        {rows.map((row, index) => (
          <Fragment key={row.item.key}>
            <TreeRow
              row={row}
              today={today}
              limits={limits}
              active={row.item.key === activeKey}
              selected={row.item.key === ui.selected}
              flash={flashing(row)}
              editing={ui.editing?.key === row.item.key ? ui.editing.cell : null}
              menu={ui.menu?.key === row.item.key ? ui.menu.name : null}
              actions={actions}
            />
            {index === addAfter && ui.adding && parent && (
              <QuickAdd
                key={`${ui.adding.parent}-${ui.adding.kind}`}
                parent={parent.item}
                kind={ui.adding.kind}
                depth={parent.depth + 1}
                limit={ui.adding.kind === 'milestone' ? limits.name : limits.title}
                onClose={(refocus) => {
                  onAddClose(parent.item, refocus);
                  if (refocus) requestAnimationFrame(() => focusRow(parent.item.key));
                }}
              />
            )}
          </Fragment>
        ))}
      </div>
      {rows.length === 0 && empty}
    </div>
  );
}

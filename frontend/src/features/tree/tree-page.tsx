/** The main screen: summary, tree and the side panel. */
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useMeta, useTree } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { ItemPanel, useEscape } from '@/features/item/item-panel';
import { places } from '@/features/item/places';
import { useEdit } from '@/features/item/use-edit';
import { NewProjectDialog } from '@/features/project/new-project-dialog';
import { useAppEvents } from '@/lib/app-events';
import { openExternal } from '@/lib/external';
import { asBoolean, asStrings, usePersisted } from '@/lib/persisted';
import { isClosed } from '@/lib/status';
import {
  ancestorsOf,
  buildItems,
  countViews,
  type Filter,
  findItem,
  isFiltering,
  type NodeKey,
  nodeKey,
  type TreeItem,
  visibleRows,
} from '@/lib/tree';
import type { TreeSearch } from '@/router';
import { focusRow, focusRowSoon } from './focus';
import { FilterMenu, SearchField, SummaryBar } from './toolbar';
import { type TreeUi, TreeView } from './tree-view';
import type { RowActions } from './types';
import { useFlash } from './use-flash';

const NO_TOGGLES: ReadonlySet<NodeKey> = new Set();

function flip(set: ReadonlySet<NodeKey>, key: NodeKey): Set<NodeKey> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

export function TreePage() {
  const search = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  const meta = useMeta();
  const archived = search.archived ?? false;
  const tree = useTree(archived);
  const edit = useEdit();

  // --- what is shown ---------------------------------------------------------

  const [hideClosed, setHideClosed] = usePersisted('orbit.hideClosed', false, asBoolean);
  const [expandedList, setExpandedList] = usePersisted<string[]>('orbit.expanded', [], asStrings);
  const expanded = useMemo(() => new Set(expandedList as NodeKey[]), [expandedList]);
  const [toggled, setToggled] = useState(NO_TOGGLES);

  const filter = useMemo<Filter>(
    () => ({
      q: search.q ?? '',
      view: search.view ?? null,
      statuses: search.status ?? [],
      project: search.project ?? null,
      hideClosed,
    }),
    [search, hideClosed],
  );

  const items = useMemo(() => tree.data && buildItems(tree.data), [tree.data]);
  const counts = useMemo(() => countViews(items ?? []), [items]);
  const rows = useMemo(
    () => visibleRows(items ?? [], filter, { expanded, toggled }),
    [items, filter, expanded, toggled],
  );
  const flashing = useFlash(items);

  const setSearch = useCallback(
    (patch: Partial<TreeSearch>, replace = true) =>
      void navigate({ search: (previous) => ({ ...previous, ...patch }), replace }),
    [navigate],
  );

  const setFilter = useCallback(
    (patch: Partial<Filter>) => {
      setToggled(NO_TOGGLES);
      const { hideClosed: hide, q, view, statuses, project } = patch;
      if (hide !== undefined) setHideClosed(() => hide);
      const next: Partial<TreeSearch> = {};
      if (q !== undefined) next.q = q || undefined;
      if (view !== undefined) next.view = view ?? undefined;
      if (statuses !== undefined) next.status = statuses.length ? statuses : undefined;
      if (project !== undefined) next.project = project ?? undefined;
      if (Object.keys(next).length > 0) setSearch(next);
    },
    [setSearch, setHideClosed],
  );
  const setQuery = useCallback((q: string) => setFilter({ q }), [setFilter]);

  const reset = () => {
    setFilter({ hideClosed: false });
    setSearch({
      q: undefined,
      view: undefined,
      status: undefined,
      project: undefined,
      archived: undefined,
    });
  };

  // --- interaction -----------------------------------------------------------

  const [ui, setUi] = useState<Omit<TreeUi, 'selected'>>({
    active: null,
    editing: null,
    menu: null,
    adding: null,
  });
  const [creating, setCreating] = useState(false);

  const selected = search.item ?? null;
  const selectedItem = selected && items ? findItem(items, selected) : undefined;

  const expand = useCallback(
    (keys: NodeKey[]) => setExpandedList((list) => [...new Set([...list, ...keys])]),
    [setExpandedList],
  );

  const open = (item: TreeItem) => {
    setUi((state) => ({ ...state, active: item.key }));
    // The first opening goes to the browser history, so Back closes the panel.
    if (item.key !== selected) setSearch({ item: item.key }, selected !== null);
  };

  const reveal = (item: TreeItem) => {
    if (items) expand(ancestorsOf(items, item.key));
    open(item);
  };

  const closePanel = useCallback(() => {
    setSearch({ item: undefined });
    if (selected) requestAnimationFrame(() => focusRow(selected as NodeKey));
  }, [setSearch, selected]);
  useEscape(selectedItem !== undefined, closePanel);

  // A link to an item opens the path to it, once.
  const loaded = items !== undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only for the first load
  useEffect(() => {
    if (items && selected) expand(ancestorsOf(items, selected));
  }, [loaded]);

  const isOpen = (item: TreeItem) => rows.find((row) => row.item.key === item.key)?.open ?? false;

  const toggle = (item: TreeItem) => {
    if (isFiltering(filter)) return setToggled((keys) => flip(keys, item.key));
    setExpandedList((list) => [...flip(new Set(list as NodeKey[]), item.key)]);
  };

  const actions: RowActions = {
    activate: (key) => setUi((state) => (state.active === key ? state : { ...state, active: key })),
    toggle,
    open,
    complete: (item) =>
      void edit.edit(item, { status: isClosed(item.status) ? 'in_progress' : 'done' }),
    save: edit.edit,
    startEdit: (item, cell) => {
      const column = document.querySelector<HTMLElement>('.tree-grid > .col-note');
      if (cell === 'note' && column && column.offsetParent === null) return open(item);
      setUi((state) => ({ ...state, active: item.key, editing: { key: item.key, cell } }));
    },
    stopEdit: (item, refocus) => {
      setUi((state) => ({ ...state, editing: null }));
      if (refocus) requestAnimationFrame(() => focusRow(item.key));
    },
    setMenu: (item, menu) =>
      setUi((state) => ({ ...state, menu: menu && { key: item.key, name: menu } })),
    startAdd: (item, wanted) => {
      // Milestones live only in projects: elsewhere the same key adds a task.
      const kind = item.entity === 'project' ? wanted : 'task';
      if (item.children.length > 0 && !isOpen(item)) toggle(item);
      if (!isFiltering(filter)) expand([item.key]);
      setUi((state) => ({ ...state, active: item.key, adding: { parent: item.key, kind } }));
    },
    remove: async (item) => {
      const index = rows.findIndex((row) => row.item.key === item.key);
      const neighbor = rows[index - 1]?.item.key ?? null;
      if (!(await edit.removeItem(item))) return;
      if (selected === item.key) setSearch({ item: undefined });
      if (neighbor) {
        setUi((state) => ({ ...state, active: neighbor }));
        requestAnimationFrame(() => focusRow(neighbor));
      }
    },
    openPlace: (item, place) => {
      const owner = items?.find((project) => project.slug === item.slug);
      const url = places(owner?.project, meta.data?.vault ?? null)[place];
      if (url) return openExternal(url);
      toast(place === 'vscode' ? 'У проекта не указана папка' : 'У проекта не указана заметка');
    },
    setArchived: (item, value) => void edit.setArchived(item, value),
  };

  useAppEvents({
    newProject: () => setCreating(true),
    reveal: (key) => {
      if (!items || !findItem(items, key)) return;
      expand(ancestorsOf(items, key));
      setUi((state) => ({ ...state, active: key }));
      // Filters could hide the row; Back returns them.
      const clear = { q: undefined, view: undefined, status: undefined, project: undefined };
      setSearch({ ...clear, item: key }, key === selected);
      focusRowSoon(key);
    },
  });

  // --- screen ----------------------------------------------------------------

  if (tree.isError && !tree.data) {
    return (
      <Message title="Не получилось загрузить проекты">
        <p>Сервер не отвечает. Запусти его командой «orbit serve» и нажми кнопку.</p>
        <Button onClick={() => void tree.refetch()}>Загрузить еще раз</Button>
      </Message>
    );
  }
  if (!items || !tree.data || !meta.data) return <Loading />;

  const { limits } = meta.data;
  const projects = items.map(({ slug, title }) => ({ slug, title }));
  const project = selectedItem && items.find((item) => item.slug === selectedItem.slug);

  return (
    <div className="flex min-h-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-border border-b px-4 py-2.5">
          <SummaryBar filter={filter} counts={counts} onFilter={setFilter} />
          <div className="flex min-w-64 flex-1 items-center justify-end gap-2">
            <SearchField value={filter.q} onChange={setQuery} />
            <FilterMenu
              filter={filter}
              archived={archived}
              projects={projects}
              onFilter={setFilter}
              onArchived={(value) => setSearch({ archived: value || undefined })}
              onReset={reset}
            />
          </div>
        </div>
        <TreeView
          rows={rows}
          today={tree.data.today}
          limits={limits}
          ui={{ ...ui, selected: selectedItem?.key ?? null }}
          flashing={flashing}
          actions={actions}
          onAddClose={() => setUi((state) => ({ ...state, adding: null }))}
          empty={
            items.length === 0 && !isFiltering(filter) ? (
              <Message title="Пока нет ни одного проекта">
                <p>Создай первый, а этапы и задачи добавишь внутри него.</p>
                <Button onClick={() => setCreating(true)}>Новый проект</Button>
              </Message>
            ) : (
              <Message title="Ничего не нашлось">
                <p>Под выбранные условия не подходит ни один пункт.</p>
                <Button variant="outline" onClick={reset}>
                  Сбросить фильтры
                </Button>
              </Message>
            )
          }
        />
      </main>
      {selectedItem && project && (
        <ItemPanel
          item={selectedItem}
          project={project.project}
          path={ancestorsOf(items, selectedItem.key).flatMap((key) => findItem(items, key) ?? [])}
          milestones={project.children.filter((child) => child.entity === 'milestone')}
          today={tree.data.today}
          limits={limits}
          edit={edit}
          onOpen={reveal}
          onClose={closePanel}
        />
      )}
      <NewProjectDialog
        open={creating}
        onOpenChange={setCreating}
        taken={projects.map((p) => p.slug)}
        limits={limits}
        onCreated={(created) => {
          setCreating(false);
          const key = nodeKey('project', created.id);
          setUi((state) => ({ ...state, active: key }));
          setSearch({ item: key });
        }}
      />
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-20 text-center text-muted-foreground">
      <h2 className="font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div role="status" className="flex-1 space-y-px p-4">
      <span className="sr-only">Загрузка</span>
      {['a', 'b', 'c', 'd', 'e', 'f'].map((id) => (
        <div key={id} className="h-11 animate-pulse rounded-md bg-raised/70" />
      ))}
    </div>
  );
}

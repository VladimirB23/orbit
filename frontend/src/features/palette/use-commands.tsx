import { useNavigate, useSearch } from '@tanstack/react-router';
import { BookOpen, CodeXml, Copy, Eye, Keyboard, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useMeta, useTree } from '@/api/queries';
import { copyText } from '@/components/copy-button';
import { OrbitGlyph } from '@/components/orbit-glyph';
import { places } from '@/features/item/places';
import { emitNewProject, emitReveal } from '@/lib/app-events';
import { openExternal } from '@/lib/external';
import type { Entry } from '@/lib/palette';
import { isClosed, VIEW_LABEL } from '@/lib/status';
import { buildItems, findItem, type TreeItem, VIEWS } from '@/lib/tree';

export interface Command extends Entry {
  icon: React.ReactNode;
  /** Opens another program. */
  external?: boolean;
  run: () => unknown;
}

const plain = { hint: '', keywords: '', closed: false, always: false };

function goTo(item: TreeItem, path: string[]): Command {
  return {
    ...plain,
    id: item.key,
    title: item.title,
    hint: path.join(' / '),
    keywords: item.entity === 'project' ? item.slug : `#${item.id}`,
    closed: isClosed(item.status),
    always: item.entity === 'project',
    icon: <OrbitGlyph status={item.status} progress={item.progress ?? undefined} />,
    run: () => emitReveal(item.key),
  };
}

function goToAll(items: TreeItem[], path: string[] = []): Command[] {
  return items.flatMap((item) => [
    goTo(item, path),
    ...goToAll(item.children, [...path, item.title]),
  ]);
}

function placeCommands(item: TreeItem, vault: string | null, always: boolean): Command[] {
  const { folder, vscode, note } = places(item.project, vault);
  const base = { ...plain, keywords: item.slug, always };
  const commands: Command[] = [];
  if (vscode && folder) {
    commands.push(
      {
        ...base,
        id: `vscode-${item.key}`,
        title: `Открыть в VS Code: ${item.title}`,
        hint: folder,
        icon: <CodeXml />,
        external: true,
        run: () => openExternal(vscode),
      },
      {
        ...base,
        id: `copy-${item.key}`,
        title: `Скопировать адрес папки: ${item.title}`,
        hint: folder,
        always: false,
        icon: <Copy />,
        external: true,
        run: async () => (await copyText(folder)) && toast(`Скопировано: ${folder}`),
      },
    );
  }
  if (note) {
    commands.push({
      ...base,
      id: `note-${item.key}`,
      title: `Открыть заметку: ${item.title}`,
      icon: <BookOpen />,
      external: true,
      run: () => openExternal(note),
    });
  }
  return commands;
}

export function usePaletteCommands(onHelp: () => void): Command[] {
  const search = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  const { data: meta } = useMeta();
  const { data: tree } = useTree(search.archived ?? false);

  return useMemo(() => {
    const items = tree ? buildItems(tree) : [];
    const vault = meta?.vault ?? null;
    const selected = search.item ? findItem(items, search.item)?.slug : undefined;
    // What is open now comes first: its folder and note are the likeliest wish.
    const here = items.filter((item) => item.slug === selected);
    const rest = items.filter((item) => item.slug !== selected);
    const all = goToAll(items);
    return [
      ...here.flatMap((item) => placeCommands(item, vault, true)),
      ...all.filter((command) => command.always),
      ...VIEWS.map((view) => ({
        ...plain,
        id: `view-${view}`,
        title: `Показать: ${VIEW_LABEL[view].toLowerCase()}`,
        always: true,
        icon: <Eye />,
        run: () => void navigate({ search: { view } }),
      })),
      {
        ...plain,
        id: 'new-project',
        title: 'Новый проект',
        always: true,
        icon: <Plus />,
        run: emitNewProject,
      },
      {
        ...plain,
        id: 'help',
        title: 'Горячие клавиши',
        always: true,
        icon: <Keyboard />,
        run: onHelp,
      },
      ...all.filter((command) => !command.always),
      ...rest.flatMap((item) => placeCommands(item, vault, false)),
    ];
  }, [tree, meta, search.item, navigate, onHelp]);
}

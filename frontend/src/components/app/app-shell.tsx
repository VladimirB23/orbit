/** Frame around every screen: header, notifications, global shortcuts. */
import { Link, Outlet, useNavigate, useSearch } from '@tanstack/react-router';
import {
  ChartColumn,
  ChartGantt,
  Keyboard,
  ListTree,
  Monitor,
  Moon,
  Plus,
  Search,
  Sun,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { type LiveState, useLiveUpdates } from '@/api/live';
import { useMeta } from '@/api/queries';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUndo } from '@/features/item/use-undo';
import { Palette } from '@/features/palette/palette';
import { emitNewProject } from '@/lib/app-events';
import { hotkey, isPaletteKey, undoKey } from '@/lib/hotkeys';
import type { Screen } from '@/lib/search';
import { type Theme, useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { ShortcutsDialog } from './shortcuts-dialog';

export function AppShell() {
  const live = useLiveUpdates();
  const { data: meta } = useMeta();
  const [theme, setTheme, resolved] = useTheme();
  const [help, setHelp] = useState(false);
  const [palette, setPalette] = useState(false);
  const openHelp = useCallback(() => setHelp(true), []);
  const switchScreen = useSwitchScreen();
  const undo = useUndo();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isPaletteKey(event)) {
        event.preventDefault(); // the browser would go to its address bar
        // Over another dialog it would hide an unanswered question.
        if (!document.querySelector('[role="dialog"],[role="alertdialog"]')) setPalette(true);
        return;
      }
      const way = undoKey(event);
      if (way) {
        event.preventDefault();
        undo(way);
        return;
      }
      const run: Record<string, () => void> = {
        '/': () => document.getElementById('search')?.focus(),
        '?': () => setHelp(true),
        p: emitNewProject,
        g: () => switchScreen('timeline'),
        a: () => switchScreen('analytics'),
      };
      const action = run[hotkey(event) ?? ''];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [switchScreen, undo]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-border border-b bg-card px-4">
        <h1 className="flex items-center gap-2.5 font-semibold text-lg tracking-tight">
          <Logo />
          Orbit
        </h1>
        {meta?.database.demo && (
          <span className="rounded-md bg-sun-wash px-2 py-0.5 text-sm text-sun-ink">
            Демо<span className="max-sm:sr-only">: данные вымышлены</span>
          </span>
        )}
        <ScreenSwitch />
        <div className="ml-auto flex items-center gap-1">
          <LiveMark state={live} />
          <Button
            variant="ghost"
            size="sm"
            className="font-normal text-muted-foreground"
            title="Найти или открыть (Ctrl+K)"
            onClick={() => setPalette(true)}
          >
            <Search /> <span className="max-sm:sr-only">Найти</span>
            <kbd className="rounded border border-border px-1.5 font-sans text-xs leading-5 max-md:hidden">
              Ctrl K
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="max-sm:hidden"
            aria-label="Горячие клавиши"
            title="Горячие клавиши (?)"
            onClick={() => setHelp(true)}
          >
            <Keyboard />
          </Button>
          <ThemeMenu theme={theme} onChange={setTheme} />
          <Button size="sm" className="ml-2 h-8" title="Новый проект (P)" onClick={emitNewProject}>
            <Plus /> <span className="max-sm:sr-only">Новый проект</span>
          </Button>
        </div>
      </header>
      {live === 'offline' && (
        <p role="alert" className="shrink-0 bg-danger-wash px-4 py-2 text-danger text-sm">
          Нет связи с сервером. Показаны последние данные, правки пока не сохранятся. Если сервер
          остановлен, запусти «orbit serve»: страница подключится сама.
        </p>
      )}
      <Outlet />
      <Palette open={palette} onOpenChange={setPalette} onHelp={openHelp} />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
      <Toaster
        theme={resolved}
        position="bottom-left"
        duration={6000}
        containerAriaLabel="Уведомления"
        toastOptions={{
          style: {
            background: 'var(--popover)',
            color: 'var(--foreground)',
            borderColor: 'var(--border)',
            fontFamily: 'inherit',
          },
        }}
      />
    </div>
  );
}

/** The key of a screen brings it, pressed again it returns the tree. */
function useSwitchScreen() {
  const navigate = useNavigate();
  return useCallback(
    (screen: Screen) =>
      void navigate({
        to: '/',
        search: (now) => ({ ...now, screen: now.screen === screen ? undefined : screen }),
      }),
    [navigate],
  );
}

/** Looks at the same projects: the project filter and the open panel stay. */
function ScreenSwitch() {
  const { screen } = useSearch({ strict: false });
  const screens = [
    { value: undefined, label: 'Дерево', key: 'G', Icon: ListTree },
    { value: 'timeline' as const, label: 'Таймлайн', key: 'G', Icon: ChartGantt },
    { value: 'analytics' as const, label: 'Аналитика', key: 'A', Icon: ChartColumn },
  ];
  return (
    <nav aria-label="Экран" className="flex overflow-hidden rounded-lg border border-border">
      {screens.map(({ value, label, key, Icon }) => (
        <Link
          key={label}
          to="/"
          search={(now) => ({ ...now, screen: value })}
          aria-current={screen === value ? 'page' : undefined}
          title={`${label} (${key})`}
          className={cn(
            'flex h-7.5 items-center gap-1.5 px-2.5 text-muted-foreground text-sm hover:text-foreground',
            screen === value && 'bg-selected font-medium text-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
          <span className="max-md:sr-only">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-6">
      <circle cx="12" cy="12" r="8.5" className="stroke-input" strokeWidth="2" />
      <path
        d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"
        className="stroke-sun"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <circle cx="20.5" cy="12" r="3" className="fill-sun" />
      <circle cx="12" cy="12" r="2.5" className="fill-foreground" />
    </svg>
  );
}

const LIVE: Record<LiveState, { text: string; dot: string }> = {
  connecting: { text: 'Подключение', dot: 'bg-input' },
  live: { text: 'Обновляется само', dot: 'bg-done' },
  offline: { text: 'Нет связи', dot: 'bg-danger' },
};

function LiveMark({ state }: { state: LiveState }) {
  const { text, dot } = LIVE[state];
  return (
    <span
      role="status"
      title="Правки из терминала появляются здесь без перезагрузки"
      className="mr-2 flex items-center gap-2 text-muted-foreground text-sm"
    >
      <span className={cn('size-2 rounded-full', dot)} />
      <span className="max-md:sr-only">{text}</span>
    </span>
  );
}

const THEMES: [Theme, string, typeof Sun][] = [
  ['system', 'Как в системе', Monitor],
  ['light', 'Светлая', Sun],
  ['dark', 'Темная', Moon],
];

function ThemeMenu({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const Icon = THEMES.find(([value]) => value === theme)?.[2] ?? Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Тема" title="Тема">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => onChange(value as Theme)}>
          {THEMES.map(([value, label, ItemIcon]) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <ItemIcon className="size-4" /> {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

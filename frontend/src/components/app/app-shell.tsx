/** Frame around every screen: header, notifications, global shortcuts. */
import { Outlet } from '@tanstack/react-router';
import { Keyboard, Monitor, Moon, Plus, Search, Sun } from 'lucide-react';
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
import { Palette } from '@/features/palette/palette';
import { emitNewProject } from '@/lib/app-events';
import { hotkey, isPaletteKey } from '@/lib/hotkeys';
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isPaletteKey(event)) {
        event.preventDefault(); // the browser would go to its address bar
        // Over another dialog it would hide an unanswered question.
        if (!document.querySelector('[role="dialog"],[role="alertdialog"]')) setPalette(true);
        return;
      }
      const run: Record<string, () => void> = {
        '/': () => document.getElementById('search')?.focus(),
        '?': () => setHelp(true),
        p: emitNewProject,
      };
      const action = run[hotkey(event) ?? ''];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

/** Ctrl+K: go to any row, open a folder or a note, run a command, all from the keyboard. */
import { Search } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { rank } from '@/lib/palette';
import { cn } from '@/lib/utils';
import { type Command, usePaletteCommands } from './use-commands';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHelp: () => void;
}

export function Palette({ open, onOpenChange, onHelp }: Props) {
  // Runs when the palette has let the focus go, so a dialog or a row can take it.
  const chosen = useRef<Command | null>(null);
  // Without a trigger button Radix does not know where the focus came from.
  const before = useRef<Element | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[12dvh] left-1/2 z-50 flex max-h-[70dvh] w-full max-w-[min(40rem,calc(100%-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-xl outline-none"
          onOpenAutoFocus={() => {
            before.current = document.activeElement;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (before.current instanceof HTMLElement) before.current.focus();
            chosen.current?.run();
            chosen.current = null;
          }}
        >
          <Dialog.Title className="sr-only">Найти или открыть</Dialog.Title>
          <Body
            onHelp={onHelp}
            onChoose={(command) => {
              // Another program opens only as an answer to this very press of a key.
              if (command.external) command.run();
              else chosen.current = command;
              onOpenChange(false);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({ onHelp, onChoose }: { onHelp: () => void; onChoose: (command: Command) => void }) {
  const commands = usePaletteCommands(onHelp);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wanted = useDeferredValue(query);
  const found = useMemo(() => rank(commands, wanted), [commands, wanted]);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  // The list may shrink under the cursor when data changes.
  const current = Math.min(active, found.length - 1);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    const steps: Record<string, number> = {
      ArrowDown: current + 1,
      ArrowUp: current - 1,
      PageDown: current + 8,
      PageUp: current - 8,
    };
    const step = steps[event.key];
    if (step !== undefined) {
      event.preventDefault();
      setActive(Math.max(0, Math.min(step, found.length - 1)));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      // Enter right after typing must not run what was found for the previous letters.
      const command = rank(commands, query)[query === wanted ? current : 0];
      if (command) onChoose(command);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 border-line border-b px-4">
        <Search aria-hidden="true" className="size-4 shrink-0 text-faint" />
        <input
          role="combobox"
          aria-label="Найти или открыть"
          aria-expanded={found.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={current >= 0 ? `${id}-${current}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Проект, задача, команда"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-12 min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
        />
      </div>
      <div
        ref={list}
        id={`${id}-list`}
        role="listbox"
        aria-label="Найденное"
        className="min-h-0 overflow-y-auto p-1.5"
      >
        {found.map((command, index) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled by the combobox
          <div
            key={command.id}
            id={`${id}-${index}`}
            data-index={index}
            role="option"
            tabIndex={-1}
            aria-selected={index === current}
            onMouseMove={() => setActive(index)}
            onClick={() => onChoose(command)}
            className={cn(
              'flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2.5 py-1',
              index === current && 'bg-accent',
            )}
          >
            <span className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4">
              {command.icon}
            </span>
            <span className={cn('truncate', command.closed && 'text-muted-foreground')}>
              {command.title}
            </span>
            {command.hint && (
              <span className="ml-auto min-w-0 shrink-[2] truncate pl-3 text-muted-foreground text-sm">
                {command.hint}
              </span>
            )}
          </div>
        ))}
      </div>
      {found.length === 0 && (
        <p role="status" className="px-4 pb-4 text-muted-foreground text-sm">
          Ничего не нашлось
        </p>
      )}
    </>
  );
}

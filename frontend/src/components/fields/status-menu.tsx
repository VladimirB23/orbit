import type { Status } from '@/api/types';
import { OrbitGlyph } from '@/components/orbit-glyph';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, STATUSES } from '@/lib/status';
import { PriorityMark } from '../priority-mark';

interface MenuProps<T> {
  value: T;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onChange: (value: T) => void;
  onCloseAutoFocus?: (event: Event) => void;
  children: React.ReactNode;
}

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

export function StatusMenu({
  value,
  open,
  onOpenChange,
  onChange,
  onCloseAutoFocus,
  children,
}: MenuProps<Status>) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-48"
        onKeyDown={stop}
        onClick={stop}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => next !== value && onChange(next as Status)}
        >
          {STATUSES.map((status) => (
            <DropdownMenuRadioItem key={status} value={status}>
              <OrbitGlyph status={status} />
              {STATUS_LABEL[status]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PriorityMenu({
  value,
  open,
  onOpenChange,
  onChange,
  onCloseAutoFocus,
  children,
}: MenuProps<number>) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-44"
        onKeyDown={stop}
        onClick={stop}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DropdownMenuRadioGroup
          value={String(value)}
          onValueChange={(next) => Number(next) !== value && onChange(Number(next))}
        >
          {[...PRIORITIES].reverse().map((priority) => (
            <DropdownMenuRadioItem key={priority} value={String(priority)}>
              <PriorityMark value={priority} />
              {PRIORITY_LABEL[priority]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

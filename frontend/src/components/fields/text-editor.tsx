/** Text editing in place. Enter or leaving the field saves, Escape cancels. */
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  initial: string;
  limit: number;
  required?: boolean;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  /** Resolves to false when the text was not saved: the editor stays open. */
  onSave: (text: string) => Promise<boolean>;
  onClose: (by: 'key' | 'blur') => void;
}

const COUNTER_FROM = 0.8;

export function TextEditor({
  label,
  initial,
  limit,
  required = false,
  multiline = false,
  placeholder,
  className,
  onSave,
  onClose,
}: Props) {
  const field = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = field.current;
    el?.focus();
    el?.select();
  }, []);

  // Grow with the text.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again on every change
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  async function commit(by: 'key' | 'blur') {
    if (busy.current) return;
    const value = text.trim();
    if (value === initial.trim()) return onClose(by);
    if (required && value === '') {
      // Leaving an emptied title means "never mind"; Enter asks to fix it.
      return by === 'blur' ? onClose(by) : setError('Название не может быть пустым');
    }
    if (value.length > limit) {
      return setError(`Слишком длинно: ${value.length} из ${limit} символов`);
    }
    busy.current = true;
    const saved = await onSave(value);
    busy.current = false;
    if (saved) onClose(by);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      busy.current = true; // the blur that follows must not save
      onClose('key');
    } else if (event.key === 'Enter' && !(multiline && event.shiftKey)) {
      event.preventDefault();
      void commit('key');
    }
  }

  const length = text.trim().length;
  return (
    <span className="relative block w-full">
      <textarea
        ref={field}
        rows={1}
        aria-label={label}
        aria-invalid={error !== null}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(multiline ? event.target.value : event.target.value.replace(/\r?\n/g, ' '));
          setError(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => void commit('blur')}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        className={cn(
          'block w-full resize-none overflow-hidden rounded-md bg-card px-1.5 py-1 text-foreground shadow-sm outline-2 outline-ring',
          'placeholder:text-faint aria-invalid:outline-danger',
          className,
        )}
      />
      {error ? (
        <span
          role="alert"
          className="absolute top-full left-0 z-30 mt-1 rounded-md bg-danger-wash px-2 py-1 text-danger text-xs shadow-sm"
        >
          {error}
        </span>
      ) : (
        length > limit * COUNTER_FROM && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-full right-0 z-30 mt-1 rounded-md bg-popover px-1.5 py-0.5 text-xs shadow-sm',
              length > limit ? 'text-danger' : 'text-muted-foreground',
            )}
          >
            {length} / {limit}
          </span>
        )
      )}
    </span>
  );
}

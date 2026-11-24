import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast.error('Браузер не дал доступ к буферу обмена');
    return false;
  }
}

interface Props {
  text: string;
  label: string;
  className?: string;
}

/** Copies and says so right in the button. */
export function CopyButton({ text, label, className }: Props) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(timer);
  }, [done]);

  return (
    <button
      type="button"
      aria-label={label}
      title={done ? 'Скопировано' : label}
      onClick={async () => setDone(await copyText(text))}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
        className,
      )}
    >
      {done ? <Check className="size-4 text-done" /> : <Copy className="size-4" />}
      <span role="status" className="sr-only">
        {done && 'Скопировано'}
      </span>
    </button>
  );
}

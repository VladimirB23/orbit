/** A line for typing new tasks one after another: Enter adds and stays open. */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAddMutation } from '@/api/queries';
import { errorText } from '@/features/item/use-edit';
import type { TreeItem } from '@/lib/tree';
import type { AddKind } from './types';

interface Props {
  parent: TreeItem;
  kind: AddKind;
  depth: number;
  limit: number;
  onClose: (refocus: boolean) => void;
}

export function QuickAdd({ parent, kind, depth, limit, onClose }: Props) {
  const add = useAddMutation();
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const [title, setTitle] = useState('');
  const what = kind === 'milestone' ? 'этапа' : parent.entity === 'task' ? 'подзадачи' : 'задачи';

  async function submit(): Promise<boolean> {
    const text = title.trim();
    if (!text || add.isPending) return false;
    try {
      await add.mutateAsync({
        slug: parent.slug,
        kind,
        title: text,
        milestoneId: parent.milestoneId,
        parentId: parent.entity === 'task' ? parent.id : null,
      });
      setTitle('');
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  }

  function close(refocus: boolean) {
    if (done.current) return;
    done.current = true;
    onClose(refocus);
  }

  return (
    <div
      className="flex min-h-9 items-center border-line border-b bg-selected/60 pr-3"
      style={{ paddingLeft: `${depth * 1.5 + 4.8}rem` }}
    >
      <input
        ref={field}
        // biome-ignore lint/a11y/noAutofocus: the person has just asked to type here
        autoFocus
        aria-label={`Название ${what}`}
        placeholder={`Название ${what}: Enter добавит, Esc закроет`}
        maxLength={limit}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') void submit();
          if (event.key === 'Escape') close(true);
        }}
        onBlur={async () => {
          if (done.current) return;
          // Typed but not confirmed: save rather than lose.
          const text = title.trim();
          if (!text || (await submit())) close(false);
        }}
        className="h-8 w-full bg-transparent outline-none placeholder:text-faint"
      />
    </div>
  );
}

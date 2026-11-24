/** Saving with everything a person expects around it: undo, confirmations, clear errors. */
import { useRef } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import type { Changes } from '@/api/patch';
import { type Target, useArchiveMutation, useRemoveMutation, useSaveMutation } from '@/api/queries';
import type { Status } from '@/api/types';
import { useConfirm } from '@/components/confirm';
import { formatDay } from '@/lib/dates';
import { isClosed, STATUS_LABEL } from '@/lib/status';
import type { DateChanges } from '@/lib/timeline';
import { type NodeKey, type TreeItem, walk } from '@/lib/tree';

export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Не сохранено: неизвестная ошибка';
  if (error.type === 'offline') return 'Нет связи с сервером, изменение не сохранено';
  if (error.type === 'unavailable') return 'База занята другой программой, попробуй еще раз';
  if (error.type === 'not_found') return 'Этого пункта уже нет: его удалили или переименовали';
  if (error.message.includes('is after due date')) return 'Старт не может быть позже срока';
  if (error.message.includes('already exists')) return 'Проект с таким кодом уже есть';
  return `Не сохранено: ${error.message}`;
}

export const targetOf = ({ entity, id, slug }: TreeItem): Target => ({ entity, id, slug });
export const titleField = (item: TreeItem) => (item.entity === 'task' ? 'title' : 'name');
export const noteField = (item: TreeItem) => (item.entity === 'task' ? 'comment' : 'summary');

/** Moves of one row closer than this are one move: "undo" returns to where it started. */
const BURST_MS = 6000;
type Dates = { start_date: string | null; due_date: string | null };

const isConflict = (error: unknown) => error instanceof ApiError && error.type === 'conflict';

export function useEdit() {
  const confirm = useConfirm();
  const { mutateAsync: save } = useSaveMutation();
  const { mutateAsync: remove } = useRemoveMutation();
  const { mutateAsync: archive } = useArchiveMutation();

  const closesWithOpenWork = (item: TreeItem) =>
    confirm({
      title: 'Внутри есть незакрытое',
      body: `«${item.title}» содержит незавершенные пункты. Если закрыть, они сохранятся как есть, но останутся внутри закрытого.`,
      action: 'Все равно закрыть',
    });

  /** True when saved; the caller may keep its editor open otherwise. */
  async function edit(item: TreeItem, changes: Changes): Promise<boolean> {
    const target = targetOf(item);
    try {
      await save({ target, changes });
    } catch (error) {
      if (!isConflict(error)) {
        toast.error(errorText(error));
        return false;
      }
      if (!(await closesWithOpenWork(item))) return false;
      try {
        await save({ target, changes, force: true });
      } catch (second) {
        toast.error(errorText(second));
        return false;
      }
    }
    const status = changes.status as Status | undefined;
    if (status !== undefined && isClosed(status)) {
      toast(`${STATUS_LABEL[status]}: ${item.title}`, {
        action: { label: 'Вернуть', onClick: () => void edit(item, { status: item.status }) },
      });
    }
    return true;
  }

  const bursts = useRef(new Map<NodeKey, { at: number; before: Dates }>());

  async function reschedule(item: TreeItem, changes: DateChanges, today: string): Promise<boolean> {
    const last = bursts.current.get(item.key);
    const fresh = last !== undefined && Date.now() - last.at < BURST_MS;
    const before = fresh ? last.before : { start_date: item.startDate, due_date: item.dueDate };
    bursts.current.set(item.key, { at: Date.now(), before });
    if (!(await edit(item, { ...changes }))) return false;
    const days = [changes.start_date ?? item.startDate, changes.due_date ?? item.dueDate];
    const text = days.flatMap((day) => (day ? formatDay(day, today) : [])).join(' – ');
    toast(`${text}: ${item.title}`, {
      id: `dates-${item.key}`,
      action: {
        label: 'Вернуть',
        onClick: () => {
          bursts.current.delete(item.key);
          void edit(item, before);
        },
      },
    });
    return true;
  }

  async function removeItem(item: TreeItem): Promise<boolean> {
    const inside = [...walk(item.children)].length;
    const ok = await confirm({
      title: item.entity === 'milestone' ? 'Удалить этап?' : 'Удалить задачу?',
      body: `«${item.title}»${inside ? ` и все внутри (${inside})` : ''}. Сразу после удаления можно вернуть: Ctrl+Z.`,
      action: 'Удалить',
      destructive: true,
    });
    if (!ok) return false;
    try {
      await remove({ target: targetOf(item), force: inside > 0 });
      toast(`Удалено: ${item.title}`, { description: 'Ctrl+Z вернет' });
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  }

  async function setArchived(item: TreeItem, archived: boolean): Promise<boolean> {
    try {
      await archive({ slug: item.slug, archived });
      toast(archived ? `В архиве: ${item.title}` : `Снова в списке: ${item.title}`, {
        action: { label: 'Отменить', onClick: () => void setArchived(item, !archived) },
      });
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  }

  return { edit, reschedule, removeItem, setArchived };
}

export type Edit = ReturnType<typeof useEdit>;

/** Ctrl+Z: the server knows what the last action was, also after a reload. */
import { useCallback } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { useUndoMutation } from '@/api/queries';
import { undoneText } from '@/lib/history';

type Way = 'undo' | 'redo';

function problem(error: unknown, way: Way): string {
  const type = error instanceof ApiError ? error.type : '';
  if (type === 'not_found') return way === 'undo' ? 'Отменять нечего' : 'Возвращать нечего';
  if (type === 'conflict') return 'Не отменено: после этого пункт уже изменили';
  if (type === 'offline') return 'Нет связи с сервером, ничего не отменено';
  if (type === 'unavailable') return 'База занята другой программой, попробуй еще раз';
  return 'Не отменено: неизвестная ошибка';
}

export function useUndo(): (way: Way) => void {
  const { mutateAsync } = useUndoMutation();
  return useCallback(
    (way) => {
      const step = async (direction: Way) => {
        try {
          const undone = await mutateAsync(direction);
          toast.dismiss(); // "undo" buttons of earlier messages speak of what is no longer there
          const back: Way = direction === 'undo' ? 'redo' : 'undo';
          toast(`${direction === 'undo' ? 'Отменено' : 'Возвращено'}: ${undoneText(undone)}`, {
            action: {
              label: direction === 'undo' ? 'Вернуть' : 'Отменить',
              onClick: () => void step(back),
            },
          });
        } catch (error) {
          toast.error(problem(error, direction), { id: 'undo-problem' });
        }
      };
      void step(way);
    },
    [mutateAsync],
  );
}

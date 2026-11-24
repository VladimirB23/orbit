import { useState } from 'react';
import { useEvents } from '@/api/queries';
import type { Actor, Entity, OrbitEvent } from '@/api/types';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/dates';
import { describeEvent, groupEvents } from '@/lib/history';
import { cn } from '@/lib/utils';

const ACTOR: Record<Actor, { name: string; mark: string; tone: string }> = {
  vladimir: { name: 'Ты', mark: 'Я', tone: 'bg-selected text-planned' },
  claude: { name: 'Claude', mark: 'C', tone: 'bg-sun-wash text-sun-ink' },
  system: { name: 'Система', mark: 'S', tone: 'bg-raised text-muted-foreground' },
};

const FIRST = 10;

export function History({ entity, id }: { entity: Entity; id: number }) {
  const { data, isError } = useEvents(entity, id);
  const [all, setAll] = useState(false);
  const groups = groupEvents(data ?? []);
  const shown = all ? groups : groups.slice(0, FIRST);

  return (
    <section aria-label="История" className="border-line border-t pt-4">
      <h2 className="mb-3 font-semibold text-sm">История</h2>
      {isError && <p className="text-muted-foreground text-sm">Не удалось загрузить историю</p>}
      <ol className="space-y-3">
        {shown.map((group) => {
          const actor = ACTOR[group.actor];
          return (
            <li key={group.events[0]?.id} className="flex gap-2.5 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full font-semibold text-xs',
                  actor.tone,
                )}
              >
                {actor.mark}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-muted-foreground">
                  <span className="text-foreground">{actor.name}</span>
                  <time
                    dateTime={group.at}
                    title={new Date(group.at).toLocaleString('ru-RU')}
                    className="ml-2 text-xs"
                  >
                    {relativeTime(group.at)}
                  </time>
                </p>
                {group.events.map((event) => (
                  <ChangeLine key={event.id} event={event} />
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      {groups.length > shown.length && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 font-normal text-muted-foreground"
          onClick={() => setAll(true)}
        >
          Показать все ({groups.length})
        </Button>
      )}
    </section>
  );
}

function ChangeLine({ event }: { event: OrbitEvent }) {
  const { label, from, to } = describeEvent(event);
  if (to === undefined) return <p className="text-muted-foreground">{label}</p>;
  return (
    <p className="text-muted-foreground [overflow-wrap:anywhere]">
      {label}: <span className="line-through decoration-faint/60">{from}</span>
      <span className="sr-only"> стало </span>
      <span aria-hidden="true"> → </span>
      <span className="text-foreground">{to}</span>
    </p>
  );
}

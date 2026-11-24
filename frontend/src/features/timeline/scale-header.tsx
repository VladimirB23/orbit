/** Header of the timeline: zoom, today, legend and the time scale itself. */
import { CircleQuestionMark, LocateFixed, ZoomIn, ZoomOut } from 'lucide-react';
import type { RefObject } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type Day, formatDate } from '@/lib/dates';
import { type Scale, type Tick, ticks, ZOOMS, type Zoom } from '@/lib/timeline';
import { cn } from '@/lib/utils';

const ZOOM_LABEL: Record<Zoom, string> = { days: 'Дни', weeks: 'Недели', months: 'Месяцы' };

interface Props {
  names: RefObject<HTMLDivElement | null>;
  scale: Scale;
  zoom: Zoom;
  today: Day;
  onZoom: (zoom: Zoom) => void;
  onToday: () => void;
  onPan: (event: React.PointerEvent<HTMLElement>) => void;
}

const iconButton =
  'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40';

export function ScaleHeader({ names, scale, zoom, today, onZoom, onToday, onPan }: Props) {
  const { major, minor } = ticks(scale, zoom);
  const index = ZOOMS.indexOf(zoom);
  const step = (by: number) => {
    const next = ZOOMS[index + by];
    if (next) onZoom(next);
  };

  return (
    <div
      role="row"
      className="sticky top-0 z-25 flex h-12 border-border border-b bg-background text-muted-foreground text-xs"
    >
      <div
        ref={names}
        role="columnheader"
        aria-label="Название и срок"
        className="sticky left-0 z-26 flex w-(--names) flex-none items-center gap-1 border-border border-r bg-background px-2"
      >
        <fieldset className="zoom-wide flex overflow-hidden rounded-lg border border-border bg-card">
          <legend className="sr-only">Масштаб</legend>
          {ZOOMS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === zoom}
              onClick={() => onZoom(value)}
              className={cn(
                'h-7 px-2.5 text-sm hover:text-foreground',
                value === zoom && 'bg-selected font-medium text-foreground',
              )}
            >
              {ZOOM_LABEL[value]}
            </button>
          ))}
        </fieldset>
        <span className="zoom-narrow">
          <button
            type="button"
            aria-label="Мельче"
            disabled={index === ZOOMS.length - 1}
            onClick={() => step(1)}
            className={iconButton}
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Крупнее"
            disabled={index === 0}
            onClick={() => step(-1)}
            className={iconButton}
          >
            <ZoomIn className="size-4" />
          </button>
        </span>
        <button
          type="button"
          aria-label="К сегодняшнему дню"
          title="К сегодняшнему дню (T)"
          onClick={onToday}
          className={iconButton}
        >
          <LocateFixed className="size-4" />
        </button>
        <Legend />
      </div>
      <div
        role="columnheader"
        aria-label="Время"
        onPointerDown={onPan}
        className="relative flex-none cursor-grab active:cursor-grabbing"
        style={{ width: scale.width }}
      >
        {major.map((tick, i) => (
          <MajorTick key={tick.day} tick={tick} to={major[i + 1]?.x ?? scale.width} />
        ))}
        {minor.map((tick) => (
          <MinorTick key={tick.day} tick={tick} zoom={zoom} width={scale.px} today={today} />
        ))}
        <span
          className="pointer-events-none absolute bottom-0 z-1 -translate-x-1/2 rounded-t-md bg-foreground px-1.5 text-background leading-5"
          style={{ left: scale.x(today) + scale.px / 2 }}
          title={formatDate(today)}
        >
          {zoom === 'days' ? new Date(`${today}T00:00`).getDate() : 'сегодня'}
        </span>
      </div>
    </div>
  );
}

function MajorTick({ tick, to }: { tick: Tick; to: number }) {
  return (
    <span
      className="absolute top-1 overflow-clip border-border border-l font-semibold text-foreground"
      style={{ left: tick.x, width: to - tick.x }}
    >
      <span className="sticky left-[calc(var(--names)+0.4rem)] whitespace-nowrap px-1.5 leading-5">
        {tick.label}
      </span>
    </span>
  );
}

function MinorTick(props: { tick: Tick; zoom: Zoom; width: number; today: Day }) {
  const { tick, zoom, width } = props;
  return (
    <span
      className={cn(
        'absolute bottom-0 whitespace-nowrap leading-5',
        zoom === 'days' ? 'text-center' : 'pl-1.5',
        tick.off && 'text-faint',
      )}
      style={{ left: tick.x, width: zoom === 'days' ? width : undefined }}
    >
      {tick.label}
    </span>
  );
}

const SAMPLE = 'h-4 w-9 shrink-0 rounded-[5px] border border-l-[3px]';

const SIGNS: [React.ReactNode, string][] = [
  [
    <span
      key="run"
      className={cn(SAMPLE, 'relative overflow-clip border-sun/60 border-l-sun bg-sun-wash')}
    >
      <span className="absolute bottom-0 left-0 h-[3px] w-3/5 bg-sun" />
    </span>,
    'Полоса идет от старта до срока, линия внизу: сколько сделано. Линия левее черты «сегодня»: отстаем',
  ],
  [
    <span
      key="plan"
      className={cn(SAMPLE, 'border-planned/50 border-l-planned bg-planned-wash')}
    />,
    'Цвет показывает статус, значок внутри тоже',
  ],
  [
    <span key="late" className="bar-late h-2.5 w-9 shrink-0 rounded-r-md" />,
    'Дни после пропущенного срока',
  ],
  [
    <span
      key="open"
      className={cn(SAMPLE, 'bar-open border-sun/60 border-r-0 border-l-sun bg-sun-wash')}
    />,
    'Срока нет, работа идет до сегодня и дальше',
  ],
  [
    <span
      key="point"
      className="mx-3 size-3 shrink-0 rotate-45 rounded-[3px] border-2 border-planned bg-planned-wash"
    />,
    'Известен только срок. Закрашен: закрыто, а старт неизвестен',
  ],
  [
    <span key="delta" className="w-9 shrink-0 text-center font-medium text-danger text-xs">
      +2 дня
    </span>,
    'Закрыто позже срока; с минусом раньше. Черта рядом: сам срок',
  ],
  [
    <span key="due" className="mx-3.5 size-2 shrink-0 rotate-45 rounded-[2px] bg-foreground" />,
    'Срок всего проекта; пунктир внутри проекта: тот же срок',
  ],
];

function Legend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Как читать" title="Как читать" className={iconButton}>
          <CircleQuestionMark className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label="Как читать" className="w-96 max-w-[90vw] p-4">
        <ul className="space-y-2.5 text-sm">
          {SIGNS.map(([sample, text]) => (
            <li key={text} className="flex items-center gap-3">
              {sample}
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-line border-t pt-3 text-muted-foreground text-sm">
          Старт без даты берется из журнала: когда пункт впервые взяли в работу. Полосу и ее края
          можно тянуть, по пустой строке можно провести. Esc отменяет. Масштаб: Ctrl + колесо.
        </p>
      </PopoverContent>
    </Popover>
  );
}

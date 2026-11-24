/** Changing dates by mouse and by keyboard: shown at once, saved when the move is over. */
import { type RefObject, useEffect, useRef, useState } from 'react';
import type { Day } from '@/lib/dates';
import {
  type DateChanges,
  dragDates,
  type Grip,
  type Scale,
  type Span,
  schedule,
  shiftDates,
  withDates,
} from '@/lib/timeline';
import type { NodeKey, TreeItem } from '@/lib/tree';

/** Closer than this it is a click. */
const CLICK_PX = 4;
/** A series of key presses is one change in the journal. */
const KEYS_MS = 500;
/** Near the edge of the screen the scale moves by itself. */
const EDGE_PX = 48;

export interface Move {
  item: TreeItem;
  grip: Grip;
  changes: DateChanges | null;
  /** Where the pointer is; none for the keyboard. */
  at: { x: number; y: number } | null;
}

interface Options {
  scroller: RefObject<HTMLElement | null>;
  names: RefObject<HTMLElement | null>;
  scale: Scale;
  today: Day;
  save: (item: TreeItem, changes: DateChanges) => Promise<boolean>;
}

type Start = React.PointerEvent<HTMLElement>;

export function useSchedule({ scroller, names, scale, today, save }: Options) {
  const [move, setMove] = useState<Move | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const dragged = useRef(false);
  const keys = useRef<{ move: Move; timer: ReturnType<typeof setTimeout> } | null>(null);

  async function commit(done: Move) {
    setMove(done.changes ? { ...done, at: null } : null);
    if (!done.changes) return;
    await save(done.item, done.changes);
    // Until now the preview hides the moment between the drop and the new data.
    setMove((current) => (current?.item.key === done.item.key && !current.at ? null : current));
  }

  function flushKeys() {
    const waiting = keys.current;
    if (!waiting) return;
    clearTimeout(waiting.timer);
    keys.current = null;
    void commit(waiting.move);
  }

  const last = useRef(flushKeys);
  last.current = flushKeys;
  useEffect(
    () => () => {
      cancel.current?.();
      last.current();
    },
    [],
  );

  /** One pointer gesture from press to release; Escape puts everything back. */
  function gesture(
    event: Start,
    onMove: (distance: number, at: { x: number; y: number }) => void,
    onEnd: (finished: boolean) => void,
  ) {
    const box = scroller.current;
    if (!box) return;
    const origin = event.clientX + box.scrollLeft;
    const at = { x: event.clientX, y: event.clientY };
    let started = false;
    let frame = 0;

    const update = () => onMove(at.x + box.scrollLeft - origin, at);
    const crawl = () => {
      const { left, right } = box.getBoundingClientRect();
      const from = left + (names.current?.offsetWidth ?? 0);
      const over = at.x > right - EDGE_PX ? at.x - right + EDGE_PX : Math.min(0, at.x - from);
      if (over !== 0) {
        box.scrollLeft += Math.sign(over) * Math.min(18, Math.abs(over) / 4 + 2);
        update();
      }
      frame = requestAnimationFrame(crawl);
    };
    const onPointer = (e: PointerEvent) => {
      at.x = e.clientX;
      at.y = e.clientY;
      if (!started && Math.abs(at.x + box.scrollLeft - origin) < CLICK_PX) return;
      if (!started) {
        started = true;
        dragged.current = true;
        frame = requestAnimationFrame(crawl);
      }
      update();
    };
    const finish = (finished: boolean, pressed = false) => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      cancel.current = null;
      onEnd(finished && started);
      // The click that follows a drag must not open the panel. After Escape the button
      // is still down: the click comes only when it is released.
      const forget = () =>
        setTimeout(() => {
          dragged.current = false;
        });
      if (pressed) window.addEventListener('pointerup', forget, { once: true });
      else forget();
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      finish(false, true);
    };
    window.addEventListener('pointermove', onPointer);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    cancel.current = onCancel;
  }

  /** Only the main button of a mouse or a pen: a finger scrolls. */
  const usable = (event: Start) =>
    event.button === 0 && event.pointerType !== 'touch' && !cancel.current;

  function drag(event: Start, item: TreeItem, span: Span, grip: Exclude<Grip, 'draw'>) {
    if (!usable(event)) return;
    event.stopPropagation();
    flushKeys();
    event.currentTarget.setPointerCapture(event.pointerId);
    let changes: DateChanges | null = null;
    gesture(
      event,
      (distance, at) => {
        changes = dragDates(item, span, grip, Math.round(distance / scale.px));
        setMove({ item, grip, changes, at: { ...at } });
      },
      (finished) => {
        if (finished) void commit({ item, grip, changes, at: null });
        else setMove(null);
      },
    );
  }

  /** A range of days on an empty row. `x` is inside the track. */
  function draw(event: Start, item: TreeItem, x: number) {
    if (!usable(event)) return;
    event.preventDefault(); // no text selection
    flushKeys();
    const first = scale.day(x);
    let changes: DateChanges | null = null;
    gesture(
      event,
      (distance, at) => {
        changes = schedule(first, scale.day(x + distance));
        setMove({ item, grip: 'draw', changes, at: { ...at } });
      },
      (finished) => {
        if (finished) void commit({ item, grip: 'draw', changes, at: null });
        else setMove(null);
      },
    );
  }

  /** Grab the empty time and pull it. */
  function pan(event: Start) {
    const box = scroller.current;
    if (!box || !usable(event)) return;
    event.preventDefault();
    const from = { x: event.clientX, scroll: box.scrollLeft };
    const onPointer = (e: PointerEvent) => {
      box.scrollLeft = from.scroll - (e.clientX - from.x);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onPointer);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function nudge(item: TreeItem, grip: 'move' | 'end', days: number) {
    if (keys.current && keys.current.move.item.key !== item.key) flushKeys();
    const before = keys.current?.move.changes ?? null;
    const next = shiftDates(withDates(item, before), today, grip, days);
    if (!next) return;
    const merged = { ...before, ...next };
    const same =
      (merged.start_date ?? item.startDate) === item.startDate &&
      (merged.due_date ?? item.dueDate) === item.dueDate;
    const shown: Move = { item, grip, changes: same ? null : merged, at: null };
    if (keys.current) clearTimeout(keys.current.timer);
    keys.current = { move: shown, timer: setTimeout(flushKeys, KEYS_MS) };
    setMove(shown);
  }

  const changesOf = (key: NodeKey): DateChanges | null =>
    move?.item.key === key ? move.changes : null;

  return { move, changesOf, drag, draw, pan, nudge, justDragged: () => dragged.current };
}

export type Schedule = ReturnType<typeof useSchedule>;

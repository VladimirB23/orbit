/**
 * One hint for all marks of the screen: any element with data-tip shows it under the pointer.
 * It only repeats what is in the text for screen readers, so it is hidden from them.
 */
import { useEffect, useRef, useState } from 'react';

interface Shown {
  text: string;
  x: number;
  y: number;
}

export function TipArea({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [shown, setShown] = useState<Shown | null>(null);
  const tip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shown || !tip.current) return;
    // Never over the edge of the window.
    const { offsetWidth, offsetHeight } = tip.current;
    const x = Math.min(shown.x + 12, window.innerWidth - offsetWidth - 8);
    const below = shown.y + 16;
    const y = below + offsetHeight > window.innerHeight ? shown.y - offsetHeight - 8 : below;
    tip.current.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
  }, [shown]);

  return (
    <div
      className={className}
      onPointerMove={(event) => {
        const mark = (event.target as Element).closest<HTMLElement>('[data-tip]');
        const text = mark?.dataset.tip;
        setShown(text ? { text, x: event.clientX, y: event.clientY } : null);
      }}
      onPointerLeave={() => setShown(null)}
    >
      {children}
      {shown && (
        <div
          ref={tip}
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 z-50 max-w-72 whitespace-pre-line rounded-md bg-foreground px-2.5 py-1.5 text-background text-sm"
        >
          {shown.text}
        </div>
      )}
    </div>
  );
}

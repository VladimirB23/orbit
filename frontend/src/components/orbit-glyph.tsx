/**
 * The signature mark: status as a small orbit. Shape carries the meaning, color only helps,
 * so statuses differ without color too. Projects show progress as the arc a planet has flown.
 */
import type { Status } from '@/api/types';
import { cn } from '@/lib/utils';

const COLOR: Record<Status, string> = {
  backlog: 'text-idle',
  planned: 'text-planned',
  in_progress: 'text-sun',
  paused: 'text-idle',
  blocked: 'text-blocked',
  done: 'text-done',
  canceled: 'text-idle',
};

const R = 6.25;
const FULL = 2 * Math.PI * R;

function pointOn(fraction: number) {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return { cx: 8 + R * Math.cos(angle), cy: 8 + R * Math.sin(angle) };
}

function Arc({ fraction }: { fraction: number }) {
  return (
    <>
      <circle cx="8" cy="8" r={R} className="stroke-input" strokeWidth="1.5" />
      <circle
        cx="8"
        cy="8"
        r={R}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray={`${FULL * fraction} ${FULL}`}
        transform="rotate(-90 8 8)"
      />
      <circle {...pointOn(fraction)} r="2.4" fill="currentColor" />
    </>
  );
}

const ring = <circle cx="8" cy="8" r={R} stroke="currentColor" strokeWidth="1.5" />;

const SHAPE: Record<Status, React.ReactNode> = {
  backlog: (
    <circle cx="8" cy="8" r={R} stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2.35" />
  ),
  planned: ring,
  in_progress: <Arc fraction={0.35} />,
  paused: (
    <>
      {ring}
      <path
        d="M6.4 5.8v4.4M9.6 5.8v4.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  ),
  blocked: (
    <>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M5 8h6" className="stroke-card" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  done: (
    <>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="m5 8.2 2.1 2.1L11 6.2"
        className="stroke-card"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  canceled: (
    <>
      {ring}
      <path d="m6 6 4 4m0-4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
};

interface Props {
  status: Status;
  /** Draw the real progress instead of the in-progress symbol. */
  progress?: number;
  className?: string;
}

export function OrbitGlyph({ status, progress, className }: Props) {
  const arc = progress !== undefined && status === 'in_progress';
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn('size-4 shrink-0 overflow-visible', COLOR[status], className)}
    >
      {arc ? <Arc fraction={Math.min(Math.max(progress, 0), 0.999)} /> : SHAPE[status]}
    </svg>
  );
}

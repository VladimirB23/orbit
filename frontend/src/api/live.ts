/** Live updates: the server says "changed", the interface re-reads what it shows. */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { refreshData } from './queries';

export type LiveState = 'connecting' | 'live' | 'offline';

export function useLiveUpdates(): LiveState {
  const qc = useQueryClient();
  const [state, setState] = useState<LiveState>('connecting');

  useEffect(() => {
    let source: EventSource;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      source = new EventSource('/api/v1/stream');
      source.addEventListener('open', () => setState('live'));
      // Sent on every (re)connection too, so nothing is missed while offline.
      source.addEventListener('change', () => refreshData(qc));
      source.addEventListener('error', () => {
        setState('offline');
        // The browser retries by itself unless the server answered with an error code.
        if (source.readyState === EventSource.CLOSED) retry = setTimeout(connect, 2000);
      });
    };
    connect();
    return () => {
      clearTimeout(retry);
      source.close();
    };
  }, [qc]);

  return state;
}

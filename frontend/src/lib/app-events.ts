/** Wishes of the frame (header, palette) that the current screen fulfils. */
import { useEffect } from 'react';
import type { NodeKey } from './tree';

const NEW_PROJECT = 'orbit:new-project';
const REVEAL = 'orbit:reveal';

export const emitNewProject = () => window.dispatchEvent(new Event(NEW_PROJECT));
export const emitReveal = (key: NodeKey) =>
  window.dispatchEvent(new CustomEvent(REVEAL, { detail: key }));

export function useAppEvents(on: { newProject: () => void; reveal: (key: NodeKey) => void }) {
  useEffect(() => {
    const onReveal = (event: Event) => on.reveal((event as CustomEvent<NodeKey>).detail);
    window.addEventListener(NEW_PROJECT, on.newProject);
    window.addEventListener(REVEAL, onReveal);
    return () => {
      window.removeEventListener(NEW_PROJECT, on.newProject);
      window.removeEventListener(REVEAL, onReveal);
    };
  });
}

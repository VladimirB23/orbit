/** Rows changed by somebody else (Claude in a terminal) light up for a moment. */
import { useEffect, useRef, useState } from 'react';
import { isOwn } from '@/api/own-edits';
import { ancestorsOf, type NodeKey, type Row, type TreeItem, walk } from '@/lib/tree';

const FLASH_MS = 2400;

export function useFlash(items: TreeItem[] | undefined): (row: Row) => boolean {
  const seen = useRef<Map<NodeKey, string> | null>(null);
  const [changed, setChanged] = useState<ReadonlySet<NodeKey>>(new Set());
  const [above, setAbove] = useState<ReadonlySet<NodeKey>>(new Set());

  useEffect(() => {
    if (!items) return;
    const now = new Map<NodeKey, string>();
    for (const item of walk(items)) now.set(item.key, item.updatedAt);
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    const news = [...now.keys()].filter((key) => before.get(key) !== now.get(key) && !isOwn(key));
    if (news.length === 0) return;
    setChanged(new Set(news));
    setAbove(new Set(news.flatMap((key) => ancestorsOf(items, key))));
    const timer = setTimeout(() => {
      setChanged(new Set());
      setAbove(new Set());
    }, FLASH_MS);
    return () => clearTimeout(timer);
  }, [items]);

  // A change inside a folded branch lights up the branch.
  return ({ item, open }) => changed.has(item.key) || (!open && above.has(item.key));
}

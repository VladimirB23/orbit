import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AppShell } from '@/components/app/app-shell';
import { TreePage } from '@/features/tree/tree-page';
import { parseTreeSearch } from '@/lib/search';

export type { TreeSearch } from '@/lib/search';

// A new screen (timeline, analytics, planner) is one more route here.
const root = createRootRoute({ component: AppShell });

const treeRoute = createRoute({
  getParentRoute: () => root,
  path: '/',
  component: TreePage,
  validateSearch: parseTreeSearch,
});

export const router = createRouter({
  routeTree: root.addChildren([treeRoute]),
  defaultNotFoundComponent: () => <p className="p-6">Такой страницы нет.</p>,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

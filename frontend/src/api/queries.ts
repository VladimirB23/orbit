/** Everything the interface reads and writes. Components never call fetch themselves. */
import {
  keepPreviousData,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { client, unwrap } from './client';
import { markOwn } from './own-edits';
import { type Changes, patchTree } from './patch';
import type { Entity, MilestonePatch, ProjectCreate, ProjectPatch, TaskPatch, Tree } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    // The change feed says when data is stale; a focus refetch covers a lost connection.
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: 'always' },
    mutations: { retry: false, networkMode: 'always' },
  },
});

export const keys = {
  tree: ['tree'] as const,
  events: ['events'] as const,
  meta: ['meta'] as const,
};

export function refreshData(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.tree });
  void qc.invalidateQueries({ queryKey: keys.events });
}

// --- reading -----------------------------------------------------------------

export function useTree(archived: boolean) {
  return useQuery({
    queryKey: [...keys.tree, { archived }],
    queryFn: () => unwrap(client.GET('/api/v1/tree', { params: { query: { archived } } })),
    placeholderData: keepPreviousData,
  });
}

export function useMeta() {
  return useQuery({
    queryKey: keys.meta,
    queryFn: () => unwrap(client.GET('/api/v1/meta')),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
}

export function useEvents(entity: Entity, id: number) {
  return useQuery({
    queryKey: [...keys.events, entity, id],
    queryFn: () =>
      unwrap(client.GET('/api/v1/events', { params: { query: { entity, id, limit: 200 } } })),
  });
}

// --- writing -----------------------------------------------------------------

export interface Target {
  entity: Entity;
  id: number;
  /** Projects are addressed by slug, the rest by id. */
  slug: string;
}

export interface SaveInput {
  target: Target;
  changes: Changes;
  force?: boolean;
}

function save({ target, changes, force = false }: SaveInput): Promise<unknown> {
  const query = { force };
  if (target.entity === 'project') {
    return unwrap(
      client.PATCH('/api/v1/projects/{slug}', {
        params: { path: { slug: target.slug }, query },
        body: changes as ProjectPatch,
      }),
    );
  }
  if (target.entity === 'milestone') {
    return unwrap(
      client.PATCH('/api/v1/milestones/{milestone_id}', {
        params: { path: { milestone_id: target.id }, query },
        body: changes as MilestonePatch,
      }),
    );
  }
  return unwrap(
    client.PATCH('/api/v1/tasks/{task_id}', {
      params: { path: { task_id: target.id }, query },
      body: changes as TaskPatch,
    }),
  );
}

export function useSaveMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: save,
    onMutate: async ({ target, changes }) => {
      markOwn(target.entity, target.id);
      await qc.cancelQueries({ queryKey: keys.tree });
      const before = qc.getQueriesData<Tree>({ queryKey: keys.tree });
      qc.setQueriesData<Tree>({ queryKey: keys.tree }, (tree) =>
        tree ? patchTree(tree, target.entity, target.id, changes) : tree,
      );
      return { before };
    },
    onError: (_error, _input, context) => {
      for (const [key, tree] of context?.before ?? []) qc.setQueryData(key, tree);
    },
    onSettled: () => refreshData(qc),
  });
}

export interface RemoveInput {
  target: Target;
  force?: boolean;
}

export function useRemoveMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ target, force = false }: RemoveInput): Promise<unknown> =>
      target.entity === 'milestone'
        ? unwrap(
            client.DELETE('/api/v1/milestones/{milestone_id}', {
              params: { path: { milestone_id: target.id }, query: { force } },
            }),
          )
        : unwrap(
            client.DELETE('/api/v1/tasks/{task_id}', {
              params: { path: { task_id: target.id }, query: { force } },
            }),
          ),
    onSettled: () => refreshData(qc),
  });
}

export function useArchiveMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, archived }: { slug: string; archived: boolean }) =>
      archived
        ? unwrap(client.POST('/api/v1/projects/{slug}/archive', { params: { path: { slug } } }))
        : unwrap(client.POST('/api/v1/projects/{slug}/unarchive', { params: { path: { slug } } })),
    onSuccess: (project) => markOwn('project', project.id),
    onSettled: () => refreshData(qc),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectCreate) => unwrap(client.POST('/api/v1/projects', { body })),
    onSuccess: (project) => markOwn('project', project.id),
    onSettled: () => refreshData(qc),
  });
}

export interface AddInput {
  slug: string;
  kind: 'milestone' | 'task';
  title: string;
  milestoneId?: number | null;
  parentId?: number | null;
}

export function useAddMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, kind, title, milestoneId, parentId }: AddInput) => {
      const params = { path: { slug } };
      if (kind === 'milestone') {
        const row = await unwrap(
          client.POST('/api/v1/projects/{slug}/milestones', { params, body: { name: title } }),
        );
        return { entity: 'milestone' as const, id: row.id };
      }
      const row = await unwrap(
        client.POST('/api/v1/projects/{slug}/tasks', {
          params,
          body: { title, milestone_id: milestoneId ?? null, parent_id: parentId ?? null },
        }),
      );
      return { entity: 'task' as const, id: row.id };
    },
    onSuccess: ({ entity, id }) => markOwn(entity, id),
    // Wait for the new row to appear before the input is cleared.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.events });
      return qc.invalidateQueries({ queryKey: keys.tree });
    },
  });
}

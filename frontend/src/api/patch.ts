/** Optimistic edit: shows a change at once, before the server confirms it. */
import type { Entity, Status, TaskNode, Tree } from '@/api/types';
import { isClosed } from '@/lib/status';

export type Changes = Record<string, string | number | null>;

function flags<T extends { overdue: boolean; upcoming: boolean }>(node: T, changes: Changes): T {
  // Everything else (progress, deadlines) the server recalculates in the next moment.
  const closed = typeof changes.status === 'string' && isClosed(changes.status as Status);
  return closed ? { ...node, overdue: false, upcoming: false } : node;
}

function patchTasks(nodes: TaskNode[], id: number, changes: Changes): TaskNode[] {
  return nodes.map((node) =>
    node.task.id === id
      ? flags({ ...node, task: { ...node.task, ...changes } }, changes)
      : { ...node, children: patchTasks(node.children, id, changes) },
  );
}

export function patchTree(tree: Tree, entity: Entity, id: number, changes: Changes): Tree {
  return {
    ...tree,
    projects: tree.projects.map((p) => {
      if (entity === 'project') {
        return p.project.id === id
          ? flags({ ...p, project: { ...p.project, ...changes } }, changes)
          : p;
      }
      if (entity === 'milestone') {
        return {
          ...p,
          milestones: p.milestones.map((m) =>
            m.milestone.id === id
              ? flags({ ...m, milestone: { ...m.milestone, ...changes } }, changes)
              : m,
          ),
        };
      }
      return {
        ...p,
        tasks: patchTasks(p.tasks, id, changes),
        milestones: p.milestones.map((m) => ({ ...m, tasks: patchTasks(m.tasks, id, changes) })),
      };
    }),
  };
}

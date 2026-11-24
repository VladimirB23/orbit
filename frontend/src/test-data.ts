/** Builders for tests: only what a test cares about is spelled out. */
import type {
  MilestoneNode,
  MilestoneOut,
  ProjectNode,
  ProjectOut,
  Signals,
  TaskNode,
  TaskOut,
  Tree,
} from '@/api/types';

const AT = '2026-11-24T10:00:00Z';
const SIGNALS: Signals = { in_progress: 0, blocked: 0, overdue: 0, upcoming: 0 };
const dates = { start_date: null, due_date: null, done_at: null, created_at: AT, updated_at: AT };

type Flags = { overdue?: boolean; upcoming?: boolean };

export function task(
  id: number,
  {
    children = [],
    overdue = false,
    upcoming = false,
    ...row
  }: Partial<TaskOut> & Flags & { children?: TaskNode[] },
): TaskNode {
  for (const child of children) child.task.parent_id = id;
  return {
    task: {
      id,
      project_id: 0,
      milestone_id: null,
      parent_id: null,
      title: `Task ${id}`,
      status: 'backlog',
      priority: 0,
      comment: null,
      position: 0,
      ...dates,
      ...row,
    },
    overdue,
    upcoming,
    signals: SIGNALS,
    children,
  };
}

function adopt(nodes: TaskNode[], patch: Partial<TaskOut>) {
  for (const node of nodes) {
    Object.assign(node.task, patch);
    adopt(node.children, patch);
  }
}

export function milestone(
  id: number,
  {
    tasks = [],
    overdue = false,
    upcoming = false,
    ...row
  }: Partial<MilestoneOut> & Flags & { tasks?: TaskNode[] },
): MilestoneNode {
  adopt(tasks, { milestone_id: id });
  return {
    milestone: {
      id,
      project_id: 0,
      name: `Milestone ${id}`,
      status: 'planned',
      summary: null,
      position: 0,
      ...dates,
      ...row,
    },
    overdue,
    upcoming,
    progress: 0,
    signals: SIGNALS,
    tasks,
  };
}

export function project(
  id: number,
  {
    milestones = [],
    tasks = [],
    overdue = false,
    upcoming = false,
    ...row
  }: Partial<ProjectOut> & Flags & { milestones?: MilestoneNode[]; tasks?: TaskNode[] },
): ProjectNode {
  for (const m of milestones) {
    m.milestone.project_id = id;
    adopt(m.tasks, { project_id: id });
  }
  adopt(tasks, { project_id: id });
  return {
    project: {
      id,
      slug: `project-${id}`,
      name: `Project ${id}`,
      status: 'backlog',
      priority: 0,
      summary: null,
      obsidian_path: null,
      repo_path: null,
      github_url: null,
      position: 0,
      archived_at: null,
      ...dates,
      ...row,
    },
    overdue,
    upcoming,
    progress: 0,
    focus: null,
    signals: SIGNALS,
    milestones,
    tasks,
  };
}

export function tree(projects: ProjectNode[], today = '2026-11-24'): Tree {
  return { today, projects };
}

/** Builders for tests: only what a test cares about is spelled out. */
import type {
  Actual,
  Analytics,
  FocusRow,
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

const ACTUAL: Actual = { start: null, end: null };

type Flags = { overdue?: boolean; upcoming?: boolean; actual?: Actual };

export function task(
  id: number,
  {
    children = [],
    overdue = false,
    upcoming = false,
    actual = ACTUAL,
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
    actual,
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
    actual = ACTUAL,
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
    actual,
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
    actual = ACTUAL,
    future = false,
    ...row
  }: Partial<ProjectOut> &
    Flags & { future?: boolean; milestones?: MilestoneNode[]; tasks?: TaskNode[] },
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
    actual,
    progress: 0,
    focus: null,
    future,
    signals: SIGNALS,
    milestones,
    tasks,
  };
}

export function tree(projects: ProjectNode[], today = '2026-11-24'): Tree {
  return { today, projects };
}

export function focusRow(row: Partial<FocusRow>): FocusRow {
  return {
    id: 1,
    slug: 'a',
    name: 'A',
    status: 'in_progress',
    priority: 0,
    archived: false,
    future: false,
    sessions: 0,
    prompts: 0,
    commits: 0,
    closed: 0,
    sessions_share: 0,
    commits_share: 0,
    share: 0,
    expected: null,
    attention: 'unknown',
    last_day: null,
    done: 0,
    working: 0,
    stuck: 0,
    ahead: 0,
    ...row,
  };
}

export function analytics(data: Partial<Analytics>): Analytics {
  const zero = { value: 0, before: null };
  return {
    today: '2026-11-25',
    start: '2026-10-27',
    end: '2026-11-25',
    step: 'week',
    steps: [],
    totals: { sessions: zero, commits: zero, closed: zero, prompts: 0, born_closed: 0 },
    focus: [],
    activity: [],
    closed: [],
    born_closed: [],
    cycle: {
      items: [],
      median: null,
      p85: null,
      needed: 10,
      known: 0,
      no_start: 0,
      born_closed: 0,
    },
    plan: {
      items: [],
      needed: 3,
      compared: 0,
      late: 0,
      automatic: 0,
      no_due: 0,
      set_after: 0,
      born_closed: 0,
    },
    deadlines: [],
    ...data,
  };
}

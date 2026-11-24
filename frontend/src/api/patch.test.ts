import { describe, expect, it } from 'vitest';
import { milestone, project, task, tree } from '@/test-data';
import { patchTree } from './patch';

const sample = tree([
  project(1, {
    milestones: [milestone(1, { tasks: [task(1, { children: [task(2, {})] })] })],
    tasks: [task(3, {})],
  }),
]);

describe('patchTree', () => {
  it('changes a project, a milestone and a task on any depth', () => {
    expect(patchTree(sample, 'project', 1, { name: 'New' }).projects[0]?.project.name).toBe('New');
    const m = patchTree(sample, 'milestone', 1, { status: 'done' }).projects[0]?.milestones[0];
    expect(m?.milestone.status).toBe('done');
    const deep = patchTree(sample, 'task', 2, { comment: 'hi' }).projects[0]?.milestones[0];
    expect(deep?.tasks[0]?.children[0]?.task.comment).toBe('hi');
    expect(patchTree(sample, 'task', 3, { title: 'T' }).projects[0]?.tasks[0]?.task.title).toBe(
      'T',
    );
  });

  it('leaves the original untouched so a failed save can roll back', () => {
    const before = structuredClone(sample);
    patchTree(sample, 'task', 2, { comment: 'hi' });
    expect(sample).toEqual(before);
  });

  it('drops the overdue and upcoming marks of a row that gets closed', () => {
    const late = tree([project(1, { tasks: [task(1, { overdue: true, upcoming: true })] })]);
    const [node] = patchTree(late, 'task', 1, { status: 'done' }).projects[0]?.tasks ?? [];
    expect(node).toMatchObject({ overdue: false, upcoming: false });
  });
});

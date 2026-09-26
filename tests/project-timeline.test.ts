import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTimelineStart, mondayOf, shiftTimeline, timelineWindow, weeklyDue } from '../lib/project-timeline.ts';
import type { State } from '../lib/crm.ts';

const task = (over: Partial<State['delivery'][number]>): State['delivery'][number] => ({
  id: over.id || 't', demo: false, projectId: 'p', lineIndex: 0, title: 'T', done: false,
  status: 'Por hacer', assignee: '', startDate: '', dueDate: '', ...over,
});

test('timeline window starts on a Monday before today and shifts by half a window', () => {
  assert.equal(mondayOf('2026-09-26'), '2026-09-21');
  const start = defaultTimelineStart('2026-09-26', 'quarter');
  assert.equal(start, '2026-08-24');
  const view = timelineWindow(start, 'quarter');
  assert.equal(view.weeks.length, 13);
  assert.equal(view.months[0].date, start);
  assert.ok(view.months.some(month => month.date === '2026-09-01'));
  assert.equal(shiftTimeline(start, 'quarter', 1), '2026-10-05');
});

test('timeline bars clip to the window and flag tasks outside it', () => {
  const view = timelineWindow('2026-09-21', 'month');
  const inside = view.bar(task({ startDate: '2026-09-21', dueDate: '2026-09-27' }));
  assert.equal(inside.kind, 'bar');
  if (inside.kind === 'bar') { assert.equal(inside.left, 0); assert.ok(Math.abs(inside.width - 100 / 6) < 1e-9); }
  const clipped = view.bar(task({ startDate: '2026-09-01', dueDate: '2026-09-23' }));
  assert.ok(clipped.kind === 'bar' && clipped.clippedStart && !clipped.clippedEnd);
  assert.deepEqual(view.bar(task({ dueDate: '2026-08-01' })), { kind: 'before', target: '2026-08-01' });
  assert.equal(view.bar(task({ startDate: '2026-12-01' })).kind, 'after');
  assert.equal(view.bar(task({})).kind, 'undated');
});

test('weekly due groups tasks by week and counts overdue open tasks', () => {
  const tasks = [
    task({ id: 'a', dueDate: '2026-09-10' }),
    task({ id: 'b', dueDate: '2026-09-10', status: 'Hecho', done: true }),
    task({ id: 'c', dueDate: '2026-09-22' }),
    task({ id: 'd', dueDate: '2026-09-24', status: 'Hecho', done: true }),
    task({ id: 'e', dueDate: '2026-10-01' }),
  ];
  const { overdue, buckets } = weeklyDue(tasks, '2026-09-26', 3);
  assert.equal(overdue, 1);
  assert.deepEqual(buckets.map(b => [b.start, b.open, b.done]), [['2026-09-21', 1, 1], ['2026-09-28', 1, 0], ['2026-10-05', 0, 0]]);
});

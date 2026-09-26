import type { State } from './crm.ts';

type Task = State['delivery'][number];
export type TimelineZoom = 'month' | 'quarter';

const DAY = 86400000;
const WEEKS: Record<TimelineZoom, number> = { month: 6, quarter: 13 };
const LEAD_WEEKS: Record<TimelineZoom, number> = { month: 1, quarter: 4 };

const stamp = (date: string) => Date.parse(`${date}T12:00:00Z`);
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

export function addDays(date: string, days: number) { return iso(stamp(date) + days * DAY); }

export function mondayOf(date: string) {
  const weekday = (new Date(stamp(date)).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

export function defaultTimelineStart(today: string, zoom: TimelineZoom) {
  return addDays(mondayOf(today), -7 * LEAD_WEEKS[zoom]);
}

/** Window start that shows `date` near the same offset as today does by default. */
export function timelineStartFor(date: string, zoom: TimelineZoom) { return defaultTimelineStart(date, zoom); }

export function shiftTimeline(start: string, zoom: TimelineZoom, direction: 1 | -1) {
  return addDays(start, direction * 7 * Math.max(1, Math.floor(WEEKS[zoom] / 2)));
}

export type TimelineBar =
  | { kind: 'bar'; left: number; width: number; clippedStart: boolean; clippedEnd: boolean }
  | { kind: 'before' | 'after'; target: string }
  | { kind: 'undated' };

export function timelineWindow(start: string, zoom: TimelineZoom) {
  const days = WEEKS[zoom] * 7;
  const from = stamp(start);
  const end = addDays(start, days);
  const position = (date: string) => (stamp(date) - from) / (days * DAY) * 100;
  const weeks = Array.from({ length: WEEKS[zoom] }, (_, index) => {
    const date = addDays(start, index * 7);
    return { date, left: index / WEEKS[zoom] * 100, day: Number(date.slice(8, 10)) };
  });
  const months: { date: string; left: number }[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(start, offset);
    if (offset === 0 || date.endsWith('-01')) months.push({ date, left: offset / days * 100 });
  }
  function bar(task: Pick<Task, 'startDate' | 'dueDate'>): TimelineBar {
    const first = task.startDate || task.dueDate;
    const last = task.dueDate || task.startDate;
    if (!first || !last) return { kind: 'undated' };
    const [a, b] = first <= last ? [first, last] : [last, first];
    if (b < start) return { kind: 'before', target: a };
    if (a >= end) return { kind: 'after', target: a };
    const left = Math.max(0, position(a));
    const right = Math.min(100, position(addDays(b, 1)));
    return { kind: 'bar', left, width: Math.max(right - left, 100 / days), clippedStart: a < start, clippedEnd: b >= end };
  }
  return { start, end, days, weeks, months, position, bar };
}

export function statusCounts(tasks: Task[], statuses: readonly string[]) {
  return statuses.map(status => ({ status, count: tasks.filter(task => task.status === status).length }));
}

export function weeklyDue(tasks: Task[], today: string, weeks = 8) {
  const first = mondayOf(today);
  const overdue = tasks.filter(task => task.dueDate && task.dueDate < first && task.status !== 'Hecho').length;
  const buckets = Array.from({ length: weeks }, (_, index) => {
    const start = addDays(first, index * 7);
    const end = addDays(start, 7);
    const due = tasks.filter(task => task.dueDate && task.dueDate >= start && task.dueDate < end);
    return { start, done: due.filter(task => task.status === 'Hecho').length, open: due.filter(task => task.status !== 'Hecho').length };
  });
  return { overdue, buckets };
}

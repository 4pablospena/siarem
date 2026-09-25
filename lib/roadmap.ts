import type { State } from './crm.ts';

const day = 86400000;
export const dayStamp = (value: string) => Date.parse(`${value}T12:00:00Z`);

export function roadmapScale(tasks: State['delivery']) {
  const dates = tasks.flatMap(task => [task.startDate, task.dueDate]).filter(Boolean).map(dayStamp).filter(Number.isFinite);
  if (!dates.length) return null;
  const start = dates.reduce((min, date) => Math.min(min, date)) - 7 * day;
  const end = dates.reduce((max, date) => Math.max(max, date)) + 15 * day;
  const span = end - start;
  const position = (date: string) => (dayStamp(date) - start) / span * 100;
  const duration = (from: string, to: string) => (dayStamp(to) - dayStamp(from) + day) / span * 100;
  const format = (date: number) => new Date(date).toISOString().slice(0, 10);
  const ticks = Array.from({ length: 5 }, (_, index) => ({ date: format(start + span * index / 4), left: index * 25 }));
  return { position, duration, ticks };
}

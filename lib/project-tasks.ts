import type { State } from './crm.ts';

export function matchesText(query: string, ...values: unknown[]) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return normalize(values.join(' ')).includes(normalize(query.trim()));
}

export function projectTasks(state: State, projectId: string, query = '', status = 'all') {
  return state.delivery.filter(task => task.projectId === projectId
    && matchesText(query, task.title, task.assignee, task.status, task.startDate, task.dueDate)
    && (status === 'all' || task.status === status));
}

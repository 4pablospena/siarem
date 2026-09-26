import { today, companyForOrder, ensureState, type State } from './crm.ts';
import { isOpenOpportunity } from './pipeline.ts';
import { stageName } from './pipeline-stages.ts';

export type AgendaKind = 'followup' | 'close' | 'interaction' | 'invoice' | 'task';

export type AgendaItem = {
  id: string;
  date: string;
  kind: AgendaKind;
  title: string;
  detail: string;
  companyId?: string;
  opportunityId?: string;
  invoiceId?: string;
  taskId?: string;
  projectId?: string;
};

function mondayOf(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function weekRange(anchor = today()) {
  const start = mondayOf(anchor);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  return { start: week[0], end: week[6], days: week };
}

/** Calendar items for a week (Mon–Sun). Empty kinds are omitted by the UI. */
export function agendaWeek(input: State, anchor = today()): { range: ReturnType<typeof weekRange>; items: AgendaItem[] } {
  const s = ensureState(input);
  const range = weekRange(anchor);
  const inWeek = (date: string) => date >= range.start && date <= range.end;
  const items: AgendaItem[] = [];

  for (const t of s.followups.filter(f => !f.done && inWeek(f.dueDate))) {
    const o = s.opportunities.find(x => x.id === t.opportunityId);
    items.push({
      id: `followup-${t.id}`,
      date: t.dueDate,
      kind: 'followup',
      title: t.title,
      detail: o?.title || 'Seguimiento',
      companyId: o?.companyId,
      opportunityId: t.opportunityId,
    });
  }

  for (const o of s.opportunities.filter(o => isOpenOpportunity(s, o)).filter(o => inWeek(o.closeDate))) {
    items.push({
      id: `close-${o.id}`,
      date: o.closeDate,
      kind: 'close',
      title: 'Cierre previsto · ' + o.title,
      detail: o.nextStep || stageName(s, o.stageId),
      companyId: o.companyId,
      opportunityId: o.id,
    });
  }

  for (const i of s.interactions.filter(x => inWeek(x.date))) {
    items.push({
      id: `interaction-${i.id}`,
      date: i.date,
      kind: 'interaction',
      title: i.kind,
      detail: i.notes.slice(0, 80),
      companyId: i.companyId,
      opportunityId: i.opportunityId || undefined,
    });
  }

  for (const inv of s.invoices.filter(x => !x.paid && inWeek(x.dueDate))) {
    items.push({
      id: `invoice-${inv.id}`,
      date: inv.dueDate,
      kind: 'invoice',
      title: 'Vence factura · ' + inv.title,
      detail: String(inv.amount),
      companyId: companyForOrder(s, inv.orderId),
      invoiceId: inv.id,
    });
  }

  for (const task of s.delivery.filter(t => !t.done && t.dueDate && inWeek(t.dueDate))) {
    const project = s.projects.find(p => p.id === task.projectId);
    items.push({
      id: `task-${task.id}`,
      date: task.dueDate,
      kind: 'task',
      title: task.title,
      detail: project?.title || 'Proyecto',
      taskId: task.id,
      projectId: task.projectId,
      companyId: project?.orderId ? companyForOrder(s, project.orderId) : undefined,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return { range, items };
}

export function agendaForDay(input: State, day: string) {
  return agendaWeek(input, day).items.filter(item => item.date === day);
}

/** Items due this week that are not already overdue (for Hoy). */
export function thisWeekAhead(input: State, now = today()) {
  const { items } = agendaWeek(input, now);
  return items.filter(item => item.date >= now);
}

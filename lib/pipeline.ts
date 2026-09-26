import { risk, type State } from './crm.ts';
import { matchesText } from './project-tasks.ts';

/** Pending follow-ups take precedence over the opportunity's general next step. */
export function pipelineNextAction(state: State, opportunity: State['opportunities'][number]) {
  if (opportunity.stage === 'Ganada' || opportunity.stage === 'Perdida') return null;
  const task = state.followups
    .filter(item => item.opportunityId === opportunity.id && !item.done)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return task
    ? { title: task.title, date: task.dueDate, taskId: task.id, defined: true }
    : { title: opportunity.nextStep || 'Definir siguiente paso', date: opportunity.nextDate, taskId: null, defined: !!opportunity.nextStep };
}

export function followupDraft(state: State, opportunity: State['opportunities'][number]) {
  const contact = state.companies.find(item => item.id === opportunity.companyId)?.contact;
  const next = pipelineNextAction(state, opportunity);
  const pending = next?.defined ? `Nos queda pendiente: ${next.title}.` : 'Me gustaría revisar contigo cómo avanzamos.';
  return `Hola${contact ? ', ' + contact : ''}:\n\nRetomo nuestra conversación sobre ${opportunity.title}. ${pending}\n\n¿Te encaja que lo revisemos esta semana?\n\nGracias.`;
}

export function isOpenOpportunity(opportunity: State['opportunities'][number]) {
  return opportunity.stage !== 'Ganada' && opportunity.stage !== 'Perdida';
}

/** Shared scope and ordering keep the work queue and its export consistent. */
export function pipelineOpportunities(state: State, options: { query?: string; company?: string; focus?: boolean; filter?: string } = {}) {
  const { query = '', company = 'all', focus = false, filter = 'all' } = options;
  const result = state.opportunities.filter(opportunity => {
    if (company !== 'all' && opportunity.companyId !== company) return false;
    const next = pipelineNextAction(state, opportunity);
    const name = state.companies.find(item => item.id === opportunity.companyId)?.name;
    if (!matchesText(query, opportunity.title, name, opportunity.stage, next?.title, next?.date)) return false;
    if (!focus) return true;
    if (!isOpenOpportunity(opportunity)) return false;
    const level = risk(state, opportunity).level;
    return filter === 'all' ? level > 0 : filter === 'healthy' ? level === 0 : String(level) === filter;
  });
  if (focus) result.sort((a, b) => risk(state, b).level - risk(state, a).level ||
    (pipelineNextAction(state, a)?.date || a.closeDate).localeCompare(pipelineNextAction(state, b)?.date || b.closeDate) || a.id.localeCompare(b.id));
  return result;
}

import { daysInStage, isLostStage, isOpenStage, isWonStage, risk, stageOf, type State } from './crm.ts';
import { matchesText } from './project-tasks.ts';
import { stageName } from './pipeline-stages.ts';

/** Pending follow-ups take precedence over the opportunity's general next step. */
export function pipelineNextAction(state: State, opportunity: State['opportunities'][number]) {
  if (!isOpenStage(state, opportunity.stageId)) return null;
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

export function isOpenOpportunity(state: State, opportunity: State['opportunities'][number]) {
  return isOpenStage(state, opportunity.stageId);
}

export function weeklyStageProgress(state: State, stageId: string, now = new Date()) {
  const stage = stageOf(state, stageId);
  if (!stage) return null;
  const weekStart = new Date(now);
  const day = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - day);
  weekStart.setUTCHours(0, 0, 0, 0);
  const startIso = weekStart.toISOString();
  const exits = state.opportunities.flatMap(opportunity =>
    (opportunity.stageHistory || [])
      .filter(entry => entry.fromStageId === stageId && entry.at >= startIso)
      .map(entry => ({ opportunity, entry }))
  );
  const count = exits.length;
  const amount = exits.reduce((sum, row) => sum + row.opportunity.amount, 0);
  return {
    count,
    amount,
    goalCount: stage.weeklyGoalCount,
    goalAmount: stage.weeklyGoalAmount,
  };
}

export type PipelineFilterOptions = {
  query?: string;
  company?: string;
  focus?: boolean;
  filter?: string;
  tagId?: string;
  ownerUserId?: string;
  minMrr?: number | null;
  overdueOnly?: boolean;
  mineUserId?: string;
};

/** Shared scope and ordering keep the work queue and its export consistent. */
export function pipelineOpportunities(state: State, options: PipelineFilterOptions = {}) {
  const {
    query = '',
    company = 'all',
    focus = false,
    filter = 'all',
    tagId = 'all',
    ownerUserId = 'all',
    minMrr = null,
    overdueOnly = false,
    mineUserId = '',
  } = options;
  const result = state.opportunities.filter(opportunity => {
    if (company !== 'all' && opportunity.companyId !== company) return false;
    if (tagId !== 'all' && !(opportunity.tagIds || []).includes(tagId)) return false;
    if (ownerUserId === 'unassigned' && opportunity.ownerUserId) return false;
    if (ownerUserId !== 'all' && ownerUserId !== 'unassigned' && opportunity.ownerUserId !== ownerUserId) return false;
    if (mineUserId && opportunity.ownerUserId !== mineUserId) return false;
    if (minMrr != null && (opportunity.mrr == null || opportunity.mrr < minMrr)) return false;
    const next = pipelineNextAction(state, opportunity);
    if (overdueOnly) {
      const overdueFollowup = state.followups.some(item => item.opportunityId === opportunity.id && !item.done && item.dueDate < new Date().toISOString().slice(0, 10));
      const overdueNext = !!(next?.date && next.date < new Date().toISOString().slice(0, 10));
      if (!overdueFollowup && !overdueNext) return false;
    }
    const name = state.companies.find(item => item.id === opportunity.companyId)?.name;
    const tags = (opportunity.tagIds || [])
      .map(id => state.opportunityTags.find(tag => tag.id === id)?.name)
      .filter(Boolean);
    if (!matchesText(query, opportunity.title, name, stageName(state, opportunity.stageId), next?.title, next?.date, ...tags)) return false;
    if (!focus) return true;
    if (!isOpenOpportunity(state, opportunity)) return false;
    const level = risk(state, opportunity).level;
    return filter === 'all' ? level > 0 : filter === 'healthy' ? level === 0 : String(level) === filter;
  });
  result.sort((a, b) => {
    if (a.stageId !== b.stageId) return a.stageId.localeCompare(b.stageId);
    return (a.rank || 0) - (b.rank || 0) || a.id.localeCompare(b.id);
  });
  if (focus) result.sort((a, b) => risk(state, b).level - risk(state, a).level ||
    (pipelineNextAction(state, a)?.date || a.closeDate).localeCompare(pipelineNextAction(state, b)?.date || b.closeDate) || a.id.localeCompare(b.id));
  return result;
}

export { daysInStage, isLostStage, isOpenStage, isWonStage, stageName };

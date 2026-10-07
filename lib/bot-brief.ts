import { eur, risk, today, type State } from './crm';
import { isOpenOpportunity, pipelineNextAction, pipelineOpportunities } from './pipeline';
import { stageName } from './pipeline-stages';
import { areaOf } from './areas';

export function botBrief(view: string, state: State) {
  const openLeads = state.leads.filter((lead) => lead.status !== 'Convertido' && lead.status !== 'Descartado');
  const openOpps = state.opportunities.filter(o => isOpenOpportunity(state, o));
  const urgent = pipelineOpportunities(state, { focus: true });
  const next = (item: State['opportunities'][number]) => {
    const action = pipelineNextAction(state, item);
    return action ? `siguiente acción ${action.title}${action.date ? ' (' + action.date + ')' : ''}` : '';
  };
  const unpaid = state.invoices.filter((invoice) => !invoice.paid);
  const area = areaOf(view)?.name || view;
  const lines = [
    `Área: ${area}`,
    `Pantalla: ${view}`,
    `Hoy: ${today()}`,
    openLeads.length
      ? `Leads por trabajar: ${openLeads.map((lead) => `${lead.name} (${lead.status}${lead.nextDate ? ', acción ' + lead.nextDate : ''})`).join('; ')}`
      : 'Leads por trabajar: ninguno',
    `Etapas del espacio: ${state.pipelineStages.filter(s => !s.archived).map(s => `${s.name}(${s.id})`).join(', ')}`,
    openOpps.length
      ? `Oportunidades abiertas: ${openOpps.map((item) => {
          const tags = (item.tagIds || []).map(id => state.opportunityTags.find(tag => tag.id === id)?.name).filter(Boolean).join(',');
          return `${item.title} id=${item.id} en ${stageName(state, item.stageId)} stageId=${item.stageId}, ${eur(item.amount)}${item.mrr != null ? `, MRR ${eur(item.mrr)}/mes` : ''}${tags ? `, tags=${tags}` : ''}, ${next(item)}`;
        }).join('; ')}`
      : 'Oportunidades abiertas: ninguna',
    urgent.length
      ? `Piden atención, por prioridad: ${urgent.map((item) => `${item.title}: ${risk(state, item).reason}`).join('; ')}`
      : 'Piden atención: ninguna',
    unpaid.length ? `Facturas sin cobrar: ${unpaid.map((invoice) => `${invoice.title} id=${invoice.id} ${eur(invoice.amount)} vence ${invoice.dueDate}`).join('; ')}` : 'Facturas sin cobrar: ninguna',
  ];
  return lines.join('\n').slice(0, 6000);
}


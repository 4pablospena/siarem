'use client';

import { ArrowUpRight, CheckCheck, Clock3 } from 'lucide-react';
import { eur, risk, today, type State } from '@/lib/crm';
import { pipelineNextAction } from '@/lib/pipeline';
import { stageName } from '@/lib/pipeline-stages';

export function FocusQueue({ state, opportunities, filtered, onOpen, onPipeline }: {
  state: State; opportunities: State['opportunities']; filtered: boolean;
  onOpen: (opportunity: State['opportunities'][number]) => void; onPipeline: () => void;
}) {
  if (!opportunities.length) return <div className="focus-empty">
    <CheckCheck size={28}/><h2>{filtered ? 'Sin oportunidades en esta selección' : 'No hay oportunidades que pidan atención'}</h2>
    <p>{filtered ? 'Prueba otra búsqueda o cambia los filtros.' : 'Puedes revisar las oportunidades abiertas en el Pipeline.'}</p>
    <button className="outline" onClick={onPipeline}>Ver Pipeline <ArrowUpRight size={14}/></button>
  </div>;
  return <div className="focus-queue">
    <div className="focus-caption"><span>Oportunidades abiertas · por prioridad y próxima acción</span><span>{opportunities.length} por revisar</span></div>
    <ul>{opportunities.map(opportunity => {
      const health = risk(state, opportunity);
      const next = pipelineNextAction(state, opportunity);
      const overdue = !!next?.date && next.date < today();
      return <li key={opportunity.id}>
        <button className="focus-record" onClick={() => onOpen(opportunity)} aria-label={'Revisar ' + opportunity.title}>
          <span className="focus-identity"><small>{state.companies.find(company => company.id === opportunity.companyId)?.name}</small><strong>{opportunity.title}</strong><span className="focus-stage">{stageName(state, opportunity.stageId)} · {eur(opportunity.amount)}</span></span>
          <span className="focus-next"><small>Siguiente acción</small><strong>{next?.title}</strong><span className={overdue ? 'red' : ''}><Clock3 size={12}/>{next?.date ? (overdue ? 'Vencida · ' : '') + new Intl.DateTimeFormat('es-ES', { day:'numeric', month:'short', timeZone:'UTC' }).format(new Date(next.date + 'T12:00:00Z')) : 'Sin fecha'}</span></span>
          <span className="focus-reason"><span className={'badge risk-' + health.level}><span className="status-dot"/>{health.label}</span><small>{health.reason}</small></span>
          <ArrowUpRight size={17} aria-hidden="true"/>
        </button>
      </li>;
    })}</ul>
  </div>;
}

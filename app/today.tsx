'use client';

import { ArrowRight, CheckCheck, Clock3 } from 'lucide-react';
import { FocusQueue } from './focus-queue';
import { companyForOrder, eur, type State } from '@/lib/crm';
import type { AgendaItem } from '@/lib/agenda';

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
}

const weekKind: Record<AgendaItem['kind'], string> = {
  followup: 'Seguimiento',
  close: 'Cierre',
  interaction: 'Interacción',
  invoice: 'Factura',
  task: 'Tarea',
  purchase: 'Gasto',
  contract: 'Contrato',
  recurring: 'Recurrente',
};

export function TodayView({
  state,
  opportunities,
  leads,
  invoices,
  weekItems = [],
  filtered,
  onOpenOpportunity,
  onOpenLead,
  onOpenInvoice,
  onOpenWeek,
  onPipeline,
  onLeads,
  onInvoices,
  onAgenda,
}: {
  state: State;
  opportunities: State['opportunities'];
  leads: State['leads'];
  invoices: State['invoices'];
  weekItems?: AgendaItem[];
  filtered: boolean;
  onOpenOpportunity: (opportunity: State['opportunities'][number]) => void;
  onOpenLead: (lead: State['leads'][number]) => void;
  onOpenInvoice: (invoice: State['invoices'][number]) => void;
  onOpenWeek?: (item: AgendaItem) => void;
  onPipeline: () => void;
  onLeads: () => void;
  onInvoices: () => void;
  onAgenda?: () => void;
}) {
  const empty = !opportunities.length && !leads.length && !invoices.length && !weekItems.length;
  if (empty) {
    return (
      <div className="focus-empty">
        <CheckCheck size={28} />
        <h2>{filtered ? 'Sin resultados en esta selección' : 'Nada urgente por ahora'}</h2>
        <p>{filtered ? 'Prueba otra búsqueda o cambia los filtros.' : 'Cuando haya leads vencidos, oportunidades en riesgo o cobros atrasados, aparecen aquí.'}</p>
        <button type="button" className="outline" onClick={onPipeline}>Ver Pipeline <ArrowRight size={14} /></button>
      </div>
    );
  }

  return (
    <div className="today-view">
      {opportunities.length > 0 && (
        <section className="today-block" aria-labelledby="today-opps">
          <div className="today-heading">
            <h2 id="today-opps">Oportunidades <span className="count">{opportunities.length}</span></h2>
          </div>
          <FocusQueue state={state} opportunities={opportunities} filtered={filtered} onOpen={onOpenOpportunity} onPipeline={onPipeline} />
        </section>
      )}
      {leads.length > 0 && (
        <section className="today-block" aria-labelledby="today-leads">
          <div className="today-heading">
            <h2 id="today-leads">Leads vencidos <span className="count">{leads.length}</span></h2>
            <button type="button" className="subtle" onClick={onLeads}>Ver bandeja <ArrowRight size={14} /></button>
          </div>
          <ul className="today-list">
            {leads.map(lead => (
              <li key={lead.id}>
                <button type="button" className="today-row" onClick={() => onOpenLead(lead)}>
                  <span>
                    <strong>{lead.name}</strong>
                    <small>{lead.contact || lead.email || lead.source}</small>
                  </span>
                  <span className="red"><Clock3 size={12} />{lead.nextDate ? 'Vencida · ' + shortDate(lead.nextDate) : 'Sin fecha'}</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {invoices.length > 0 && (
        <section className="today-block" aria-labelledby="today-invoices">
          <div className="today-heading">
            <h2 id="today-invoices">Cobros vencidos <span className="count">{invoices.length}</span></h2>
            <button type="button" className="subtle" onClick={onInvoices}>Ver facturas <ArrowRight size={14} /></button>
          </div>
          <ul className="today-list">
            {invoices.map(invoice => {
              const company = state.companies.find(item => item.id === companyForOrder(state, invoice.orderId));
              return (
                <li key={invoice.id}>
                  <button type="button" className="today-row" onClick={() => onOpenInvoice(invoice)}>
                    <span>
                      <strong>{invoice.title}</strong>
                      <small>{company?.name || 'Sin empresa'} · {eur(invoice.amount)}</small>
                    </span>
                    <span className="red"><Clock3 size={12} />Vence · {shortDate(invoice.dueDate)}</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {weekItems.length > 0 && (
        <section className="today-block" aria-labelledby="today-week">
          <div className="today-heading">
            <h2 id="today-week">Esta semana <span className="count">{weekItems.length}</span></h2>
            {onAgenda && <button type="button" className="subtle" onClick={onAgenda}>Ver agenda <ArrowRight size={14} /></button>}
          </div>
          <ul className="today-list">
            {weekItems.slice(0, 8).map(item => (
              <li key={item.id}>
                <button type="button" className="today-row" onClick={() => onOpenWeek?.(item)}>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{weekKind[item.kind]} · {item.detail}</small>
                  </span>
                  <span>{shortDate(item.date)}</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

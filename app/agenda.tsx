'use client';

import { ArrowRight } from 'lucide-react';
import { agendaWeek, type AgendaItem } from '@/lib/agenda';
import { today, type State } from '@/lib/crm';

const kindLabel: Record<AgendaItem['kind'], string> = {
  followup: 'Seguimiento',
  close: 'Cierre',
  interaction: 'Interacción',
  invoice: 'Factura',
  task: 'Tarea',
  purchase: 'Gasto',
  contract: 'Contrato',
  recurring: 'Recurrente',
};

function dayLabel(date: string) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
}

export function AgendaView({
  state,
  onOpen,
}: {
  state: State;
  onOpen: (item: AgendaItem) => void;
}) {
  const { range, items } = agendaWeek(state);
  const now = today();
  if (!items.length) {
    return <p className="muted agenda-empty">No hay citas ni vencimientos esta semana ({range.start} · {range.end}).</p>;
  }
  return (
    <div className="agenda-view">
      <p className="agenda-range">Semana {range.start} · {range.end}</p>
      {range.days.map(day => {
        const dayItems = items.filter(item => item.date === day);
        if (!dayItems.length) return null;
        return (
          <section className="agenda-day" key={day} aria-labelledby={`agenda-${day}`}>
            <h2 id={`agenda-${day}`} className={day === now ? 'is-today' : ''}>{dayLabel(day)}{day === now ? ' · hoy' : ''}</h2>
            <ul className="agenda-list">
              {dayItems.map(item => (
                <li key={item.id}>
                  <button type="button" className="agenda-row" onClick={() => onOpen(item)}>
                    <span className="agenda-kind">{kindLabel[item.kind]}</span>
                    <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

'use client';
import type { MouseEvent } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, CheckCheck, CircleDot, House, Inbox, Wallet } from 'lucide-react';
import { areas, areaOf } from '@/lib/areas';
import type { AgendaItem } from '@/lib/agenda';

function follow(event: MouseEvent<HTMLAnchorElement>, run: () => void) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  run();
}
const descriptions: Record<string, string> = {
  Hoy: 'Prioriza las conversaciones y tareas que necesitan atención.',
  Pipeline: 'Avanza cada oportunidad hasta el cierre.',
  Proyectos: 'Organiza las entregas y el trabajo del equipo.',
  Leads: 'Convierte el primer contacto en una oportunidad.',
  Clientes: 'Empresas, contactos, catálogo y contratos.',
  Facturación: 'Presupuestos, pedidos, facturas y gastos.',
  OCR: 'Extrae datos de tus documentos y revisa el resultado.',
  Informes: 'Consulta ventas, cobros y margen de tus proyectos.',
};
export function WorkspaceNav({ view, onNavigate }: { view: string; onNavigate: (view: string) => void }) {
  return <nav className="workspace-nav" aria-label="Módulos">
    <a href="?view=Inicio" aria-current={view === 'Inicio' ? 'page' : undefined} onClick={e => follow(e, () => onNavigate('Inicio'))}><House size={16}/><span>Inicio</span></a>
    {areas.map(area => { const Icon = area.icon; return <a key={area.name} href={`?view=${encodeURIComponent(area.views[0])}`} aria-current={areaOf(view)?.name === area.name ? 'page' : undefined} onClick={e => follow(e, () => onNavigate(area.name))}><Icon size={16}/><span>{area.name}</span></a>; })}
  </nav>;
}
export function WorkspaceHome({ attention, dueLeads, overdueInvoices, stats, weekItems, onNavigate, onFilter, onOpenItem }: {
  attention: number; dueLeads: number; overdueInvoices: number; stats: Record<string, string>;
  weekItems: AgendaItem[]; onNavigate: (view: string) => void;
  onFilter: (view: string, filter: string) => void; onOpenItem: (item: AgendaItem) => void;
}) {
  const priorities = [
    { label: 'Oportunidades por atender', value: attention, text: 'Revisa la siguiente acción', view: 'Foco', filter: 'all', icon: CircleDot, tone: 'warning' },
    { label: 'Leads con acción vencida', value: dueLeads, text: 'Retoma el contacto', view: 'Leads', filter: 'due', icon: Inbox, tone: 'warning' },
    { label: 'Cobros vencidos', value: overdueInvoices, text: 'Consulta las facturas', view: 'Facturas', filter: 'overdue', icon: Wallet, tone: 'danger' },
  ];
  return <div className="home-screen">
    <section className="home-priorities" aria-label="Prioridades">
      {priorities.map(item => { const Icon = item.icon; return <a key={item.view} className={`priority-card ${item.value ? `priority-${item.tone}` : ''}`} href={`?view=${item.view}&filter=${item.filter}`} onClick={e => follow(e, () => onFilter(item.view, item.filter))}>
        <span className="priority-label"><Icon size={17}/>{item.label}</span><strong>{item.value}</strong>
        <span className="priority-foot">{item.value ? item.text : 'Todo al día'}<ArrowUpRight size={17}/></span>
      </a>; })}
    </section>
    <div className="home-layout">
      <section aria-labelledby="workspace-areas" className="home-areas">
        <div className="home-section-heading"><div><span className="eyebrow">ESPACIO DE TRABAJO</span><h2 id="workspace-areas">Tus áreas</h2></div><span className="home-caption">Del primer contacto a la entrega</span></div>
        <div className="home-grid">{areas.map(area => { const Icon = area.icon; return <a className="home-card" key={area.name} href={`?view=${encodeURIComponent(area.views[0])}`} onClick={e => follow(e, () => onNavigate(area.name))}>
          <span className="home-card-icon"><Icon size={21}/></span><span className="home-card-body"><b>{area.name}</b><small>{descriptions[area.name]}</small><strong>{stats[area.name]}</strong></span><ArrowUpRight size={17}/>
        </a>; })}</div>
      </section>
      <aside className="home-agenda" aria-labelledby="home-agenda-title">
        <div className="home-section-heading"><div><span className="eyebrow">PRÓXIMOS PASOS</span><h2 id="home-agenda-title">Esta semana</h2></div><CalendarDays size={20}/></div>
        {weekItems.length ? <ol className="home-agenda-list">{weekItems.slice(0, 5).map(item => <li key={item.id}><button onClick={() => onOpenItem(item)}><time dateTime={item.date}><b>{new Date(item.date + 'T12:00:00Z').getUTCDate()}</b><span>{new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(new Date(item.date + 'T12:00:00Z'))}</span></time><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={15}/></button></li>)}</ol> : <div className="home-agenda-empty"><CheckCheck size={28}/><strong>No hay próximos eventos esta semana</strong><p>Los seguimientos, entregas y vencimientos aparecerán aquí.</p></div>}
        <a className="home-agenda-link" href="?view=Agenda" onClick={e => follow(e, () => onNavigate('Agenda'))}>Abrir agenda{weekItems.length > 5 ? ` · ${weekItems.length} eventos` : ''}<ArrowRight size={16}/></a>
        <div className="home-tip"><span className="status-dot"/><p>Los cambios se comparten con tu equipo. Abre un área para continuar donde lo dejaste.</p></div>
      </aside>
    </div>
  </div>;
}

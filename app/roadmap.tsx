'use client';

import { today, type State } from '@/lib/crm';
import { roadmapScale } from '@/lib/roadmap';

export function Roadmap({ tasks, onOpen }: { tasks: State['delivery']; onOpen: (task: State['delivery'][number]) => void }) {
  const dated = tasks.filter(task => task.startDate || task.dueDate).slice().sort((a, b) =>
    (a.startDate || a.dueDate).localeCompare(b.startDate || b.dueDate) || a.title.localeCompare(b.title));
  const undated = tasks.filter(task => !task.startDate && !task.dueDate);
  const scale = roadmapScale(dated);
  const dateLabel = (date: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  const now = today();
  const todayLeft = scale?.position(now) ?? -1;
  return <div className="project-roadmap">
    <p className="roadmap-legend">Hecho · Pendiente · Vencido. Pulsa una tarea para consultar o cambiar sus fechas.</p>
    {scale ? <div className="roadmap-scroll"><div className="roadmap-grid">
      <div className="roadmap-axis"><span>Tarea y responsable</span><div className="roadmap-dates">
        {scale.ticks.map((tick, index) => <span className={`roadmap-tick tick-${index}`} key={tick.date} style={{ left: `${tick.left}%` }}>{dateLabel(tick.date)}</span>)}
      </div></div>
      {dated.map(task => {
        const from = task.startDate || task.dueDate;
        const to = task.dueDate || task.startDate;
        const late = !task.done && !!task.dueDate && task.dueDate < now;
        const status = task.done ? 'Hecho' : late ? 'Vencido' : task.status;
        const dates = `${task.startDate ? `Inicio: ${dateLabel(task.startDate)}` : 'Sin fecha de inicio'} · ${task.dueDate ? `Objetivo: ${dateLabel(task.dueDate)}` : 'Sin fecha objetivo'}`;
        return <button type="button" className="roadmap-task" key={task.id} onClick={() => onOpen(task)} aria-label={`${task.title}. ${status}. ${dates}`}>
          <span className="roadmap-task-label"><b>{task.title}</b><small>{task.assignee || 'Sin asignar'} · {status}</small></span>
          <span className="roadmap-task-track">
            {todayLeft >= 0 && todayLeft <= 100 && <i className="roadmap-now" style={{ left: `${todayLeft}%` }} aria-hidden="true"/>}
            <span title={dates} className={`roadmap-bar ${task.done ? 'is-done' : late ? 'is-late' : 'is-open'}`} style={{ left: `${scale.position(from)}%`, width: `${scale.duration(from, to)}%` }}>{status}</span>
          </span>
        </button>;
      })}
    </div></div> : <p className="roadmap-legend">Todavía no hay tareas con fechas. Abre una tarea para planificarla.</p>}
    {undated.length > 0 && <div className="roadmap-undated"><b>Sin fecha · {undated.length}</b>{undated.map(task => <button type="button" key={task.id} onClick={() => onOpen(task)}>{task.title}<small>{task.status}</small></button>)}</div>}
  </div>;
}

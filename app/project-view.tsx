'use client';

import { useState, type ReactNode } from 'react';
import { BarChart3, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, KanbanSquare, List, PieChart, Users } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { taskStatuses, today, type State } from '@/lib/crm';
import { defaultTimelineStart, shiftTimeline, statusCounts, timelineStartFor, timelineWindow, weeklyDue, type TimelineZoom } from '@/lib/project-timeline';
import { Avatar } from './pipeline-card';

type Task = State['delivery'][number];
type Status = (typeof taskStatuses)[number];
export type ProjectTab = 'board' | 'people' | 'list' | 'weeks';

const STATUS_KEY: Record<Status, string> = { 'Por hacer': 'todo', 'En curso': 'doing', 'Hecho': 'done' };
const STATUS_COLOR: Record<Status, string> = { 'Por hacer': '#94a3b8', 'En curso': '#60a5fa', 'Hecho': '#4ade80' };
const TABS: { key: ProjectTab; label: string; icon: ReactNode }[] = [
  { key: 'board', label: 'Tablero', icon: <KanbanSquare size={14}/> },
  { key: 'people', label: 'Por responsable', icon: <Users size={14}/> },
  { key: 'list', label: 'Lista', icon: <List size={14}/> },
  { key: 'weeks', label: 'Por semana', icon: <BarChart3 size={14}/> },
];

const fmt = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-ES', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const shortDate = (date: string) => fmt(date, { day: 'numeric', month: 'short' });
const isLate = (task: Task, now: string) => task.status !== 'Hecho' && !!task.dueDate && task.dueDate < now;

function StatusPill({ status, count }: { status: Status; count?: number }) {
  return <span className={'st-pill st-' + STATUS_KEY[status]}><i/>{status}{count != null && <b>{count}</b>}</span>;
}

function DueText({ task, now }: { task: Task; now: string }) {
  if (!task.dueDate) return <small className="pv-due">Sin fecha</small>;
  return <small className={'pv-due' + (isLate(task, now) ? ' late' : '')}>{isLate(task, now) ? 'Vencida · ' : ''}{shortDate(task.dueDate)}</small>;
}

function Timeline({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  const now = today();
  const [zoom, setZoom] = useState<TimelineZoom>('quarter');
  const [start, setStart] = useState(() => defaultTimelineStart(now, 'quarter'));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const view = timelineWindow(start, zoom);
  const nowLeft = view.position(now);
  const showNow = nowLeft >= 0 && nowLeft <= 100;
  const changeZoom = (next: TimelineZoom) => { setZoom(next); setStart(defaultTimelineStart(now, next)); };
  const rangeLabel = `${fmt(view.start, { month: 'long', year: 'numeric' })} – ${fmt(view.months.at(-1)!.date, { month: 'long', year: 'numeric' })}`;
  return <section className="pv-card pv-timeline" aria-label="Cronograma del proyecto">
    <header className="pv-card-head">
      <h3><CalendarRange size={16}/> Cronograma</h3>
      <div className="pv-tools">
        <div className="segmented small" role="group" aria-label="Escala">
          {(['month', 'quarter'] as const).map(z => <button key={z} type="button" aria-pressed={zoom === z} className={zoom === z ? 'selected' : ''} onClick={() => changeZoom(z)}>{z === 'month' ? 'Mes' : 'Trimestre'}</button>)}
        </div>
        <button type="button" className="icon-button" aria-label="Anterior" onClick={() => setStart(shiftTimeline(start, zoom, -1))}><ChevronLeft size={16}/></button>
        <button type="button" className="pv-today" onClick={() => setStart(defaultTimelineStart(now, zoom))}>Hoy</button>
        <button type="button" className="icon-button" aria-label="Siguiente" onClick={() => setStart(shiftTimeline(start, zoom, 1))}><ChevronRight size={16}/></button>
      </div>
    </header>
    <div className="tl-scroll"><div className={'tl zoom-' + zoom} aria-label={rangeLabel}>
      <div className="tl-overlay" aria-hidden="true">
        {view.weeks.map(week => <i key={week.date} className="tl-line" style={{ left: `${week.left}%` }}/>)}
        {showNow && <i className="tl-now" style={{ left: `${nowLeft}%` }}/>}
      </div>
      <div className="tl-head">
        <div className="tl-corner"/>
        <div className="tl-axis">
          <div className="tl-months">{view.months.map(month => <span key={month.date} style={{ left: `${month.left}%` }}>{fmt(month.date, { month: 'long', ...(month.date.slice(5, 7) === '01' || month.left === 0 ? { year: 'numeric' } : {}) })}</span>)}</div>
          <div className="tl-days">
            {view.weeks.map(week => <span key={week.date} style={{ left: `${week.left}%` }}>{week.day}</span>)}
            {showNow && <b className="tl-now-dot" style={{ left: `${nowLeft}%` }}>{Number(now.slice(8, 10))}</b>}
          </div>
        </div>
      </div>
      {taskStatuses.map(status => {
        const group = tasks.filter(task => task.status === status);
        const closed = collapsed[status];
        return <div className="tl-group" key={status}>
          <button type="button" className="tl-group-head" aria-expanded={!closed} onClick={() => setCollapsed(current => ({ ...current, [status]: !closed }))}>
            <ChevronDown size={14} className={closed ? 'rot' : ''}/><StatusPill status={status} count={group.length}/>
          </button>
          {!closed && group.map(task => {
            const bar = view.bar(task);
            return <div className="tl-row" key={task.id}>
              <button type="button" className="tl-label" onClick={() => onOpen(task)} title={task.title}>
                <Avatar userId={task.assignee} name={task.assignee} size={20}/><span>{task.title}</span>
              </button>
              <div className="tl-track">
                {bar.kind === 'bar' && <button type="button" onClick={() => onOpen(task)}
                  className={'tl-bar st-' + STATUS_KEY[status] + (isLate(task, now) ? ' late' : '') + (bar.clippedStart ? ' cut-start' : '') + (bar.clippedEnd ? ' cut-end' : '')}
                  style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                  title={`${task.title} · ${task.startDate ? shortDate(task.startDate) : '…'} → ${task.dueDate ? shortDate(task.dueDate) : '…'}`}>
                  <span>{task.title}</span>
                </button>}
                {bar.kind === 'before' && <button type="button" className="tl-off left" onClick={() => setStart(timelineStartFor(bar.target, zoom))} aria-label={`Ir a ${task.title}`}><ChevronLeft size={12}/>{shortDate(bar.target)}</button>}
                {bar.kind === 'after' && <button type="button" className="tl-off right" onClick={() => setStart(timelineStartFor(bar.target, zoom))} aria-label={`Ir a ${task.title}`}>{shortDate(bar.target)}<ChevronRight size={12}/></button>}
                {bar.kind === 'undated' && <button type="button" className="tl-undated" onClick={() => onOpen(task)}>Sin fechas · planificar</button>}
              </div>
            </div>;
          })}
        </div>;
      })}
    </div></div>
  </section>;
}

function Summary({ tasks }: { tasks: Task[] }) {
  const now = today();
  const counts = statusCounts(tasks, taskStatuses);
  const total = tasks.length;
  const radius = 52, circumference = 2 * Math.PI * radius, gap = total > 1 ? 3 : 0;
  let offset = 0;
  const done = counts.find(c => c.status === 'Hecho')!.count;
  const late = tasks.filter(task => isLate(task, now)).length;
  const undated = tasks.filter(task => !task.startDate && !task.dueDate).length;
  return <section className="pv-card pv-summary" aria-label="Resumen de tareas">
    <header className="pv-card-head"><h3><PieChart size={16}/> Resumen</h3></header>
    <div className="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={counts.map(c => `${c.status}: ${c.count}`).join(', ')}>
        <circle cx="70" cy="70" r={radius} className="donut-track"/>
        {total > 0 && counts.map(c => {
          if (!c.count) return null;
          const length = c.count / total * circumference;
          const segment = <circle key={c.status} cx="70" cy="70" r={radius} stroke={STATUS_COLOR[c.status as Status]}
            strokeDasharray={`${Math.max(length - gap, 0)} ${circumference}`} strokeDashoffset={-offset} className="donut-seg"/>;
          offset += length;
          return segment;
        })}
      </svg>
      <div className="donut-center"><strong>{total}</strong><small>{total === 1 ? 'tarea' : 'tareas'}</small></div>
    </div>
    <ul className="donut-legend">
      {counts.map(c => <li key={c.status}><i style={{ background: STATUS_COLOR[c.status as Status] }}/>{c.status}<b>{c.count}</b></li>)}
    </ul>
    <dl className="pv-kpis">
      <div><dt>Completado</dt><dd>{total ? Math.round(done / total * 100) : 0}%</dd></div>
      <div className={late ? 'warn' : ''}><dt>Vencidas</dt><dd>{late}</dd></div>
      <div><dt>Sin fechas</dt><dd>{undated}</dd></div>
    </dl>
  </section>;
}

function PeopleBoard({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  const now = today();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const people = Array.from(new Set(tasks.map(task => task.assignee))).sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, 'es'));
  return <div className="lanes">
    <div className="lanes-head">{taskStatuses.map(status => <StatusPill key={status} status={status} count={tasks.filter(task => task.status === status).length}/>)}</div>
    {people.map(person => {
      const mine = tasks.filter(task => task.assignee === person);
      const closed = collapsed[person];
      return <div className="lane" key={person || 'none'}>
        <button type="button" className="lane-head" aria-expanded={!closed} onClick={() => setCollapsed(current => ({ ...current, [person]: !closed }))}>
          <ChevronDown size={14} className={closed ? 'rot' : ''}/><Avatar userId={person} name={person} size={22}/><b>{person || 'Sin asignar'}</b><span className="count">{mine.length}</span>
        </button>
        {!closed && <div className="lane-cols">{taskStatuses.map(status => <div className={'lane-col st-' + STATUS_KEY[status]} key={status}>
          {mine.filter(task => task.status === status).map(task => <button type="button" className="mini-card" key={task.id} onClick={() => onOpen(task)}>
            <span>{task.title}</span><DueText task={task} now={now}/>
          </button>)}
        </div>)}</div>}
      </div>;
    })}
  </div>;
}

function TaskList({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  const now = today();
  const order = (task: Task) => taskStatuses.indexOf(task.status);
  const rows = tasks.slice().sort((a, b) => order(a) - order(b) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.title.localeCompare(b.title));
  return <Table className="pv-table"><TableHeader><TableRow><TableHead>Tarea</TableHead><TableHead>Estado</TableHead><TableHead>Responsable</TableHead><TableHead>Inicio</TableHead><TableHead>Objetivo</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map(task => <TableRow key={task.id} className="clickable" onClick={() => onOpen(task)}>
      <TableCell><button type="button" className="pv-link" onClick={event => { event.stopPropagation(); onOpen(task); }}>{task.title}</button></TableCell>
      <TableCell><StatusPill status={task.status}/></TableCell>
      <TableCell><span className="pv-person"><Avatar userId={task.assignee} name={task.assignee} size={20}/>{task.assignee || 'Sin asignar'}</span></TableCell>
      <TableCell>{task.startDate ? shortDate(task.startDate) : '—'}</TableCell>
      <TableCell><DueText task={task} now={now}/></TableCell>
    </TableRow>)}</TableBody>
  </Table>;
}

function WeeksChart({ tasks }: { tasks: Task[] }) {
  const { overdue, buckets } = weeklyDue(tasks, today());
  const max = Math.max(1, overdue, ...buckets.map(b => b.done + b.open));
  const bars = [{ key: 'late', label: 'Vencidas', done: 0, open: overdue, late: true }, ...buckets.map(b => ({ key: b.start, label: shortDate(b.start), done: b.done, open: b.open, late: false }))];
  return <div className="weeks">
    <p className="weeks-legend"><span><i className="k-open"/>Pendientes</span><span><i className="k-done"/>Hechas</span><span>Tareas por semana de su fecha objetivo</span></p>
    <div className="weeks-chart" role="img" aria-label={bars.map(b => `${b.label}: ${b.open} pendientes, ${b.done} hechas`).join('. ')}>
      {bars.map(b => <div className="week" key={b.key}>
        <div className="week-bar" title={`${b.open} pendientes · ${b.done} hechas`}>
          {b.open + b.done > 0 && <b className="week-total">{b.open + b.done}</b>}
          <span className={b.late ? 'k-late' : 'k-open'} style={{ height: `${b.open / max * 100}%` }}/>
          <span className="k-done" style={{ height: `${b.done / max * 100}%` }}/>
        </div>
        <small>{b.label}</small>
      </div>)}
    </div>
  </div>;
}

export function ProjectView({ tasks, tab, onTab, onOpen, board, empty }: {
  tasks: Task[]; tab: ProjectTab; onTab: (tab: ProjectTab) => void; onOpen: (task: Task) => void; board: ReactNode; empty?: ReactNode;
}) {
  return <div className="project-view">
    <div className="pv-overview">
      <Timeline tasks={tasks} onOpen={onOpen}/>
      <Summary tasks={tasks}/>
    </div>
    <section className="pv-tasks" aria-label="Tareas">
      <div className="pv-tabs" role="tablist" aria-label="Vista de tareas">
        {TABS.map(t => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'selected' : ''} onClick={() => onTab(t.key)}>{t.icon}{t.label}</button>)}
      </div>
      {!tasks.length ? empty : tab === 'board' ? board : tab === 'people' ? <PeopleBoard tasks={tasks} onOpen={onOpen}/> : tab === 'list' ? <TaskList tasks={tasks} onOpen={onOpen}/> : <WeeksChart tasks={tasks}/>}
    </section>
  </div>;
}

'use client';

import { useEffect, useState } from 'react';
import { Archive, Plus, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TAG_COLORS, type OpportunityTag, type State } from '@/lib/crm';
import { Avatar } from './pipeline-card';

type Project = State['projects'][number];
type Member = { userId: string; name: string; self: boolean };

export function ProjectCards({ projects, tasks, tags, team, summary, onOpen }: {
  projects: Project[]; tasks: State['delivery']; tags: OpportunityTag[]; team: Member[];
  summary: (project: Project) => string; onOpen: (id: string) => void;
}) {
  return <div className="project-grid">
    {projects.map(project => {
      const mine = tasks.filter(task => task.projectId === project.id);
      const done = mine.filter(task => task.status === 'Hecho').length;
      const chips = (project.tagIds || []).map(id => tags.find(tag => tag.id === id)).filter((tag): tag is OpportunityTag => !!tag && !tag.archived);
      const member = team.find(m => m.userId === project.assigneeUserId);
      const name = member?.name || '';
      return <button type="button" className="project-card" key={project.id} onClick={() => onOpen(project.id)}>
        <span className="project-card-title">{project.title}</span>
        <small>{summary(project)}</small>
        <span className="card-tags">{chips.slice(0, 3).map(tag => <span key={tag.id} className={'tag-chip color-' + tag.color}>{tag.name}</span>)}{(project.tagIds || []).length > 3 && <span className="tag-chip">+{(project.tagIds || []).length - 3}</span>}</span>
        <span className="project-card-foot">
          <span className="pv-person">{project.assigneeUserId ? <><Avatar userId={project.assigneeUserId} name={name || 'Asignado'} size={22}/>{member?.self ? 'Tú' : name.split(' ')[0] || 'Asignado'}</> : <><Avatar userId="" name="" size={22}/>Sin asignar</>}</span>
          <span className="project-progress" title={mine.length ? `${done} de ${mine.length} hechas` : 'Sin tareas'}>
            <span className="goal-bar"><span style={{ width: mine.length ? `${done / mine.length * 100}%` : '0%' }}/></span>
            <b>{done}/{mine.length}</b>
          </span>
        </span>
      </button>;
    })}
  </div>;
}

export function ProjectMeta({ project, tags, team }: { project: Project; tags: OpportunityTag[]; team: Member[] }) {
  const chips = (project.tagIds || []).map(id => tags.find(tag => tag.id === id)).filter((tag): tag is OpportunityTag => !!tag);
  const member = team.find(m => m.userId === project.assigneeUserId);
  if (!chips.length && !project.assigneeUserId) return null;
  return <div className="project-meta">
    {chips.map(tag => <span key={tag.id} className={'tag-chip color-' + tag.color}>{tag.name}</span>)}
    {project.assigneeUserId && <span className="pv-person"><Avatar userId={project.assigneeUserId} name={member?.name || 'Asignado'} size={20}/>{member?.self ? 'Tú' : member?.name || 'Asignado'}</span>}
  </div>;
}

export function ProjectTagDialog({ open, tags, busy, onOpenChange, onSave }: {
  open: boolean; tags: OpportunityTag[]; busy: boolean; onOpenChange: (open: boolean) => void; onSave: (tags: OpportunityTag[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(tags);
  useEffect(() => { if (open) setDraft(tags.map(tag => ({ ...tag }))); }, [open, tags]);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} className="form-dialog">
      <DialogClose className="close-panel" aria-label="Cerrar"><X size={17}/></DialogClose>
      <DialogHeader>
        <DialogTitle>Etiquetas de proyectos</DialogTitle>
        <DialogDescription>Clasifican las tarjetas del listado. Archivar una etiqueta la quita de los proyectos.</DialogDescription>
      </DialogHeader>
      <div className="section-heading">
        <h3>Catálogo</h3>
        <button type="button" className="compact-action" disabled={busy} onClick={() => setDraft([...draft, { id: `ptag-${crypto.randomUUID().slice(0, 8)}`, name: 'Nueva etiqueta', color: 'slate', archived: false }])}><Plus size={14}/> Etiqueta</button>
      </div>
      <ul className="settings-list">
        {draft.map((tag, index) => <li key={tag.id}>
          <input aria-label="Nombre de etiqueta" value={tag.name} disabled={busy || tag.archived} onChange={e => setDraft(draft.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} />
          <select aria-label="Color" value={tag.color} disabled={busy || tag.archived} onChange={e => setDraft(draft.map((row, i) => i === index ? { ...row, color: e.target.value as OpportunityTag['color'] } : row))}>
            {TAG_COLORS.map(color => <option key={color} value={color}>{color}</option>)}
          </select>
          <button type="button" className="compact-action" disabled={busy} onClick={() => setDraft(draft.map((row, i) => i === index ? { ...row, archived: !row.archived } : row))}><Archive size={14}/>{tag.archived ? 'Restaurar' : 'Archivar'}</button>
        </li>)}
        {!draft.length && <li className="muted">Todavía no hay etiquetas.</li>}
      </ul>
      <button type="button" className="primary" disabled={busy} onClick={() => void onSave(draft).then(ok => { if (ok) onOpenChange(false); })}>Guardar etiquetas</button>
    </DialogContent>
  </Dialog>;
}

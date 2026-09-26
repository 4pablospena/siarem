'use client';

import { useState } from 'react';
import { Check, Star, UserRound } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type TeamMember = { userId: string; name: string; self: boolean };

const PRIORITY_LABELS = ['Sin prioridad', 'Baja', 'Media', 'Alta'];
const AVATAR_HUES = [199, 262, 152, 28, 330, 222, 95, 12];

export function priorityLabel(value: number) { return PRIORITY_LABELS[value] ?? PRIORITY_LABELS[0]; }

export function initials(name: string) {
  return name.split(/[\s@._-]+/).filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function hueOf(userId: string) {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length];
}

export function Avatar({ userId, name, size = 26 }: { userId: string; name: string; size?: number }) {
  if (!userId) return <span className="avatar avatar-empty" style={{ width: size, height: size }} aria-hidden="true"><UserRound size={Math.round(size * .55)}/></span>;
  return <span className="avatar" style={{ width: size, height: size, ['--hue' as string]: hueOf(userId) }} aria-hidden="true">{initials(name)}</span>;
}

export function PriorityStars({ value, disabled, onChange }: { value: number; disabled?: boolean; onChange: (next: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return <span className={'priority-stars' + (value ? ' set' : '')} role="radiogroup" aria-label={'Prioridad: ' + priorityLabel(value)} onMouseLeave={() => setHover(0)}>
    {[1, 2, 3].map(level => <button key={level} type="button" role="radio" aria-checked={value === level} disabled={disabled}
      className={level <= shown ? 'on' : ''} title={value === level ? 'Quitar prioridad' : 'Prioridad ' + priorityLabel(level).toLowerCase()}
      aria-label={priorityLabel(level)} onMouseEnter={() => setHover(level)} onClick={() => onChange(value === level ? 0 : level)}>
      <Star size={13} strokeWidth={2.2}/>
    </button>)}
  </span>;
}

export function OwnerPicker({ team, userId, disabled, onAssign }: { team: TeamMember[]; userId: string; disabled?: boolean; onAssign: (userId: string) => void }) {
  const [open, setOpen] = useState(false);
  const member = team.find(m => m.userId === userId);
  const name = member ? member.name : userId ? 'Antiguo miembro' : '';
  const pick = (next: string) => { setOpen(false); if (next !== userId) onAssign(next); };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className={'owner-chip' + (userId ? '' : ' unassigned')} disabled={disabled}
        aria-label={userId ? `Responsable: ${name}. Cambiar` : 'Asignar responsable'}>
        <Avatar userId={userId} name={name}/>
        <span>{userId ? (member?.self ? 'Tú' : name.split(' ')[0]) : 'Asignar'}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="owner-menu">
      <small>Responsable</small>
      {team.map(m => <button key={m.userId} type="button" className={m.userId === userId ? 'selected' : ''} onClick={() => pick(m.userId)}>
        <Avatar userId={m.userId} name={m.name} size={24}/><span>{m.name}{m.self && <em> · tú</em>}</span>{m.userId === userId && <Check size={14}/>}
      </button>)}
      <button type="button" className={!userId ? 'selected' : ''} onClick={() => pick('')}>
        <Avatar userId="" name="" size={24}/><span>Sin asignar</span>{!userId && <Check size={14}/>}
      </button>
    </PopoverContent>
  </Popover>;
}

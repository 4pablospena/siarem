'use client';

import { LayoutGrid, Rows3, SlidersHorizontal, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { eur, type State } from '@/lib/crm';

type TeamMember = { userId: string; name: string; self: boolean };

export type PipelineFilterState = {
  tagFilter: string;
  ownerFilter: string;
  minMrr: number | null;
  overdueOnly: boolean;
};

type Props = PipelineFilterState & {
  state: State;
  team: TeamMember[];
  selfUserId: string;
  compact: boolean;
  onTag: (value: string) => void;
  onOwner: (value: string) => void;
  onMinMrr: (value: number | null) => void;
  onOverdue: (value: boolean) => void;
  onCompact: (value: boolean) => void;
};

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <label className="pf-field"><span>{label}</span>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="picker"><SelectValue/></SelectTrigger>
      <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  </label>;
}

export function ownerLabel(team: TeamMember[], id: string) {
  if (id === 'unassigned') return 'Sin asignar';
  const member = team.find(m => m.userId === id);
  return member ? (member.self ? 'Mías' : member.name) : 'Responsable';
}

/** Quick toggles stay visible; less frequent filters live behind one popover. */
export function PipelineToolbar(props: Props) {
  const { state, team, selfUserId, compact, tagFilter, ownerFilter, minMrr, overdueOnly } = props;
  const tags = state.opportunityTags.filter(t => !t.archived);
  const hidden = (tagFilter !== 'all' ? 1 : 0) + (ownerFilter !== 'all' && ownerFilter !== selfUserId ? 1 : 0) + (minMrr != null ? 1 : 0);
  const mine = !!selfUserId && ownerFilter === selfUserId;
  return <div className="pipeline-controls">
    <div className="segmented" role="group" aria-label="Accesos rápidos">
      {selfUserId && <button type="button" aria-pressed={mine} className={mine ? 'selected' : ''} onClick={() => props.onOwner(mine ? 'all' : selfUserId)}>Mías</button>}
      <button type="button" aria-pressed={overdueOnly} className={overdueOnly ? 'selected' : ''} onClick={() => props.onOverdue(!overdueOnly)}>Vencidas</button>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={hidden ? 'selected-soft' : ''} aria-label={'Más filtros' + (hidden ? ` (${hidden} activos)` : '')}>
            <SlidersHorizontal size={14}/> Filtros{hidden > 0 && <span className="pf-count">{hidden}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="pf-popover">
          <Choice label="Etiqueta" value={tagFilter} onChange={props.onTag} options={[{ value: 'all', label: 'Todas' }, ...tags.map(t => ({ value: t.id, label: t.name }))]}/>
          <Choice label="Responsable" value={ownerFilter} onChange={props.onOwner} options={[{ value: 'all', label: 'Todos' }, { value: 'unassigned', label: 'Sin asignar' }, ...team.map(m => ({ value: m.userId, label: m.self ? `${m.name} (yo)` : m.name }))]}/>
          <label className="pf-field"><span>MRR mínimo</span>
            <div className="pf-money"><input type="number" inputMode="decimal" min={0} step={50} placeholder="Sin mínimo" value={minMrr ?? ''} onChange={e => props.onMinMrr(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}/><small>€/mes</small></div>
          </label>
          {hidden > 0 && <button type="button" className="subtle pf-reset" onClick={() => { props.onTag('all'); if (!mine) props.onOwner('all'); props.onMinMrr(null); }}>Quitar estos filtros</button>}
        </PopoverContent>
      </Popover>
    </div>
    <div className="segmented density" role="group" aria-label="Densidad de tarjetas">
      <button type="button" aria-pressed={!compact} className={!compact ? 'selected' : ''} onClick={() => props.onCompact(false)} title="Tarjetas con detalle" aria-label="Tarjetas con detalle"><LayoutGrid size={15}/></button>
      <button type="button" aria-pressed={compact} className={compact ? 'selected' : ''} onClick={() => props.onCompact(true)} title="Tarjetas compactas" aria-label="Tarjetas compactas"><Rows3 size={15}/></button>
    </div>
  </div>;
}

/** Every active filter is visible and removable in one click. */
export function ActiveFilters({ state, team, query, company, tagFilter, ownerFilter, minMrr, overdueOnly, onClear, onRemove }: PipelineFilterState & {
  state: State; team: TeamMember[]; query: string; company: string;
  onClear: () => void; onRemove: (key: 'query' | 'company' | 'tag' | 'owner' | 'mrr' | 'overdue') => void;
}) {
  const chips: { key: Parameters<typeof onRemove>[0]; label: string }[] = [];
  if (query) chips.push({ key: 'query', label: `«${query}»` });
  if (company !== 'all') chips.push({ key: 'company', label: state.companies.find(c => c.id === company)?.name || 'Empresa' });
  if (tagFilter !== 'all') chips.push({ key: 'tag', label: '#' + (state.opportunityTags.find(t => t.id === tagFilter)?.name || 'etiqueta') });
  if (ownerFilter !== 'all') chips.push({ key: 'owner', label: ownerLabel(team, ownerFilter) });
  if (minMrr != null) chips.push({ key: 'mrr', label: `MRR ≥ ${eur(minMrr)}` });
  if (overdueOnly) chips.push({ key: 'overdue', label: 'Vencidas' });
  if (!chips.length) return null;
  return <div className="active-filters" aria-label="Filtros activos">
    {chips.map(chip => <button type="button" key={chip.key} className="filter-chip" onClick={() => onRemove(chip.key)} aria-label={'Quitar filtro ' + chip.label}>{chip.label}<X size={12}/></button>)}
    {chips.length > 1 && <button type="button" className="subtle" onClick={onClear}>Limpiar todo</button>}
  </div>;
}

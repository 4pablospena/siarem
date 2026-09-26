'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Archive, Plus } from 'lucide-react';
import { TAG_COLORS, type LostReason, type OpportunityTag, type PipelineStage, type StageKind } from '@/lib/pipeline-stages';
import { defaultPipelineStages } from '@/lib/crm';

export function PipelineSettings({
  stages,
  tags,
  reasons,
  busy,
  onSaveStages,
  onSaveTags,
  onSaveReasons,
}: {
  stages: PipelineStage[];
  tags: OpportunityTag[];
  reasons: LostReason[];
  busy: boolean;
  onSaveStages: (stages: PipelineStage[]) => Promise<boolean>;
  onSaveTags: (tags: OpportunityTag[]) => Promise<boolean>;
  onSaveReasons: (reasons: LostReason[]) => Promise<boolean>;
}) {
  const [draftStages, setDraftStages] = useState(() => stages.map(stage => ({ ...stage })));
  const [draftTags, setDraftTags] = useState(() => tags.map(tag => ({ ...tag })));
  const [draftReasons, setDraftReasons] = useState(() => reasons.map(reason => ({ ...reason })));

  function moveStage(index: number, direction: -1 | 1) {
    const next = [...draftStages];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setDraftStages(next.map((stage, order) => ({ ...stage, order, tone: order })));
  }

  return (
    <div className="pipeline-settings">
      <section className="panel-section" aria-labelledby="pipeline-stages-heading">
        <div className="section-heading">
          <h3 id="pipeline-stages-heading">Etapas del pipeline</h3>
          <button type="button" className="compact-action" disabled={busy} onClick={() => setDraftStages([...draftStages, {
            id: `stage-${crypto.randomUUID().slice(0, 8)}`,
            name: 'Nueva etapa',
            order: draftStages.length,
            kind: 'open' as StageKind,
            tone: draftStages.length,
            archived: false,
            probability: 30,
            wipLimit: null,
            wipMode: 'warn',
            slaDays: 14,
            weeklyGoalCount: null,
            weeklyGoalAmount: null,
          }])}><Plus size={14}/> Etapa</button>
        </div>
        <ul className="settings-list">
          {draftStages.map((stage, index) => (
            <li key={stage.id} className={stage.archived ? 'archived' : ''}>
              <input aria-label="Nombre de etapa" value={stage.name} disabled={busy || stage.archived} onChange={e => setDraftStages(draftStages.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} />
              <select aria-label="Tipo de etapa" value={stage.kind} disabled={busy || stage.archived || defaultPipelineStages().some(d => d.id === stage.id && d.kind !== 'open' && stage.kind === d.kind)} onChange={e => setDraftStages(draftStages.map((row, i) => i === index ? { ...row, kind: e.target.value as StageKind, probability: e.target.value === 'won' ? 100 : e.target.value === 'lost' ? 0 : row.probability } : row))}>
                <option value="open">Abierta</option>
                <option value="won">Ganada</option>
                <option value="lost">Perdida</option>
              </select>
              {stage.kind === 'open' && (
                <>
                  <label className="inline-field">%<input type="number" min={0} max={100} value={stage.probability} disabled={busy || stage.archived} onChange={e => setDraftStages(draftStages.map((row, i) => i === index ? { ...row, probability: Number(e.target.value) } : row))} /></label>
                  <label className="inline-field">SLA<input type="number" min={1} placeholder="días" value={stage.slaDays ?? ''} disabled={busy || stage.archived} onChange={e => setDraftStages(draftStages.map((row, i) => i === index ? { ...row, slaDays: e.target.value === '' ? null : Number(e.target.value) } : row))} /></label>
                  <label className="inline-field">WIP<input type="number" min={1} placeholder="—" value={stage.wipLimit ?? ''} disabled={busy || stage.archived} onChange={e => setDraftStages(draftStages.map((row, i) => i === index ? { ...row, wipLimit: e.target.value === '' ? null : Number(e.target.value) } : row))} /></label>
                  <select aria-label="Modo WIP" value={stage.wipMode} disabled={busy || stage.archived || stage.wipLimit == null} onChange={e => setDraftStages(draftStages.map((row, i) => i === index ? { ...row, wipMode: e.target.value as 'warn' | 'block' } : row))}>
                    <option value="warn">Avisar</option>
                    <option value="block">Bloquear</option>
                  </select>
                  <label className="inline-field">Meta nº<input type="number" min={1} value={stage.weeklyGoalCount ?? ''} disabled={busy || stage.archived} onChange={e => setDraftStages(draftStages.map((row, i) => i === index ? { ...row, weeklyGoalCount: e.target.value === '' ? null : Number(e.target.value) } : row))} /></label>
                  <label className="inline-field">Meta €<input type="number" min={0} value={stage.weeklyGoalAmount ?? ''} disabled={busy || stage.archived} onChange={e => setDraftStages(draftStages.map((row, i) => i === index ? { ...row, weeklyGoalAmount: e.target.value === '' ? null : Number(e.target.value) } : row))} /></label>
                </>
              )}
              <span className="row-actions">
                <button type="button" className="icon-button" disabled={busy || index === 0} aria-label="Subir etapa" onClick={() => moveStage(index, -1)}><ArrowUp size={14}/></button>
                <button type="button" className="icon-button" disabled={busy || index === draftStages.length - 1} aria-label="Bajar etapa" onClick={() => moveStage(index, 1)}><ArrowDown size={14}/></button>
                <button type="button" className="icon-button" disabled={busy} aria-label={stage.archived ? 'Desarchivar' : 'Archivar'} onClick={() => setDraftStages(draftStages.map((row, i) => i === index ? { ...row, archived: !row.archived } : row))}><Archive size={14}/></button>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="primary" disabled={busy} onClick={() => void onSaveStages(draftStages.map((stage, order) => ({ ...stage, order, tone: order })))}>Guardar etapas</button>
      </section>

      <section className="panel-section" aria-labelledby="pipeline-tags-heading">
        <div className="section-heading">
          <h3 id="pipeline-tags-heading">Etiquetas</h3>
          <button type="button" className="compact-action" disabled={busy} onClick={() => setDraftTags([...draftTags, { id: `tag-${crypto.randomUUID().slice(0, 8)}`, name: 'Nueva etiqueta', color: 'slate', archived: false }])}><Plus size={14}/> Etiqueta</button>
        </div>
        <ul className="settings-list">
          {draftTags.map((tag, index) => (
            <li key={tag.id}>
              <input aria-label="Nombre de etiqueta" value={tag.name} disabled={busy || tag.archived} onChange={e => setDraftTags(draftTags.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} />
              <select aria-label="Color" value={tag.color} disabled={busy || tag.archived} onChange={e => setDraftTags(draftTags.map((row, i) => i === index ? { ...row, color: e.target.value as OpportunityTag['color'] } : row))}>
                {TAG_COLORS.map(color => <option key={color} value={color}>{color}</option>)}
              </select>
              <button type="button" className="compact-action" disabled={busy} onClick={() => setDraftTags(draftTags.map((row, i) => i === index ? { ...row, archived: !row.archived } : row))}>{tag.archived ? 'Restaurar' : 'Archivar'}</button>
            </li>
          ))}
        </ul>
        <button type="button" className="primary" disabled={busy} onClick={() => void onSaveTags(draftTags)}>Guardar etiquetas</button>
      </section>

      <section className="panel-section" aria-labelledby="pipeline-lost-heading">
        <div className="section-heading">
          <h3 id="pipeline-lost-heading">Motivos de pérdida</h3>
          <button type="button" className="compact-action" disabled={busy} onClick={() => setDraftReasons([...draftReasons, { id: `lost-${crypto.randomUUID().slice(0, 8)}`, name: 'Nuevo motivo', archived: false }])}><Plus size={14}/> Motivo</button>
        </div>
        <ul className="settings-list">
          {draftReasons.map((reason, index) => (
            <li key={reason.id}>
              <input aria-label="Motivo" value={reason.name} disabled={busy || reason.archived} onChange={e => setDraftReasons(draftReasons.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} />
              <button type="button" className="compact-action" disabled={busy} onClick={() => setDraftReasons(draftReasons.map((row, i) => i === index ? { ...row, archived: !row.archived } : row))}>{reason.archived ? 'Restaurar' : 'Archivar'}</button>
            </li>
          ))}
        </ul>
        <button type="button" className="primary" disabled={busy} onClick={() => void onSaveReasons(draftReasons)}>Guardar motivos</button>
      </section>
    </div>
  );
}

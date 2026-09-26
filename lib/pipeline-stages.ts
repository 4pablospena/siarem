export type StageKind = 'open' | 'won' | 'lost';
export type WipMode = 'warn' | 'block';

export type PipelineStage = {
  id: string;
  name: string;
  order: number;
  kind: StageKind;
  tone: number;
  archived: boolean;
  /** 0–100; used from phase 6. Defaults by kind. */
  probability: number;
  /** Optional WIP cap; used from phase 5. */
  wipLimit: number | null;
  wipMode: WipMode;
  /** Max days in stage before SLA warning; used from phase 5. */
  slaDays: number | null;
  weeklyGoalCount: number | null;
  weeklyGoalAmount: number | null;
};

type StagesHolder = { pipelineStages?: PipelineStage[] };

export type OpportunityTag = {
  id: string;
  name: string;
  color: 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'violet';
  archived: boolean;
};

export type LostReason = {
  id: string;
  name: string;
  archived: boolean;
};

export type StageHistoryEntry = {
  id: string;
  at: string;
  fromStageId: string;
  toStageId: string;
  user: string;
};

export const TAG_COLORS: OpportunityTag['color'][] = ['slate', 'blue', 'green', 'amber', 'red', 'violet'];

export const defaultPipelineStages = (): PipelineStage[] => [
  { id: 'stage-cualificacion', name: 'Cualificación', order: 0, kind: 'open', tone: 0, archived: false, probability: 20, wipLimit: null, wipMode: 'warn', slaDays: 14, weeklyGoalCount: null, weeklyGoalAmount: null },
  { id: 'stage-propuesta', name: 'Propuesta', order: 1, kind: 'open', tone: 1, archived: false, probability: 40, wipLimit: null, wipMode: 'warn', slaDays: 14, weeklyGoalCount: null, weeklyGoalAmount: null },
  { id: 'stage-negociacion', name: 'Negociación', order: 2, kind: 'open', tone: 2, archived: false, probability: 60, wipLimit: null, wipMode: 'warn', slaDays: 10, weeklyGoalCount: null, weeklyGoalAmount: null },
  { id: 'stage-ganada', name: 'Ganada', order: 3, kind: 'won', tone: 3, archived: false, probability: 100, wipLimit: null, wipMode: 'warn', slaDays: null, weeklyGoalCount: null, weeklyGoalAmount: null },
  { id: 'stage-perdida', name: 'Perdida', order: 4, kind: 'lost', tone: 4, archived: false, probability: 0, wipLimit: null, wipMode: 'warn', slaDays: null, weeklyGoalCount: null, weeklyGoalAmount: null },
];

export const defaultLostReasons = (): LostReason[] => [
  { id: 'lost-precio', name: 'Precio', archived: false },
  { id: 'lost-timing', name: 'Timing', archived: false },
  { id: 'lost-competencia', name: 'Competencia', archived: false },
  { id: 'lost-sin-respuesta', name: 'Sin respuesta', archived: false },
  { id: 'lost-otro', name: 'Otro', archived: false },
];

/** Legacy display names → stable ids (and older CRM labels). */
const legacyNameToId: Record<string, string> = {
  Cualificación: 'stage-cualificacion',
  Propuesta: 'stage-propuesta',
  Negociación: 'stage-negociacion',
  Ganada: 'stage-ganada',
  Perdida: 'stage-perdida',
  'Lead Discovery': 'stage-cualificacion',
  'Meeting Scheduled': 'stage-cualificacion',
  'Sales Qualified': 'stage-cualificacion',
  'Proposal sent & Negotiation': 'stage-propuesta',
  'Won & Ongoing': 'stage-ganada',
  Finnished: 'stage-ganada',
  'ReActivate in the future': 'stage-cualificacion',
  'Lost or Discarded': 'stage-perdida',
};

export function activeStages(state: StagesHolder) {
  return (state.pipelineStages || []).filter(stage => !stage.archived).sort((a, b) => a.order - b.order);
}

export function openStages(state: StagesHolder) {
  return activeStages(state).filter(stage => stage.kind === 'open');
}

export function stageOf(state: StagesHolder, stageId: string) {
  return (state.pipelineStages || []).find(stage => stage.id === stageId);
}

export function stageName(state: StagesHolder, stageId: string) {
  return stageOf(state, stageId)?.name || stageId;
}

export function firstOpenStageId(state: StagesHolder) {
  return openStages(state)[0]?.id || 'stage-cualificacion';
}

export function wonStageId(state: StagesHolder) {
  return activeStages(state).find(stage => stage.kind === 'won')?.id || 'stage-ganada';
}

export function lostStageId(state: StagesHolder) {
  return activeStages(state).find(stage => stage.kind === 'lost')?.id || 'stage-perdida';
}

export function resolveLegacyStageId(value: string) {
  if ((value || '').startsWith('stage-')) return value;
  return legacyNameToId[value] || 'stage-cualificacion';
}

export function normalizePipelineStage(raw: Partial<PipelineStage> & { id: string; name: string }): PipelineStage {
  const kind = raw.kind === 'won' || raw.kind === 'lost' ? raw.kind : 'open';
  return {
    id: raw.id,
    name: raw.name.trim(),
    order: Number.isFinite(raw.order) ? Number(raw.order) : 0,
    kind,
    tone: Number.isFinite(raw.tone) ? Number(raw.tone) : 0,
    archived: !!raw.archived,
    probability: kind === 'won' ? 100 : kind === 'lost' ? 0 : Math.min(100, Math.max(0, Number(raw.probability ?? 30))),
    wipLimit: raw.wipLimit == null || raw.wipLimit === ('' as unknown) ? null : Math.max(1, Number(raw.wipLimit)),
    wipMode: raw.wipMode === 'block' ? 'block' : 'warn',
    slaDays: raw.slaDays == null || raw.slaDays === ('' as unknown) ? null : Math.max(1, Number(raw.slaDays)),
    weeklyGoalCount: raw.weeklyGoalCount == null || raw.weeklyGoalCount === ('' as unknown) ? null : Math.max(1, Number(raw.weeklyGoalCount)),
    weeklyGoalAmount: raw.weeklyGoalAmount == null || raw.weeklyGoalAmount === ('' as unknown) ? null : Math.max(0, Number(raw.weeklyGoalAmount)),
  };
}

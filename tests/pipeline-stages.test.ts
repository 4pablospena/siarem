import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, emptyState, ensureState, daysInStage, seed, today, dateOffset, stageProbability } from '../lib/crm.ts';
import { isOpenOpportunity, weeklyStageProgress } from '../lib/pipeline.ts';
import { defaultPipelineStages } from '../lib/pipeline-stages.ts';

test('ensureState migrates legacy stage names to stageId and installs default map', () => {
  const raw = {
    ...emptyState(),
    pipelineStages: undefined,
    opportunities: [{
      id: 'o', demo: false, companyId: 'c', title: 'Deal', amount: 100, stage: 'Propuesta',
      closeDate: today(), nextStep: '', nextDate: '', createdAt: today(),
    }],
    companies: [{ id: 'c', demo: false, name: 'Acme', contact: '', email: '', phone: '', contactDays: 30 }],
  } as never;
  const state = ensureState(raw);
  assert.equal(state.pipelineStages.length, 5);
  assert.equal(state.opportunities[0].stageId, 'stage-propuesta');
  assert.ok(!('stage' in state.opportunities[0]));
});

test('owner can rename stages; archiving blocked when occupied', () => {
  let state = seed();
  const stages = state.pipelineStages.map(stage => stage.id === 'stage-propuesta' ? { ...stage, name: 'Oferta' } : stage);
  state = apply(state, { action: 'savePipelineStages', stages });
  assert.equal(state.pipelineStages.find(s => s.id === 'stage-propuesta')?.name, 'Oferta');
  assert.throws(() => apply(state, {
    action: 'savePipelineStages',
    stages: state.pipelineStages.map(stage => stage.id === 'stage-propuesta' ? { ...stage, archived: true } : stage),
  }), /archivar/);
});

test('tags and MRR persist on opportunities', () => {
  let state = seed();
  state = apply(state, {
    action: 'saveOpportunityTags',
    tags: [...state.opportunityTags, { id: 'tag-hot', name: 'Caliente', color: 'red', archived: false }],
  });
  const open = state.opportunities.find(o => o.stageId === 'stage-propuesta')!;
  state = apply(state, {
    action: 'save',
    kind: 'opportunities',
    record: { ...open, tagIds: ['tag-hot', 'demo-tag-prioridad'], mrr: 450 },
  });
  const saved = state.opportunities.find(o => o.id === open.id)!;
  assert.deepEqual(saved.tagIds.sort(), ['demo-tag-prioridad', 'tag-hot']);
  assert.equal(saved.mrr, 450);
});

test('stage transitions append history and daysInStage', () => {
  let state = seed();
  const open = state.opportunities.find(o => o.stageId === 'stage-propuesta')!;
  state = apply(state, { action: 'stage', id: open.id, stageId: 'stage-negociacion', expectedStageId: open.stageId });
  const moved = state.opportunities.find(o => o.id === open.id)!;
  assert.equal(moved.stageHistory.length, 1);
  assert.equal(moved.stageHistory[0].fromStageId, 'stage-propuesta');
  assert.equal(moved.stageHistory[0].toStageId, 'stage-negociacion');
  assert.equal(daysInStage(moved), 0);
});

test('lost stage requires reason; probability and weekly progress helpers', () => {
  let state = seed();
  const open = state.opportunities.find(o => o.stageId === 'stage-propuesta')!;
  assert.throws(() => apply(state, { action: 'stage', id: open.id, stageId: 'stage-perdida' }), /motivo/);
  state = apply(state, { action: 'stage', id: open.id, stageId: 'stage-perdida', lostReasonId: 'lost-precio' });
  assert.equal(state.opportunities.find(o => o.id === open.id)?.lostReasonId, 'lost-precio');
  assert.equal(isOpenOpportunity(state, state.opportunities.find(o => o.id === open.id)!), false);
  assert.equal(stageProbability(state, 'stage-propuesta'), 40);
  assert.equal(stageProbability(state, 'stage-ganada'), 100);
  const progress = weeklyStageProgress(state, 'stage-propuesta');
  assert.ok(progress);
  assert.ok(progress!.count >= 1);
});

test('WIP block prevents entering a full column; rank swaps order', () => {
  let state = emptyState();
  state.companies.push({ id: 'c', demo: false, name: 'Acme', contact: '', email: '', phone: '', contactDays: 30 });
  state.pipelineStages = defaultPipelineStages().map(stage => stage.id === 'stage-propuesta'
    ? { ...stage, wipLimit: 1, wipMode: 'block' as const }
    : stage);
  state = apply(state, {
    action: 'save', kind: 'opportunities',
    record: { id: 'a', demo: false, companyId: 'c', title: 'A', amount: 10, stageId: 'stage-propuesta', closeDate: dateOffset(5), nextStep: '', nextDate: '', createdAt: today(), tagIds: [], mrr: null, ownerUserId: '', lostReasonId: '', rank: 1, stageHistory: [] },
  });
  state = apply(state, {
    action: 'save', kind: 'opportunities',
    record: { id: 'b', demo: false, companyId: 'c', title: 'B', amount: 20, stageId: 'stage-cualificacion', closeDate: dateOffset(5), nextStep: '', nextDate: '', createdAt: today(), tagIds: [], mrr: null, ownerUserId: '', lostReasonId: '', rank: 1, stageHistory: [] },
  });
  assert.throws(() => apply(state, { action: 'stage', id: 'b', stageId: 'stage-propuesta' }), /WIP/);
  state = apply(state, {
    action: 'save', kind: 'opportunities',
    record: { id: 'c1', demo: false, companyId: 'c', title: 'C', amount: 5, stageId: 'stage-cualificacion', closeDate: dateOffset(5), nextStep: '', nextDate: '', createdAt: today(), tagIds: [], mrr: null, ownerUserId: '', lostReasonId: '', rank: 2, stageHistory: [] },
  });
  const before = state.opportunities.find(o => o.id === 'b')!.rank;
  state = apply(state, { action: 'rankOpportunity', id: 'b', direction: 'down' });
  assert.notEqual(state.opportunities.find(o => o.id === 'b')!.rank, before);
});

test('drag reorder places cards before a target and across stages; patch sets priority and owner', () => {
  let state = emptyState();
  state.companies.push({ id: 'c', demo: false, name: 'Acme', contact: '', email: '', phone: '', contactDays: 30 });
  for (const [id, stageId] of [['a', 'stage-propuesta'], ['b', 'stage-propuesta'], ['c1', 'stage-propuesta'], ['x', 'stage-cualificacion']]) {
    state = apply(state, {
      action: 'save', kind: 'opportunities',
      record: { id, demo: false, companyId: 'c', title: id, amount: 10, stageId, closeDate: dateOffset(5), nextStep: '', nextDate: '', createdAt: today(), tagIds: [], mrr: null, ownerUserId: '', lostReasonId: '', rank: 0, stageHistory: [] },
    });
  }
  const order = (stageId: string) => state.opportunities.filter(o => o.stageId === stageId).sort((p, q) => p.rank - q.rank).map(o => o.id);
  state = apply(state, { action: 'rankOpportunity', id: 'c1', beforeId: 'a' });
  assert.deepEqual(order('stage-propuesta'), ['c1', 'a', 'b']);
  state = apply(state, { action: 'rankOpportunity', id: 'c1', beforeId: null });
  assert.deepEqual(order('stage-propuesta'), ['a', 'b', 'c1']);
  state = apply(state, { action: 'stage', id: 'x', stageId: 'stage-propuesta', beforeId: 'b' });
  assert.deepEqual(order('stage-propuesta'), ['a', 'x', 'b', 'c1']);
  state = apply(state, { action: 'patchOpportunity', id: 'a', priority: 3, ownerUserId: 'user-1' });
  const a = state.opportunities.find(o => o.id === 'a')!;
  assert.equal(a.priority, 3);
  assert.equal(a.ownerUserId, 'user-1');
  assert.throws(() => apply(state, { action: 'patchOpportunity', id: 'a', priority: 5 }), /prioridad/);
});

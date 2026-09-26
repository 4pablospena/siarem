import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../lib/crm.ts';
import type { State } from '../lib/crm.ts';
import { pipelineNextAction } from '../lib/pipeline.ts';
const opportunity: State['opportunities'][number] = {
  id: 'opportunity', demo: false, companyId: 'company', title: 'Proposal', stage: 'Propuesta',
  amount: 1000, closeDate: '2026-10-01', createdAt: '2026-09-01',
  nextStep: 'Review proposal', nextDate: '2026-09-29',
};
test('pipeline shows the earliest pending follow-up, excluding completed and unrelated tasks', () => {
  const state = emptyState();
  state.followups = [
    { id: 'later', opportunityId: opportunity.id, title: 'Later', dueDate: '2026-09-28', done: false, demo: false },
    { id: 'done', opportunityId: opportunity.id, title: 'Done', dueDate: '2026-09-01', done: true, demo: false },
    { id: 'unrelated', opportunityId: 'other', title: 'Other', dueDate: '2026-09-01', done: false, demo: false },
    { id: 'next', opportunityId: opportunity.id, title: 'Call buyer', dueDate: '2026-09-27', done: false, demo: false },
  ];
  const before = structuredClone(state);
  assert.deepEqual(pipelineNextAction(state, opportunity), { title: 'Call buyer', date: '2026-09-27', taskId: 'next', defined: true });
  assert.deepEqual(state, before);
});
test('pipeline uses the saved next step and leaves missing dates empty', () => {
  assert.deepEqual(pipelineNextAction(emptyState(), opportunity), { title: 'Review proposal', date: '2026-09-29', taskId: null, defined: true });
  assert.deepEqual(pipelineNextAction(emptyState(), { ...opportunity, nextStep: '', nextDate: '' }), { title: 'Definir siguiente paso', date: '', taskId: null, defined: false });
});
test('follow-up draft names the same next action as the record, never the placeholder', async () => {
  const { followupDraft } = await import('../lib/pipeline.ts');
  const state = emptyState();
  state.companies = [{ id: 'company', demo: false, name: 'Acme', contact: 'Ana', email: '', phone: '', contactDays: 30 }];
  state.followups = [{ id: 'task', opportunityId: opportunity.id, title: 'Call buyer', dueDate: '2026-09-27', done: false, demo: false }];
  assert.match(followupDraft(state, opportunity), /^Hola, Ana:[\s\S]*Nos queda pendiente: Call buyer\./);
  const blank = followupDraft(emptyState(), { ...opportunity, nextStep: '' });
  assert.match(blank, /^Hola:/);
  assert.doesNotMatch(blank, /Definir siguiente paso/);
});
test('Hermes brief lists only open work, with the shared next action', async () => {
  const { hermesBrief } = await import('../app/hermes-panel.tsx');
  const state = emptyState();
  state.companies = [{ id: 'company', demo: false, name: 'Acme', contact: '', email: '', phone: '', contactDays: 30 }];
  state.opportunities = [{ ...opportunity, nextDate: '2020-01-01' }, { ...opportunity, id: 'won', title: 'Closed deal', stage: 'Ganada', nextDate: '2020-01-01' }];
  const brief = hermesBrief('Foco', state);
  assert.match(brief, /Proposal en Propuesta, .*siguiente acción Review proposal \(2020-01-01\)/);
  assert.doesNotMatch(brief, /Closed deal/);
});
test('closed opportunities do not present stale follow-up instructions', () => {
  for (const stage of ['Ganada', 'Perdida'] as const) assert.equal(pipelineNextAction(emptyState(), { ...opportunity, stage }), null);
});

test('Focus excludes closed opportunities even if they retain overdue work', async () => {
  const { seed } = await import('../lib/crm.ts');
  const { pipelineOpportunities } = await import('../lib/pipeline.ts');
  const state = seed();
  for (const stage of ['Ganada', 'Perdida'] as const) {
    state.opportunities[0].stage = stage;
    for (const filter of ['all', 'healthy', '1', '2']) {
      assert.ok(!pipelineOpportunities(state, { focus: true, filter }).some(item => item.id === state.opportunities[0].id));
    }
    assert.ok(pipelineOpportunities(state).some(item => item.id === state.opportunities[0].id));
  }
});
test('Focus orders equally urgent opportunities by the pending task, and searches the same action as CSV', async () => {
  const { seed, dateOffset } = await import('../lib/crm.ts');
  const { pipelineOpportunities } = await import('../lib/pipeline.ts');
  const { csvExport } = await import('../lib/export.ts');
  const state = seed();
  const base = state.opportunities[0];
  state.opportunities = [
    { ...base, id: 'a', title: 'Alpha', stage: 'Propuesta', nextDate: dateOffset(-10) },
    { ...base, id: 'b', title: 'Beta', stage: 'Propuesta', nextDate: dateOffset(-1) },
  ];
  state.followups = [
    { id: 'a-task', opportunityId: 'a', title: 'Acción Ámbar', dueDate: dateOffset(-2), done: false, demo: false },
    { id: 'b-task', opportunityId: 'b', title: 'Call first', dueDate: dateOffset(-5), done: false, demo: false },
  ];
  assert.deepEqual(pipelineOpportunities(state, { focus: true }).map(item => item.id), ['b', 'a']);
  assert.deepEqual(pipelineOpportunities(state, { focus: true, query: 'ambar' }).map(item => item.id), ['a']);
  const csv = csvExport(state, 'Foco', 'ambar');
  assert.match(csv, /Alpha/);
  assert.doesNotMatch(csv, /Beta/);
  assert.match(csv, /Acción Ámbar/);
  assert.ok(csv.includes(dateOffset(-2)));
  assert.equal(pipelineOpportunities(state, { company: 'other-company' }).length, 0);
});

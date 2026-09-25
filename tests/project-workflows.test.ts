import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, apply, ensureState } from '../lib/crm.ts';
import { projectTasks } from '../lib/project-tasks.ts';
import { roadmapScale } from '../lib/roadmap.ts';
import { csvExport } from '../lib/export.ts';

function fixture() {
  let state = emptyState();
  for (const id of ['p1', 'p2']) state = apply(state, { action: 'save', kind: 'projects', record: { id, title: id } });
  for (const [id, projectId, status, title] of [['t1', 'p1', 'En curso', 'Revisión'], ['t2', 'p1', 'Hecho', 'Entrega'], ['t3', 'p2', 'En curso', 'Revisión privada']]) {
    state = apply(state, { action: 'save', kind: 'delivery', record: { id, projectId, status, title, done: false, assignee: 'María' } });
  }
  return state;
}

test('task search and CSV agree on project, accent-insensitive query and status', () => {
  const state = fixture();
  const tasks = projectTasks(state, 'p1', ' maria ', 'En curso');
  assert.deepEqual(tasks.map(task => task.id), ['t1']);
  const csv = csvExport(state, 'Proyectos', ' maria ', 'En curso', 'all', 'p1');
  assert.match(csv, /Revisión/);
  assert.doesNotMatch(csv, /Entrega|privada/);
  assert.match(csv, /Fecha objetivo/);
  assert.equal(projectTasks(state, 'p1', 'missing').length, 0);
  assert.throws(() => csvExport(state, 'Proyectos', '', 'all', 'all', 'outside'), /no existe/);
});

test('legacy tasks retain completed status and missing dates on repeated normalization', () => {
  const state = fixture();
  const legacy = JSON.parse(JSON.stringify(state));
  delete legacy.delivery[1].status;
  delete legacy.delivery[1].startDate;
  delete legacy.delivery[1].dueDate;
  const original = JSON.stringify(legacy);
  const normalized = ensureState(legacy);
  assert.equal(normalized.delivery[1].status, 'Hecho');
  assert.equal(normalized.delivery[1].dueDate, '');
  assert.deepEqual(ensureState(normalized), normalized);
  assert.equal(JSON.stringify(legacy), original);
});

test('timeline uses inclusive days and handles a year boundary and one-sided dates', () => {
  const state = fixture();
  assert.equal(roadmapScale(state.delivery), null);
  state.delivery[0].startDate = '2026-12-31';
  state.delivery[0].dueDate = '2027-01-02';
  state.delivery[1].dueDate = '2027-02-01';
  const scale = roadmapScale(state.delivery)!;
  assert.ok(scale.position('2026-12-31') > 0);
  assert.ok(scale.position('2027-02-01') < 100);
  assert.equal(scale.duration('2026-12-31', '2027-01-02'), 3 * scale.duration('2026-12-31', '2026-12-31'));
  assert.equal(scale.ticks.length, 5);
  assert.match(scale.ticks.at(-1)!.date, /^2027-/);
});

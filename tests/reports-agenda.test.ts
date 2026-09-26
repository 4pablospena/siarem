import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed, apply, today, dateOffset } from '../lib/crm.ts';
import { businessReport, reportCsv } from '../lib/reports.ts';
import { isOpenOpportunity } from '../lib/pipeline.ts';
import { agendaWeek, thisWeekAhead, weekRange } from '../lib/agenda.ts';

test('business report exposes funnel, closings, collections and stuck work', () => {
  const state = seed();
  const report = businessReport(state);
  assert.ok(report.funnel.length >= 3);
  assert.equal(report.funnel.reduce((n, row) => n + row.count, 0), state.opportunities.filter(o => isOpenOpportunity(state, o)).length);
  assert.ok(reportCsv(state).includes('Embudo'));
  assert.ok(report.stuck.length >= 0);
});

test('agenda week groups dated work and skips empty days', () => {
  let state = seed();
  const range = weekRange(today());
  const upcoming = range.days.find(day => day >= today()) || range.end;
  state = apply(state, { action: 'save', kind: 'followups', record: { id: 'agenda-fu', demo: false, opportunityId: state.opportunities[0].id, title: 'Llamar esta semana', dueDate: upcoming, done: false } });
  const { items } = agendaWeek(state, today());
  assert.ok(items.some(item => item.title === 'Llamar esta semana' && item.date === upcoming));
  assert.ok(thisWeekAhead(state).some(item => item.id.startsWith('followup-')));
});

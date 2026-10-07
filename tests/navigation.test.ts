import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultNavigation, navigationKey, navigationMode, navigationSearch, readNavigation } from '../lib/navigation.ts';

test('project link restores the project, lens and search after reload', () => {
  for (const projectLens of ['board', 'people', 'list', 'weeks'] as const) {
    const expected = { ...defaultNavigation, view: 'Proyectos' as const, projectFocus: 'p/á & 12', projectLens, query: 'diseño & desarrollo', projectTagFilter: 'tag-1', projectAssigneeFilter: 'member-1' };
    assert.deepEqual(readNavigation(navigationSearch(expected)), expected);
  }
});
test('pipeline filters and invoice ordering survive shareable links', () => {
  const expected = { ...defaultNavigation, view: 'Pipeline' as const, query: 'Acme', companyFilter: 'company-1', tagFilter: 'tag-2', ownerFilter: 'user-1', minMrr: 0, mineOnly: true, overdueOnly: true, compactCards: true };
  assert.deepEqual(readNavigation(navigationSearch(expected)), expected);
  assert.equal(readNavigation('?view=Facturas&filter=overdue&sort=amount').invoiceSort, 'amount');
  assert.equal(readNavigation('?view=Facturas&filter=overdue').filter, 'overdue');
});
test('invalid navigation cannot select an unknown view or inject an invalid lens', () => {
  const actual = readNavigation('?view=Unknown&project=secret&tab=broken&mrr=Infinity&sort=wrong&mine=false');
  assert.deepEqual(actual, defaultNavigation);
  for (const mrr of ['-5', 'NaN', ' ', '']) assert.equal(readNavigation(`?mrr=${mrr}`).minMrr, null);
  assert.equal(readNavigation('?view=Proyectos&tab=broken').projectLens, 'board');
  assert.equal(readNavigation(`?q=${'x'.repeat(2000)}`).query.length, 500);
});
test('history pushes destinations and project lenses, but replaces filter keystrokes', () => {
  const pipeline = { ...defaultNavigation, view: 'Pipeline' as const };
  assert.equal(navigationMode(defaultNavigation, pipeline), 'push');
  assert.equal(navigationMode(pipeline, { ...pipeline, query: 'Acme', minMrr: 200 }), 'replace');
  const project = { ...defaultNavigation, view: 'Proyectos' as const, projectFocus: 'p1' };
  assert.equal(navigationMode({ ...project, projectFocus: null }, project), 'push');
  assert.equal(navigationMode(project, { ...project, projectLens: 'weeks' }), 'push');
  assert.notEqual(navigationKey(project), navigationKey({ ...project, projectFocus: null }));
});
test('default links remain clean and only recognized parameters are serialized', () => {
  assert.equal(navigationSearch(defaultNavigation), '');
  assert.equal(navigationSearch(readNavigation('?view=Pipeline&unrelated=ignored')), '?view=Pipeline');
});

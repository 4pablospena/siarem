import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, emptyState, ensureState } from '../lib/crm.ts';

test('projects keep tags and assignee, and archiving a tag removes it', () => {
  let state = emptyState();
  state = apply(state, {
    action: 'saveProjectTags',
    tags: [
      { id: 'web', name: 'Web', color: 'blue', archived: false },
      { id: 'old', name: 'Antiguo', color: 'slate', archived: false },
    ],
  });
  state = apply(state, {
    action: 'save', kind: 'projects',
    record: { id: 'p', title: 'Sitio', body: '', orderId: '', tagIds: ['web', 'missing'], assigneeUserId: 'user-1' },
  });
  assert.deepEqual(state.projects[0].tagIds, ['web']);
  assert.equal(state.projects[0].assigneeUserId, 'user-1');
  state = apply(state, {
    action: 'saveProjectTags',
    tags: [{ id: 'web', name: 'Web', color: 'blue', archived: true }],
  });
  assert.deepEqual(state.projects[0].tagIds, []);
  const legacy = ensureState({ projects: [{ id: 'old', demo: false, title: 'Viejo', orderId: '', body: 'Nota' }] } as never);
  assert.deepEqual(legacy.projects[0].tagIds, []);
  assert.equal(legacy.projects[0].assigneeUserId, '');
});

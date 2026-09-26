import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed, apply, ensureState, emptyState } from '../lib/crm.ts';

test('company contact migrates to a primary person once', () => {
  const state = emptyState();
  state.companies.push({ id: 'c1', demo: false, name: 'Acme', email: 'a@x.com', contact: 'Ana', phone: '600', contactDays: 30, taxId: '', address: '', paymentDays: 30, companyRole: 'client' });
  const next = ensureState(state);
  assert.equal(next.people.length, 1);
  assert.equal(next.people[0].name, 'Ana');
  assert.equal(ensureState(next).people.length, 1);
});

test('catalog line can fill a quote and convertLead creates a person', () => {
  const state = seed();
  assert.ok(state.services.length >= 1);
  const svc = state.services[0];
  const quote = apply(state, {
    action: 'save',
    kind: 'quotes',
    record: {
      id: 'q-catalog',
      demo: false,
      opportunityId: state.opportunities[0].id,
      title: 'Desde catálogo',
      lines: [{ description: svc.name, quantity: 1, price: svc.price, policy: svc.policy, tasks: svc.tasks }],
    },
  });
  assert.equal(quote.quotes.find(q => q.id === 'q-catalog')?.lines[0].description, svc.name);
  const before = state.people.length;
  const converted = apply(state, { action: 'convertLead', id: 'demo-lead' });
  assert.ok(converted.people.length >= before);
  assert.ok(converted.people.some(p => p.name === 'Laura Martín' || p.email === 'laura@nubia.example'));
});

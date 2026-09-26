import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, emptyState, today, dateOffset, projectCost, total, type Command, type State } from '../lib/crm.ts';
import {
  agingBuckets, balance, billedBase, collected, pendingHours, projectInvoicedRevenue, remainingBase,
} from '../lib/invoices.ts';

function fixture() {
  let s = emptyState();
  const save = (kind: string, record: unknown) => { s = apply(s, { action: 'save', kind, record } as Command); };
  save('companies', { id: 'c', demo: false, name: 'Cliente', contact: '', email: 'c@example.com', phone: '', contactDays: 30, taxId: 'B1', address: 'Calle 1', paymentDays: 30 });
  save('opportunities', { id: 'o', demo: false, companyId: 'c', title: 'Servicio', amount: 1000, stageId: 'stage-cualificacion', closeDate: dateOffset(5), nextStep: '', nextDate: '', createdAt: today(), tagIds: [], mrr: null, ownerUserId: '', lostReasonId: '', rank: 0, stageHistory: [] });
  save('quotes', { id: 'q', demo: false, opportunityId: 'o', title: 'Oferta', lines: [
    { description: 'Fijo', quantity: 1, price: 1000, policy: 'fixed', tasks: 'Preparar\nEntregar' },
    { description: 'Por horas', quantity: 10, price: 90, policy: 'hours', tasks: 'Soporte' },
  ] });
  return apply(s, { action: 'confirm', id: 'q' });
}

const inv = (s: State, policy: string, rest: Partial<Command> = {}) =>
  apply(s, { action: 'invoice', id: s.orders[0].id, policy, date: today(), dueDate: dateOffset(30), ...rest });

test('partial payment, second payment and excess are rejected', () => {
  let s = inv(fixture(), 'fixed', { vatRate: 21 });
  const invoice = s.invoices[0];
  assert.equal(invoice.base, 1000);
  assert.equal(invoice.amount, 1210);
  assert.equal(balance(s, invoice), 1210);
  s = apply(s, { action: 'pay', id: invoice.id, date: today(), amount: 500, method: 'transfer' });
  assert.equal(s.invoices[0].paid, false);
  assert.equal(balance(s, s.invoices[0]), 710);
  assert.equal(collected(s, invoice.id), 500);
  assert.throws(() => apply(s, { action: 'pay', id: invoice.id, date: today(), amount: 711 }), /saldo/);
  s = apply(s, { action: 'pay', id: invoice.id, date: today(), amount: 710, method: 'card', note: 'resto' });
  assert.equal(s.invoices[0].paid, true);
  assert.equal(s.payments.length, 2);
  assert.equal(s.payments[1].method, 'card');
});

test('voiding a payment reopens the balance and allows collecting again', () => {
  let s = inv(fixture(), 'fixed');
  s = apply(s, { action: 'pay', id: s.invoices[0].id, date: today(), amount: 400 });
  const payId = s.payments[0].id;
  s = apply(s, { action: 'voidPayment', id: payId });
  assert.equal(s.payments.length, 0);
  assert.equal(s.invoices[0].paid, false);
  assert.equal(balance(s, s.invoices[0]), 1000);
  s = apply(s, { action: 'pay', id: s.invoices[0].id, date: today() });
  assert.equal(s.invoices[0].paid, true);
  assert.equal(s.payments[0].amount, 1000);
});

test('invoice series allocates sequential numbers and does not reuse gaps', () => {
  let s = inv(fixture(), 'fixed');
  const first = s.invoices[0].number;
  assert.match(first, /^F-\d{4}-001$/);
  s = apply(s, { action: 'creditInvoice', id: s.invoices[0].id });
  const credit = s.invoices.find(i => i.kind === 'credit')!;
  assert.match(credit.number, /^F-\d{4}-002$/);
  s = inv(s, 'fixed');
  const reissued = s.invoices.filter(i => i.kind !== 'credit' && i.status === 'issued').at(-1)!;
  assert.match(reissued.number, /^F-\d{4}-003$/);
  assert.notEqual(reissued.number, first);
});

test('draft invoices do not consume hours or remaining base', () => {
  let s = fixture();
  const task = s.delivery.find(t => t.lineIndex === 1)!;
  s = apply(s, { action: 'save', kind: 'hours', record: { id: 'h', taskId: task.id, date: today(), hours: 2, cost: 35, notes: '' } });
  s = inv(s, 'hours', { hourIds: ['h'], status: 'draft', vatRate: 21 });
  assert.equal(s.invoices[0].status, 'draft');
  assert.equal(s.invoices[0].number, '');
  assert.equal(pendingHours(s, s.orders[0].id).map(h => h.id).join(), 'h');
  assert.equal(remainingBase(s, s.orders[0].id, 'fixed'), 1000);
  s = apply(s, { action: 'issueInvoice', id: s.invoices[0].id });
  assert.equal(s.invoices[0].status, 'issued');
  assert.match(s.invoices[0].number, /^F-/);
  assert.equal(pendingHours(s, s.orders[0].id).length, 0);
  assert.equal(s.invoices[0].amount, 217.8);
});

test('VAT on the invoice does not inflate the order base remaining', () => {
  let s = inv(fixture(), 'fixed', { vatRate: 21 });
  assert.equal(billedBase(s, s.orders[0].id, 'fixed'), 1000);
  assert.equal(remainingBase(s, s.orders[0].id, 'fixed'), 0);
  assert.equal(s.invoices[0].amount, 1210);
  assert.throws(() => inv(s, 'fixed', { vatRate: 0 }), /pendiente/);
});

test('credit note frees hours and remaining base', () => {
  let s = fixture();
  const task = s.delivery.find(t => t.lineIndex === 1)!;
  s = apply(s, { action: 'save', kind: 'hours', record: { id: 'h', taskId: task.id, date: today(), hours: 1, cost: 40, notes: '' } });
  s = inv(s, 'hours', { hourIds: ['h'] });
  assert.equal(pendingHours(s, s.orders[0].id).length, 0);
  s = apply(s, { action: 'creditInvoice', id: s.invoices[0].id });
  assert.equal(s.invoices.find(i => i.hourIds.includes('h') && i.kind !== 'credit')!.status, 'void');
  assert.equal(pendingHours(s, s.orders[0].id).map(h => h.id).join(), 'h');
  s = inv(s, 'hours', { hourIds: ['h'] });
  assert.equal(s.invoices.filter(i => i.kind !== 'credit' && i.status === 'issued').at(-1)!.amount, 90);
});

test('aging buckets split open balances by due date', () => {
  let s = inv(fixture(), 'fixed', { date: dateOffset(-40), dueDate: dateOffset(-10) });
  s = apply(s, { action: 'pay', id: s.invoices[0].id, date: today(), amount: 200 });
  const aging = agingBuckets(s, today());
  assert.equal(aging.pending, 800);
  assert.equal(aging.d1_30.count, 1);
  assert.equal(aging.d1_30.amount, 800);
  assert.equal(aging.current.count, 0);
});

test('project margin uses issued invoice totals, not the order', () => {
  let s = fixture();
  const project = s.projects[0];
  assert.equal(projectInvoicedRevenue(s, project.orderId), 0);
  assert.equal(projectInvoicedRevenue(s, project.orderId) - projectCost(s, project.id), 0);
  s = apply(s, { action: 'save', kind: 'hours', record: { id: 'h', taskId: s.delivery[0].id, date: today(), hours: 2, cost: 50, notes: '' } });
  assert.equal(projectCost(s, project.id), 100);
  assert.equal(projectInvoicedRevenue(s, project.orderId) - projectCost(s, project.id), -100);
  s = inv(s, 'fixed', { vatRate: 21 });
  assert.equal(projectInvoicedRevenue(s, project.orderId), 1210);
  assert.equal(projectInvoicedRevenue(s, project.orderId) - projectCost(s, project.id), 1110);
  assert.equal(total(s.orders[0].lines), 1900);
});

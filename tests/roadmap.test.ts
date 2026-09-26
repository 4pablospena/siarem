import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, emptyState, today, dateOffset, projectCost, type Command, type State } from '../lib/crm.ts';
import { purchaseBalance, projectPurchaseCost } from '../lib/purchases.ts';
import { parseInvoiceText } from '../lib/blob-store.ts';
import { contractsMrr } from '../lib/contracts.ts';
import { putBlob, getBlob } from '../lib/blob-store.ts';

function base() {
  let s = emptyState();
  const save = (kind: string, record: unknown) => { s = apply(s, { action: 'save', kind, record } as Command); };
  save('companies', { id: 'c', demo: false, name: 'Cliente', contact: '', email: 'c@x.com', phone: '', contactDays: 30, taxId: 'B11111111', address: '', paymentDays: 30, companyRole: 'both' });
  save('companies', { id: 'sup', demo: false, name: 'Proveedor', contact: '', email: 'p@x.com', phone: '', contactDays: 30, taxId: 'B22222222', address: '', paymentDays: 30, companyRole: 'supplier' });
  save('opportunities', { id: 'o', demo: false, companyId: 'c', title: 'Opp', amount: 1000, stageId: 'stage-cualificacion', closeDate: dateOffset(5), nextStep: '', nextDate: '', createdAt: today(), tagIds: [], mrr: null, ownerUserId: '', lostReasonId: '', rank: 0, stageHistory: [] });
  save('quotes', { id: 'q', demo: false, opportunityId: 'o', title: 'Oferta', lines: [
    { description: 'Servicio', quantity: 1, price: 500, policy: 'fixed', tasks: 'Hacer', itemId: '' },
    { description: 'Producto', quantity: 2, price: 100, policy: 'goods', tasks: '', itemId: 'prod' },
  ] });
  save('services', { id: 'prod', demo: false, name: 'Cable', price: 100, kind: 'product', policy: 'goods', tasks: '', sku: 'CAB-1', stock: 10, minStock: 2, cost: 40, unit: 'ud' });
  save('services', { id: 'svc', demo: false, name: 'Consultoria', price: 500, kind: 'service', policy: 'fixed', tasks: 'Analizar\nEntregar', sku: '', stock: 0, minStock: 0, cost: 0, unit: 'ud' });
  return s;
}

test('purchase payment partial void and project margin cost', () => {
  let s = apply(base(), { action: 'confirm', id: 'q' });
  const projectId = s.projects[0].id;
  s = apply(s, { action: 'save', kind: 'purchases', record: {
    id: 'pur1', demo: false, supplierCompanyId: 'sup', projectId, orderId: '', title: 'Material', number: 'C-1',
    date: today(), dueDate: dateOffset(15), amount: 121, base: 100, vatRate: 21, vatAmount: 21,
    status: 'recorded', lines: [{ description: 'Cable', quantity: 1, price: 100, amount: 100, itemId: 'prod' }],
    paid: false, notes: '', attachmentKey: '', ocrMeta: '',
  } });
  assert.equal(s.services.find(i => i.id === 'prod')!.stock, 9); // confirm -2 + purchase +1 = 10-2+1=9
  assert.equal(projectPurchaseCost(s, projectId), 100);
  s = apply(s, { action: 'payPurchase', id: 'pur1', date: today(), amount: 50 });
  assert.equal(purchaseBalance(s, s.purchases[0]), 71);
  assert.equal(s.purchases[0].paid, false);
  const payId = s.purchasePayments[0].id;
  s = apply(s, { action: 'voidPurchasePayment', id: payId });
  assert.equal(s.purchasePayments.length, 0);
  s = apply(s, { action: 'payPurchase', id: 'pur1', date: today() });
  assert.equal(s.purchases[0].paid, true);
  assert.ok(projectCost(s, projectId) >= 100);
});

test('confirm order decrements product stock and skips delivery for goods', () => {
  let s = apply(base(), { action: 'confirm', id: 'q' });
  assert.equal(s.services.find(i => i.id === 'prod')!.stock, 8);
  assert.ok(s.delivery.every(t => s.orders[0].lines[t.lineIndex].policy !== 'goods'));
  assert.ok(s.stockMoves.some(m => m.reason === 'sale' && m.delta === -2));
});

test('insufficient stock blocks confirm', () => {
  let s = base();
  s = apply(s, { action: 'save', kind: 'services', record: { ...s.services.find(i => i.id === 'prod')!, stock: 1 } });
  assert.throws(() => apply(s, { action: 'confirm', id: 'q' }), /Stock insuficiente/);
});

test('ocr text parse suggests supplier by tax id', () => {
  const draft = parseInvoiceText('Factura F-99\nNIF B22222222\nFecha 2026-01-15\nBase 100,00\nTotal 121,00');
  assert.equal(draft.taxId, 'B22222222');
  assert.ok(draft.number);
  assert.ok(draft.amount >= 100);
});

test('blob store roundtrip', async () => {
  const key = 'test/blob.bin';
  const bytes = new TextEncoder().encode('hola factura');
  await putBlob(key, bytes, 'text/plain');
  const got = await getBlob(key);
  assert.ok(got);
  assert.equal(new TextDecoder().decode(got!.bytes), 'hola factura');
});

test('contracts mrr renew and recurring invoice', () => {
  let s = apply(base(), { action: 'confirm', id: 'q' });
  s = apply(s, { action: 'save', kind: 'contracts', record: {
    id: 'ct1', demo: false, companyId: 'c', opportunityId: 'o', orderId: s.orders[0].id,
    title: 'Retainer', startDate: today(), endDate: dateOffset(365), renewalDate: dateOffset(30),
    mrr: 200, status: 'active', notes: '',
  } });
  assert.equal(contractsMrr(s), 200);
  s = apply(s, { action: 'renewContract', id: 'ct1', amount: 12 });
  assert.ok(s.contracts[0].endDate > dateOffset(365));
  s = apply(s, { action: 'save', kind: 'recurringInvoices', record: {
    id: 'r1', demo: false, orderId: s.orders[0].id, contractId: 'ct1', dayOfMonth: 1, vatRate: 0,
    policy: 'fixed', amount: 100, title: 'Cuota', nextDate: today(), active: true, issueAs: 'issued', lastPeriod: '',
  } });
  s = apply(s, { action: 'runRecurring', id: 'r1', date: today() });
  assert.ok(s.invoices.some(i => i.title.startsWith('F-') || i.number.startsWith('F-')));
  assert.equal(s.recurringInvoices[0].lastPeriod, today().slice(0, 7));
  assert.throws(() => apply(s, { action: 'runRecurring', id: 'r1', date: today() }), /periodo|Aún no toca/);
});

test('adjust stock and void purchase reverses stock', () => {
  let s = apply(base(), { action: 'confirm', id: 'q' });
  const before = s.services.find(i => i.id === 'prod')!.stock;
  s = apply(s, { action: 'save', kind: 'purchases', record: {
    id: 'pur2', demo: false, supplierCompanyId: 'sup', projectId: '', orderId: '', title: 'Entrada', number: 'C-2',
    date: today(), dueDate: dateOffset(10), amount: 50, base: 50, vatRate: 0, vatAmount: 0,
    status: 'recorded', lines: [{ description: 'Cable', quantity: 3, price: 50 / 3, amount: 50, itemId: 'prod' }],
    paid: false, notes: '', attachmentKey: '', ocrMeta: '',
  } });
  assert.equal(s.services.find(i => i.id === 'prod')!.stock, before + 3);
  s = apply(s, { action: 'voidPurchase', id: 'pur2' });
  assert.equal(s.purchases.find(p => p.id === 'pur2')!.status, 'void');
  assert.equal(s.services.find(i => i.id === 'prod')!.stock, before);
  s = apply(s, { action: 'adjustStock', itemId: 'prod', delta: 5, note: 'Inventario' });
  assert.equal(s.services.find(i => i.id === 'prod')!.stock, before + 5);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed, today } from '../lib/crm.ts';
import { runBotAction, canManageTeam, canDeleteDemo } from '../lib/bot-actions.ts';

test('owner manages team and demo; member cannot', () => {
  assert.equal(canManageTeam('owner'), true);
  assert.equal(canManageTeam('member'), false);
  assert.equal(canDeleteDemo('owner'), true);
  assert.equal(canDeleteDemo('member'), false);
});

test('bot actions move stage, create followup, pay invoice, and stay idempotent', () => {
  const state = seed();
  const open = state.opportunities.find(o => o.stageId === 'stage-propuesta')!;
  const staged = runBotAction(state, 'member', 'Ana', 1, {
    requestId: '11111111-1111-1111-1111-111111111111',
    kind: 'stage',
    opportunityId: open.id,
    stageId: 'stage-negociacion',
    expectedStageId: open.stageId,
  });
  assert.equal(staged.state.opportunities.find(o => o.id === open.id)?.stageId, 'stage-negociacion');
  assert.equal(staged.replayed, false);
  const again = runBotAction(staged.state, 'member', 'Ana', 2, {
    requestId: '11111111-1111-1111-1111-111111111111',
    kind: 'stage',
    opportunityId: open.id,
    stageId: 'stage-ganada',
  });
  assert.equal(again.replayed, true);
  assert.equal(again.state.opportunities.find(o => o.id === open.id)?.stageId, 'stage-negociacion');

  const follow = runBotAction(staged.state, 'owner', 'Ana', 2, {
    requestId: '22222222-2222-2222-2222-222222222222',
    kind: 'followup',
    opportunityId: open.id,
    title: 'Llamada bot',
    dueDate: today(),
  });
  assert.ok(follow.state.followups.some(f => f.title === 'Llamada bot'));
  assert.equal(typeof follow.result.followupId, 'string');

  const invoice = staged.state.invoices.find(i => !i.paid)!;
  const paid = runBotAction(follow.state, 'member', 'Ana', 3, {
    requestId: '33333333-3333-3333-3333-333333333333',
    kind: 'pay',
    invoiceId: invoice.id,
    date: today(),
  });
  assert.ok(paid.state.invoices.find(i => i.id === invoice.id)?.paid);
  const replayPay = runBotAction(paid.state, 'member', 'Ana', 4, {
    requestId: '33333333-3333-3333-3333-333333333333',
    kind: 'pay',
    invoiceId: invoice.id,
    date: today(),
  });
  assert.equal(replayPay.replayed, true);
  assert.equal(paid.state.payments.filter(p => p.invoiceId === invoice.id).length, 1);
});

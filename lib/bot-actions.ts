import { apply, ensureState, today, type Command, type State, type BotActionRecord as CrmBotAction } from './crm.ts';
import { balance } from './invoices.ts';
import { activeStages, resolveLegacyStageId, stageName } from './pipeline-stages.ts';

export type TeamRole = 'owner' | 'member';

export type BotActionKind = 'stage' | 'followup' | 'pay';

export type BotActionRecord = CrmBotAction & {
  requestId: string;
  kind: BotActionKind;
  role: TeamRole;
  revision: number;
  result: Record<string, unknown>;
};

export type StateWithAudit = State;

export function canManageTeam(role: string) {
  return role === 'owner';
}

export function canDeleteDemo(role: string) {
  return role === 'owner';
}

export function canManagePipeline(role: string) {
  return role === 'owner';
}

export function canRunBotAction(role: string) {
  return role === 'owner' || role === 'member';
}

export type BotActionInput = {
  requestId: string;
  kind: BotActionKind;
  opportunityId?: string;
  stage?: string;
  stageId?: string;
  expectedStage?: string;
  expectedStageId?: string;
  lostReasonId?: string;
  title?: string;
  dueDate?: string;
  invoiceId?: string;
  date?: string;
};

/** Execute an authorized bot action with idempotency by requestId. */
export function runBotAction(
  input: State,
  role: TeamRole,
  user: string,
  revision: number,
  body: BotActionInput,
): { state: StateWithAudit; result: Record<string, unknown>; replayed: boolean } {
  if (!canRunBotAction(role)) throw new Error('Tu rol no puede ejecutar acciones del bot');
  const state = ensureState(input) as StateWithAudit;
  const actions = [...(state.botActions || [])];
  const prior = actions.find(item => item.requestId === body.requestId);
  if (prior) return { state, result: prior.result || {}, replayed: true };

  let command: Command;
  let result: Record<string, unknown>;

  if (body.kind === 'stage') {
    const stageId = body.stageId || (body.stage ? resolveLegacyStageId(body.stage) : '');
    if (!body.opportunityId || !stageId || !activeStages(state).some(stage => stage.id === stageId)) {
      throw new Error('Indica la oportunidad y una etapa válida del espacio');
    }
    command = {
      action: 'stage',
      id: body.opportunityId,
      stageId,
      expectedStageId: body.expectedStageId || (body.expectedStage ? resolveLegacyStageId(body.expectedStage) : undefined),
      lostReasonId: body.lostReasonId,
      user,
    };
    const next = apply(state, command) as StateWithAudit;
    result = { kind: 'stage', opportunityId: body.opportunityId, stageId, stage: stageName(state, stageId) };
    next.botActions = [...actions, {
      id: crypto.randomUUID(),
      requestId: body.requestId,
      kind: 'stage',
      at: today(),
      user,
      role,
      revision,
      result,
    }].slice(-100);
    return { state: next, result, replayed: false };
  }

  if (body.kind === 'followup') {
    if (!body.opportunityId || !body.title?.trim() || !body.dueDate) {
      throw new Error('Indica oportunidad, título y fecha del seguimiento');
    }
    const id = crypto.randomUUID();
    command = {
      action: 'save',
      kind: 'followups',
      record: { id, demo: false, opportunityId: body.opportunityId, title: body.title.trim(), dueDate: body.dueDate, done: false },
    };
    const next = apply(state, command) as StateWithAudit;
    result = { kind: 'followup', followupId: id, opportunityId: body.opportunityId };
    next.botActions = [...actions, {
      id: crypto.randomUUID(),
      requestId: body.requestId,
      kind: 'followup' as const,
      at: today(),
      user,
      role,
      revision,
      result,
    }].slice(-100);
    return { state: next, result, replayed: false };
  }

  if (body.kind === 'pay') {
    if (!body.invoiceId || !body.date) throw new Error('Indica la factura y la fecha de cobro');
    const invoice = state.invoices.find(item => item.id === body.invoiceId);
    if (!invoice) throw new Error('La factura no existe');
    const due = balance(state, invoice);
    if (due <= 0) throw new Error('La factura ya está cobrada');
    command = { action: 'pay', id: body.invoiceId, date: body.date, amount: due };
    const next = apply(state, command) as StateWithAudit;
    const payment = [...next.payments].reverse().find(p => p.invoiceId === body.invoiceId);
    result = { kind: 'pay', invoiceId: body.invoiceId, paymentId: payment?.id };
    next.botActions = [...actions, {
      id: crypto.randomUUID(),
      requestId: body.requestId,
      kind: 'pay' as const,
      at: today(),
      user,
      role,
      revision,
      result,
    }].slice(-100);
    return { state: next, result, replayed: false };
  }

  throw new Error('Acción del bot no reconocida');
}

import { today, risk, projectCost, companyForOrder, eur, ensureState, isWonStage, isLostStage, stageProbability, round, type State } from './crm.ts';
import { isOpenOpportunity } from './pipeline.ts';
import { openStages } from './pipeline-stages.ts';
import { agingBuckets, balance, isIssued, projectInvoicedRevenue } from './invoices.ts';
import { purchaseAgingBuckets, purchaseBalance, isPurchaseRecorded } from './purchases.ts';
import { contractsMrr } from './contracts.ts';
import { lowStockItems } from './inventory.ts';

export type ReportStuck = {
  id: string;
  kind: 'opportunity' | 'followup' | 'invoice' | 'purchase' | 'stock' | 'contract';
  title: string;
  detail: string;
  companyId?: string;
  opportunityId?: string;
  invoiceId?: string;
  purchaseId?: string;
  projectId?: string;
  contractId?: string;
};

export type BusinessReport = {
  periodStart: string;
  periodEnd: string;
  funnel: { stage: string; stageId: string; count: number; amount: number }[];
  won: { count: number; amount: number };
  lost: { count: number; amount: number };
  openMrr: number;
  contractMrr: number;
  weightedForecast: number;
  lostReasons: { reasonId: string; name: string; count: number; amount: number }[];
  collectedThisMonth: { count: number; amount: number };
  invoicedThisMonth: { count: number; amount: number };
  paidPurchasesThisMonth: { count: number; amount: number };
  aging: ReturnType<typeof agingBuckets>;
  purchaseAging: ReturnType<typeof purchaseAgingBuckets>;
  margins: { projectId: string; title: string; revenue: number; cost: number; margin: number }[];
  stuck: ReportStuck[];
};

function monthStart(now = today()) {
  return `${now.slice(0, 7)}-01`;
}

/** Business snapshot for the Informes screen. Period defaults to current calendar month. */
export function businessReport(input: State, now = today()): BusinessReport {
  const s = ensureState(input);
  const periodStart = monthStart(now);
  const periodEnd = now;
  const open = s.opportunities.filter(o => isOpenOpportunity(s, o));
  const funnel = openStages(s).map(stage => {
    const rows = open.filter(o => o.stageId === stage.id);
    return { stage: stage.name, stageId: stage.id, count: rows.length, amount: rows.reduce((sum, o) => sum + o.amount, 0) };
  });
  const closedInPeriod = (kind: 'won' | 'lost') =>
    s.opportunities.filter(o => (kind === 'won' ? isWonStage(s, o.stageId) : isLostStage(s, o.stageId)) && o.closeDate >= periodStart && o.closeDate <= periodEnd);
  const wonRows = closedInPeriod('won');
  const lostRows = closedInPeriod('lost');
  const payments = s.payments.filter(p => p.date >= periodStart && p.date <= periodEnd);
  const purchasePays = (s.purchasePayments || []).filter(p => p.date >= periodStart && p.date <= periodEnd);
  const issued = s.invoices.filter(i => isIssued(i) && (i.kind || 'invoice') === 'invoice' && i.date >= periodStart && i.date <= periodEnd);
  const openMrr = round(open.reduce((sum, o) => sum + (o.mrr || 0), 0));
  const contractMrr = contractsMrr(s);
  const weightedForecast = round(open.reduce((sum, o) => sum + o.amount * stageProbability(s, o.stageId) / 100, 0));
  const lostReasons = s.lostReasons.filter(reason => !reason.archived).map(reason => {
    const rows = lostRows.filter(o => o.lostReasonId === reason.id);
    return { reasonId: reason.id, name: reason.name, count: rows.length, amount: rows.reduce((sum, o) => sum + o.amount, 0) };
  }).filter(row => row.count > 0);
  const margins = s.projects.map(p => {
    const revenue = projectInvoicedRevenue(s, p.orderId || '');
    const cost = projectCost(s, p.id);
    return { projectId: p.id, title: p.title, revenue, cost, margin: revenue - cost };
  }).filter(row => row.revenue > 0 || row.cost > 0).sort((a, b) => a.margin - b.margin);
  const aging = agingBuckets(s, now);
  const purchaseAging = purchaseAgingBuckets(s, now);
  const stuck: ReportStuck[] = [];
  for (const o of open) {
    const level = risk(s, o, now).level;
    if (level > 0) stuck.push({
      id: `opp-${o.id}`,
      kind: 'opportunity',
      title: o.title,
      detail: risk(s, o, now).reason,
      companyId: o.companyId,
      opportunityId: o.id,
    });
  }
  for (const t of s.followups.filter(f => !f.done && f.dueDate < now)) {
    const o = s.opportunities.find(x => x.id === t.opportunityId);
    stuck.push({
      id: `fu-${t.id}`,
      kind: 'followup',
      title: t.title,
      detail: `Seguimiento vencido · ${t.dueDate}`,
      companyId: o?.companyId,
      opportunityId: t.opportunityId,
    });
  }
  for (const i of s.invoices.filter(inv => isIssued(inv) && !inv.paid && inv.dueDate < now)) {
    stuck.push({
      id: `inv-${i.id}`,
      kind: 'invoice',
      title: i.title,
      detail: `Cobro vencido · ${eur(balance(s, i))}`,
      companyId: companyForOrder(s, i.orderId),
      invoiceId: i.id,
    });
  }
  for (const purchase of (s.purchases || []).filter(p => isPurchaseRecorded(p) && !p.paid && p.dueDate < now)) {
    stuck.push({
      id: `pur-${purchase.id}`,
      kind: 'purchase',
      title: purchase.title,
      detail: `Pago vencido · ${eur(purchaseBalance(s, purchase))}`,
      companyId: purchase.supplierCompanyId,
      purchaseId: purchase.id,
      projectId: purchase.projectId || undefined,
    });
  }
  for (const item of lowStockItems(s)) {
    stuck.push({
      id: `stock-${item.id}`,
      kind: 'stock',
      title: item.name,
      detail: `Stock bajo · ${item.stock} (mín. ${item.minStock})`,
    });
  }
  for (const c of (s.contracts || []).filter(c => (c.status === 'active' || c.status === 'notice') && c.renewalDate <= now)) {
    stuck.push({
      id: `contract-${c.id}`,
      kind: 'contract',
      title: c.title,
      detail: `Renovación · ${c.renewalDate}`,
      companyId: c.companyId,
      contractId: c.id,
    });
  }
  return {
    periodStart,
    periodEnd,
    funnel,
    won: { count: wonRows.length, amount: wonRows.reduce((a, o) => a + o.amount, 0) },
    lost: { count: lostRows.length, amount: lostRows.reduce((a, o) => a + o.amount, 0) },
    openMrr,
    contractMrr,
    weightedForecast,
    lostReasons,
    collectedThisMonth: { count: payments.length, amount: payments.reduce((a, p) => a + p.amount, 0) },
    invoicedThisMonth: { count: issued.length, amount: issued.reduce((a, i) => a + i.amount, 0) },
    paidPurchasesThisMonth: { count: purchasePays.length, amount: purchasePays.reduce((a, p) => a + p.amount, 0) },
    aging,
    purchaseAging,
    margins,
    stuck,
  };
}

export function reportCsv(s: State, now = today()) {
  const r = businessReport(s, now);
  const rows: unknown[][] = [
    ['Sección', 'Concepto', 'Cantidad', 'Importe EUR', 'Detalle'],
    ...r.funnel.map(f => ['Embudo', f.stage, f.count, f.amount, '']),
    ['Cierre', 'Ganadas', r.won.count, r.won.amount, `${r.periodStart} · ${r.periodEnd}`],
    ['Cierre', 'Perdidas', r.lost.count, r.lost.amount, `${r.periodStart} · ${r.periodEnd}`],
    ['Forecast', 'MRR abierto', '', r.openMrr, ''],
    ['Forecast', 'MRR contratos', '', r.contractMrr, ''],
    ['Forecast', 'Importe ponderado', '', r.weightedForecast, ''],
    ...r.lostReasons.map(row => ['Motivo pérdida', row.name, row.count, row.amount, '']),
    ['Facturado', 'Periodo', r.invoicedThisMonth.count, r.invoicedThisMonth.amount, ''],
    ['Cobros', 'Periodo', r.collectedThisMonth.count, r.collectedThisMonth.amount, ''],
    ['Pagos compra', 'Periodo', r.paidPurchasesThisMonth.count, r.paidPurchasesThisMonth.amount, ''],
    ['Deuda', 'Pendiente total', '', r.aging.pending, ''],
    ['Deuda', 'No vencido', r.aging.current.count, r.aging.current.amount, ''],
    ['Deuda', '1-30 días', r.aging.d1_30.count, r.aging.d1_30.amount, ''],
    ['Deuda', '31-60 días', r.aging.d31_60.count, r.aging.d31_60.amount, ''],
    ['Deuda', '61-90 días', r.aging.d61_90.count, r.aging.d61_90.amount, ''],
    ['Deuda', '+90 días', r.aging.d90plus.count, r.aging.d90plus.amount, ''],
    ['Por pagar', 'Pendiente total', '', r.purchaseAging.pending, ''],
    ['Por pagar', 'No vencido', r.purchaseAging.current.count, r.purchaseAging.current.amount, ''],
    ['Por pagar', '1-30 días', r.purchaseAging.d1_30.count, r.purchaseAging.d1_30.amount, ''],
    ['Por pagar', '31-60 días', r.purchaseAging.d31_60.count, r.purchaseAging.d31_60.amount, ''],
    ['Por pagar', '61-90 días', r.purchaseAging.d61_90.count, r.purchaseAging.d61_90.amount, ''],
    ['Por pagar', '+90 días', r.purchaseAging.d90plus.count, r.purchaseAging.d90plus.amount, ''],
    ...r.margins.map(m => ['Margen', m.title, '', m.margin, `Ingresos ${m.revenue} · Coste ${m.cost}`]),
    ...r.stuck.map(item => ['Atasco', item.title, '', '', item.detail]),
  ];
  return '\uFEFF' + rows.map(row => row.map(value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"').join(';')).join('\r\n');
}

import { today, dateOffset, risk, total, projectCost, companyForOrder, eur, ensureState, isWonStage, isLostStage, stageProbability, round, type State } from './crm.ts';
import { isOpenOpportunity } from './pipeline.ts';
import { openStages } from './pipeline-stages.ts';

export type ReportStuck = {
  id: string;
  kind: 'opportunity' | 'followup' | 'invoice';
  title: string;
  detail: string;
  companyId?: string;
  opportunityId?: string;
  invoiceId?: string;
};

export type BusinessReport = {
  periodStart: string;
  periodEnd: string;
  funnel: { stage: string; stageId: string; count: number; amount: number }[];
  won: { count: number; amount: number };
  lost: { count: number; amount: number };
  openMrr: number;
  weightedForecast: number;
  lostReasons: { reasonId: string; name: string; count: number; amount: number }[];
  collectedThisMonth: { count: number; amount: number };
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
  const openMrr = round(open.reduce((sum, o) => sum + (o.mrr || 0), 0));
  const weightedForecast = round(open.reduce((sum, o) => sum + o.amount * stageProbability(s, o.stageId) / 100, 0));
  const lostReasons = s.lostReasons.filter(reason => !reason.archived).map(reason => {
    const rows = lostRows.filter(o => o.lostReasonId === reason.id);
    return { reasonId: reason.id, name: reason.name, count: rows.length, amount: rows.reduce((sum, o) => sum + o.amount, 0) };
  }).filter(row => row.count > 0);
  const margins = s.projects.map(p => {
    const order = s.orders.find(o => o.id === p.orderId);
    const revenue = order ? total(order.lines) : 0;
    const cost = projectCost(s, p.id);
    return { projectId: p.id, title: p.title, revenue, cost, margin: revenue - cost };
  }).filter(row => row.revenue > 0 || row.cost > 0).sort((a, b) => a.margin - b.margin);
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
  for (const i of s.invoices.filter(inv => !inv.paid && inv.dueDate < now)) {
    stuck.push({
      id: `inv-${i.id}`,
      kind: 'invoice',
      title: i.title,
      detail: `Cobro vencido · ${eur(i.amount)}`,
      companyId: companyForOrder(s, i.orderId),
      invoiceId: i.id,
    });
  }
  return {
    periodStart,
    periodEnd,
    funnel,
    won: { count: wonRows.length, amount: wonRows.reduce((a, o) => a + o.amount, 0) },
    lost: { count: lostRows.length, amount: lostRows.reduce((a, o) => a + o.amount, 0) },
    openMrr,
    weightedForecast,
    lostReasons,
    collectedThisMonth: { count: payments.length, amount: payments.reduce((a, p) => a + p.amount, 0) },
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
    ['Forecast', 'Importe ponderado', '', r.weightedForecast, ''],
    ...r.lostReasons.map(row => ['Motivo pérdida', row.name, row.count, row.amount, '']),
    ['Cobros', 'Mes en curso', r.collectedThisMonth.count, r.collectedThisMonth.amount, ''],
    ...r.margins.map(m => ['Margen', m.title, '', m.margin, `Ingresos ${m.revenue} · Coste ${m.cost}`]),
    ...r.stuck.map(item => ['Atasco', item.title, '', '', item.detail]),
  ];
  return '\uFEFF' + rows.map(row => row.map(value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"').join(';')).join('\r\n');
}

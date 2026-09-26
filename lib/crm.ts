import { z } from 'zod';
import {
  activeStages,
  defaultLostReasons,
  defaultPipelineStages,
  firstOpenStageId,
  lostStageId,
  normalizePipelineStage,
  resolveLegacyStageId,
  stageOf,
  wonStageId,
  type LostReason,
  type OpportunityTag,
  type PipelineStage,
  type StageHistoryEntry,
  TAG_COLORS,
} from './pipeline-stages.ts';
import {
  allocateNumber, billedHourIds, buildInvoiceLines, isDraft, isIssued, isVoid,
  linesTotal, remainingBase, syncPaid, withVat, type InvoiceLine, type PaymentMethod, VAT_RATES,
} from './invoices.ts';
import {
  isPurchaseRecorded, purchaseBalance, purchasePaidAmount, projectPurchaseCost, syncPurchasePaid, totalsFromPurchaseLines,
} from './purchases.ts';
import { applyStockDelta } from './inventory.ts';

/** Display names kept for tests and migration labels; prefer stage ids in new code. */
export const stages = ['Cualificación','Propuesta','Negociación','Ganada','Perdida'] as const;
const legacyStages: Record<string,(typeof stages)[number]> = {'Lead Discovery':'Cualificación','Meeting Scheduled':'Cualificación','Sales Qualified':'Cualificación','Proposal sent & Negotiation':'Propuesta','Won & Ongoing':'Ganada','Finnished':'Ganada','ReActivate in the future':'Cualificación','Lost or Discarded':'Perdida'};
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const dateOffset = (n:number) => {const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const sameText=(a='',b='')=>{const key=(v:string)=>v.normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toLowerCase();return !!key(a)&&key(a)===key(b)};
export const days = (date:string, now=today()) => Math.floor((Date.parse(now+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000);
const name=z.string().trim().min(1,'Falta un campo obligatorio').max(500);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Indica una fecha válida').refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Fecha no válida');
const money=z.number().finite().min(0).max(1e10);
const base={id:z.string().min(1),demo:z.boolean().default(false)};
const policies=z.enum(['fixed','milestones','hours','goods']);
const line=z.object({
  description:name,quantity:z.number().positive().max(1e6),price:money,policy:policies,
  tasks:z.string().max(5000).default(''),
  itemId:z.string().max(80).default(''),
}).superRefine((row,ctx)=>{
  if(row.policy!=='goods'&&!String(row.tasks||'').trim())ctx.addIssue({code:'custom',message:'Añade al menos una tarea de entrega',path:['tasks']});
});
const purchaseLine=z.object({description:name,quantity:z.number().positive().max(1e6),price:money,amount:money,itemId:z.string().max(80).default('')});
const stageHistoryEntry=z.object({id:z.string().min(1),at:z.string().min(1),fromStageId:z.string(),toStageId:z.string().min(1),user:z.string().max(200).default('')});
export const leadStatuses = ['Nuevo','Contactado','Cualificado','Convertido','Descartado'] as const;
export const taskStatuses = ['Por hacer','En curso','Hecho'] as const;
export const leadSources = ['Web','Referencia','Outbound','Evento','Otro'] as const;
export const personRoles = ['Decisor','Técnico','Finanzas','Otro'] as const;
export const schemas={
 leads:z.object({...base,name,contact:z.string().max(200),email:z.string().email('El correo no es válido').or(z.literal('')),phone:z.string().max(100),source:z.enum(leadSources),status:z.enum(leadStatuses),notes:z.string().max(3000),nextDate:date.or(z.literal('')),createdAt:date,convertedCompanyId:z.string().optional(),convertedOpportunityId:z.string().optional()}),
 companies:z.object({...base,name,email:z.string().email('El correo no es válido').or(z.literal('')),contact:z.string().max(500),phone:z.string().max(100),contactDays:z.number().int().min(1).max(90),taxId:z.string().max(40).default(''),address:z.string().max(500).default(''),paymentDays:z.number().int().min(1).max(365).default(30),companyRole:z.enum(['client','supplier','both']).default('client')}),
 people:z.object({...base,companyId:name,name,email:z.string().email('El correo no es válido').or(z.literal('')),phone:z.string().max(100),role:z.enum(personRoles),opportunityId:z.string().max(80).default('')}),
 services:z.object({
  ...base,name,price:money,
  kind:z.enum(['service','product']).default('service'),
  policy:z.enum(['fixed','milestones','hours','goods']).default('fixed'),
  tasks:z.string().max(5000).default(''),
  sku:z.string().max(80).default(''),
  stock:money.default(0),
  minStock:money.default(0),
  cost:money.default(0),
  unit:z.string().max(40).default('ud'),
}).superRefine((row,ctx)=>{
  if(row.kind==='service'&&row.policy==='goods')ctx.addIssue({code:'custom',message:'Un servicio no usa política de producto',path:['policy']});
  if(row.kind==='product'&&row.policy!=='goods')ctx.addIssue({code:'custom',message:'Un producto usa política de mercancía',path:['policy']});
  if(row.kind==='service'&&!String(row.tasks||'').trim())ctx.addIssue({code:'custom',message:'Añade al menos una tarea de entrega',path:['tasks']});
}),
 opportunities:z.object({
  ...base,companyId:name,title:name,amount:money,stageId:z.string().min(1),
  closeDate:date,nextStep:z.string().max(500),nextDate:date.or(z.literal('')),createdAt:date,
  tagIds:z.array(z.string()).default([]),
  mrr:money.nullable().optional(),
  ownerUserId:z.string().max(120).default(''),
  lostReasonId:z.string().max(80).default(''),
  rank:z.number().finite().default(0),
  priority:z.number().int().min(0).max(3).default(0),
  stageHistory:z.array(stageHistoryEntry).default([]),
 }),
 interactions:z.object({...base,companyId:name,opportunityId:z.string(),kind:z.enum(['Llamada','Email','Reunión','Nota']),date,notes:name}),
 followups:z.object({...base,opportunityId:name,title:name,dueDate:date,done:z.boolean()}),
 quotes:z.object({...base,opportunityId:name,title:name,lines:z.array(line).min(1).max(100)}),
 orders:z.object({...base,quoteId:name,title:name,lines:z.array(line).min(1).max(100),confirmed:z.boolean()}),
 projects:z.object({...base,orderId:z.string().max(80).default(''),title:name,body:z.string().max(2000).default(''),tagIds:z.array(z.string()).default([]),assigneeUserId:z.string().max(120).default('')}),
 delivery:z.object({...base,projectId:name,lineIndex:z.number().int().min(0).default(0),title:name,done:z.boolean(),status:z.enum(taskStatuses).default('Por hacer'),assignee:z.string().max(120).default(''),startDate:date.or(z.literal('')).default(''),dueDate:date.or(z.literal('')).default('')}),
 hours:z.object({...base,taskId:name,date,hours:z.number().positive().max(24),cost:money,notes:z.string().max(500)}),
 invoices:z.object({
  ...base,orderId:name,title:name,date,dueDate:date,amount:money,
  policy:z.enum(['fixed','milestones','hours','goods']),hourIds:z.array(z.string()),paid:z.boolean(),
  status:z.enum(['draft','issued','void']).default('issued'),
  kind:z.enum(['invoice','credit']).default('invoice'),
  rectifiesId:z.string().max(80).default(''),
  number:z.string().max(80).default(''),
  base:money.default(0),
  vatRate:z.number().refine(v=>[0,4,10,21].includes(v),'Tipo de IVA no válido').default(0),
  vatAmount:money.default(0),
  lines:z.array(z.object({description:name,quantity:z.number().positive().max(1e6),price:money,amount:money})).default([]),
  sentAt:z.string().max(40).default(''),
 }),
 payments:z.object({...base,invoiceId:name,date,amount:money,method:z.enum(['transfer','card','cash']).default('transfer'),note:z.string().max(500).default('')}),
 purchases:z.object({
  ...base,supplierCompanyId:name,projectId:z.string().max(80).default(''),orderId:z.string().max(80).default(''),
  title:name,number:z.string().max(80).default(''),date,dueDate:date,amount:money,
  base:money.default(0),vatRate:z.number().refine(v=>[0,4,10,21].includes(v)).default(0),vatAmount:money.default(0),
  status:z.enum(['draft','recorded','paid','void']).default('recorded'),
  lines:z.array(purchaseLine).default([]),paid:z.boolean().default(false),
  notes:z.string().max(3000).default(''),attachmentKey:z.string().max(200).default(''),ocrMeta:z.string().max(5000).default(''),
 }),
 purchasePayments:z.object({...base,purchaseId:name,date,amount:money,method:z.enum(['transfer','card','cash']).default('transfer'),note:z.string().max(500).default('')}),
 stockMoves:z.object({...base,itemId:name,delta:z.number().finite(),reason:z.enum(['sale','purchase','adjust']),refKind:z.string().max(40),refId:z.string().max(80),date,note:z.string().max(500).default('')}),
 contracts:z.object({
  ...base,companyId:name,opportunityId:z.string().max(80).default(''),orderId:z.string().max(80).default(''),
  title:name,startDate:date,endDate:date,renewalDate:date,mrr:money.default(0),
  status:z.enum(['active','notice','ended']).default('active'),notes:z.string().max(3000).default(''),
 }),
 recurringInvoices:z.object({
  ...base,orderId:z.string().max(80).default(''),contractId:z.string().max(80).default(''),
  dayOfMonth:z.number().int().min(1).max(28).default(1),vatRate:z.number().refine(v=>[0,4,10,21].includes(v)).default(21),
  policy:z.enum(['fixed','milestones','hours','goods']).default('fixed'),
  amount:money.default(0),title:z.string().max(200).default(''),
  nextDate:date,active:z.boolean().default(true),issueAs:z.enum(['draft','issued']).default('issued'),
  lastPeriod:z.string().max(20).default(''),
 }),
};
export type Kind=keyof typeof schemas;
export type Entity={ [K in Kind]:z.infer<typeof schemas[K]> };
export type State={ [K in Kind]:Entity[K][] } & {
  pipelineStages: PipelineStage[];
  opportunityTags: OpportunityTag[];
  projectTags: OpportunityTag[];
  lostReasons: LostReason[];
  invoiceSeries: { year: number; last: number }[];
  botActions?: BotActionRecord[];
};

export type BotActionRecord = {
  id: string;
  requestId?: string;
  kind: string;
  at: string;
  user: string;
  role?: string;
  revision?: number;
  result?: Record<string, unknown>;
  payload?: unknown;
};
export type { PipelineStage, OpportunityTag, LostReason, StageHistoryEntry };
export { activeStages, firstOpenStageId, lostStageId, stageOf, wonStageId, TAG_COLORS, defaultPipelineStages } from './pipeline-stages.ts';

export const emptyState=():State=>({
  ...(Object.fromEntries(Object.keys(schemas).map(k=>[k,[]])) as unknown as { [K in Kind]:Entity[K][] }),
  pipelineStages: defaultPipelineStages(),
  opportunityTags: [],
  projectTags: [],
  lostReasons: defaultLostReasons(),
  invoiceSeries: [],
  botActions: [],
});

function migrateOpportunity(row: Entity['opportunities'] & {stage?: string; stageId?: string; tagIds?: string[]; mrr?: number | null; ownerUserId?: string; lostReasonId?: string; rank?: number; priority?: number; stageHistory?: StageHistoryEntry[]}, stagesMap: PipelineStage[]) {
  const raw = row as {stage?: string; stageId?: string};
  let stageId = '';
  if (raw.stage) {
    const mapped = legacyStages[raw.stage] || (stages.includes(raw.stage as (typeof stages)[number]) ? raw.stage : undefined);
    stageId = resolveLegacyStageId(mapped || raw.stage);
  } else if (raw.stageId) {
    stageId = raw.stageId;
  }
  if (!stageId) stageId = firstOpenStageId({ pipelineStages: stagesMap });
  if (!stagesMap.some(s => s.id === stageId)) stageId = resolveLegacyStageId(stageId);
  if (!stagesMap.some(s => s.id === stageId)) stageId = firstOpenStageId({ pipelineStages: stagesMap });
  row.stageId = stageId;
  delete (row as {stage?: string}).stage;
  row.tagIds = Array.isArray(row.tagIds) ? row.tagIds.filter(Boolean) : [];
  row.mrr = row.mrr == null || row.mrr === ('' as unknown) ? null : Number(row.mrr);
  if (row.mrr != null && (!Number.isFinite(row.mrr) || row.mrr < 0)) row.mrr = null;
  row.ownerUserId = row.ownerUserId || '';
  row.lostReasonId = row.lostReasonId || '';
  row.rank = Number.isFinite(row.rank) ? Number(row.rank) : 0;
  row.stageHistory = Array.isArray(row.stageHistory) ? row.stageHistory : [];
  row.priority = Number.isInteger(row.priority) ? Math.min(3, Math.max(0, Number(row.priority))) : 0;
  return row;
}

export function ensureState(input: State | Partial<State>): State {
  const base = emptyState();
  const state = structuredClone({
    ...base,
    ...input,
    leads: input.leads ?? [],
    people: input.people ?? [],
    services: input.services ?? [],
    opportunities: input.opportunities ?? [],
    companies: input.companies ?? [],
    interactions: input.interactions ?? [],
    followups: input.followups ?? [],
    quotes: input.quotes ?? [],
    orders: input.orders ?? [],
    projects: input.projects ?? [],
    delivery: input.delivery ?? [],
    hours: input.hours ?? [],
    invoices: input.invoices ?? [],
    payments: input.payments ?? [],
  }) as State;

  const rawStages = Array.isArray(input.pipelineStages) && input.pipelineStages.length
    ? input.pipelineStages
    : defaultPipelineStages();
  state.pipelineStages = rawStages.map((stage, index) => normalizePipelineStage({
    ...stage,
    order: Number.isFinite(stage.order) ? stage.order : index,
    name: stage.name || `Etapa ${index + 1}`,
    id: stage.id || `stage-${index + 1}`,
  }));
  if (!state.pipelineStages.some(s => s.kind === 'won' && !s.archived)) {
    state.pipelineStages.push(normalizePipelineStage(defaultPipelineStages().find(s => s.kind === 'won')!));
  }
  if (!state.pipelineStages.some(s => s.kind === 'lost' && !s.archived)) {
    state.pipelineStages.push(normalizePipelineStage(defaultPipelineStages().find(s => s.kind === 'lost')!));
  }
  state.pipelineStages = state.pipelineStages
    .map((stage, index) => ({ ...stage, order: index, tone: index }))
    .sort((a, b) => a.order - b.order);

  const asTags = (tags: OpportunityTag[] | undefined) => (Array.isArray(tags) ? tags : []).map(tag => ({
    id: tag.id,
    name: String(tag.name || '').trim() || 'Etiqueta',
    color: TAG_COLORS.includes(tag.color) ? tag.color : 'slate' as OpportunityTag['color'],
    archived: !!tag.archived,
  }));
  state.opportunityTags = asTags(input.opportunityTags);
  state.projectTags = asTags(input.projectTags);
  state.lostReasons = (Array.isArray(input.lostReasons) && input.lostReasons.length
    ? input.lostReasons
    : defaultLostReasons()).map(reason => ({
    id: reason.id,
    name: String(reason.name || '').trim() || 'Motivo',
    archived: !!reason.archived,
  }));

  for (const opportunity of state.opportunities) migrateOpportunity(opportunity as Entity['opportunities'] & {stage?: string}, state.pipelineStages);
  for (const project of state.projects) {
    const row = project as Entity['projects'] & {orderId?: string; body?: string; tagIds?: string[]; assigneeUserId?: string};
    row.orderId = row.orderId || '';
    row.body = row.body ?? '';
    row.tagIds = Array.isArray(row.tagIds) ? row.tagIds.filter(Boolean) : [];
    row.assigneeUserId = row.assigneeUserId || '';
  }
  for (const task of state.delivery) {
    const row = task as Entity['delivery'] & {status?: string; assignee?: string; startDate?: string; dueDate?: string};
    if (!row.status || !taskStatuses.includes(row.status as (typeof taskStatuses)[number])) row.status = row.done ? 'Hecho' : 'Por hacer';
    row.assignee = row.assignee ?? '';
    row.startDate = row.startDate || '';
    row.dueDate = row.dueDate || '';
    row.done = row.status === 'Hecho';
  }
  for (const person of state.people) {
    const row = person as Entity['people'] & {opportunityId?: string};
    row.opportunityId = row.opportunityId || '';
  }
  for (const company of state.companies) {
    if (!company.contact?.trim()) continue;
    if (state.people.some(p => p.companyId === company.id)) continue;
    state.people.push({id:`migrated-${company.id}`,demo:company.demo,companyId:company.id,name:company.contact,email:company.email||'',phone:company.phone||'',role:'Decisor',opportunityId:''});
  }
  if (!Array.isArray(state.botActions)) state.botActions = [];
  if (!Array.isArray(state.invoiceSeries)) state.invoiceSeries = [];
  for (const company of state.companies) {
    const row = company as Entity['companies'] & { taxId?: string; address?: string; paymentDays?: number; companyRole?: string };
    row.taxId = row.taxId || '';
    row.address = row.address || '';
    row.paymentDays = Number.isInteger(row.paymentDays) && row.paymentDays! > 0 ? Math.min(365, row.paymentDays!) : 30;
    row.companyRole = (['client','supplier','both'].includes(String(row.companyRole)) ? row.companyRole : 'client') as Entity['companies']['companyRole'];
  }
  if (!Array.isArray(state.purchases)) state.purchases = [];
  if (!Array.isArray(state.purchasePayments)) state.purchasePayments = [];
  if (!Array.isArray(state.stockMoves)) state.stockMoves = [];
  if (!Array.isArray(state.contracts)) state.contracts = [];
  if (!Array.isArray(state.recurringInvoices)) state.recurringInvoices = [];
  for (const service of state.services) {
    const row = service as Entity['services'] & Record<string, unknown>;
    row.kind = (row.kind === 'product' ? 'product' : 'service') as Entity['services']['kind'];
    row.sku = String(row.sku || '');
    row.stock = Number(row.stock) || 0;
    row.minStock = Number(row.minStock) || 0;
    row.cost = Number(row.cost) || 0;
    row.unit = String(row.unit || 'ud');
    row.tasks = String(row.tasks || '');
    if (row.kind === 'product') row.policy = 'goods';
    else if (row.policy === 'goods') row.policy = 'fixed';
  }
  for (const doc of [...state.quotes, ...state.orders]) {
    for (const lineRow of doc.lines || []) {
      const row = lineRow as Entity['quotes']['lines'][number] & { itemId?: string; tasks?: string };
      row.itemId = row.itemId || '';
      row.tasks = row.tasks ?? '';
      if (!(['fixed','milestones','hours','goods'] as string[]).includes(row.policy)) row.policy = 'fixed';
    }
  }
  for (const purchase of state.purchases) {
    const row = purchase as Entity['purchases'] & Record<string, unknown>;
    row.projectId = String(row.projectId || '');
    row.orderId = String(row.orderId || '');
    row.number = String(row.number || '');
    row.notes = String(row.notes || '');
    row.attachmentKey = String(row.attachmentKey || '');
    row.ocrMeta = String(row.ocrMeta || '');
    row.lines = Array.isArray(row.lines) ? row.lines : [];
    row.status = (['draft','recorded','paid','void'].includes(String(row.status)) ? row.status : 'recorded') as Entity['purchases']['status'];
    row.base = Number(row.base ?? row.amount) || 0;
    row.vatRate = [0,4,10,21].includes(Number(row.vatRate)) ? Number(row.vatRate) : 0;
    row.vatAmount = Number(row.vatAmount) || 0;
  }
  for (const purchase of state.purchases) syncPurchasePaid(state, purchase);
  for (const invoice of state.invoices) {
    const row = invoice as Entity['invoices'] & Record<string, unknown>;
    row.status = (['draft','issued','void'].includes(String(row.status))?row.status:'issued') as Entity['invoices']['status'];
    row.kind = (['invoice','credit'].includes(String(row.kind))?row.kind:'invoice') as Entity['invoices']['kind'];
    row.rectifiesId = (row.rectifiesId as string) || '';
    row.number = (row.number as string) || (row.status === 'issued' ? String(row.title || '') : '');
    row.lines = Array.isArray(row.lines) ? row.lines : [];
    row.sentAt = (row.sentAt as string) || '';
    if (row.base == null) {
      row.base = Number(row.amount) || 0;
      row.vatRate = 0;
      row.vatAmount = 0;
    } else {
      row.base = Number(row.base) || 0;
      row.vatRate = [0, 4, 10, 21].includes(Number(row.vatRate)) ? Number(row.vatRate) : 0;
      row.vatAmount = Number(row.vatAmount) || 0;
    }
    row.hourIds = Array.isArray(row.hourIds) ? row.hourIds : [];
  }
  for (const payment of state.payments) {
    const row = payment as Entity['payments'] & { method?: string; note?: string };
    row.method = (['transfer', 'card', 'cash'].includes(row.method || '') ? row.method : 'transfer') as Entity['payments']['method'];
    row.note = row.note || '';
  }
  for (const invoice of state.invoices) syncPaid(state, invoice);
  return state;
}

export const total=(lines:Entity['quotes']['lines'])=>Math.round(lines.reduce((s,l)=>s+l.quantity*l.price,0)*100)/100;
export const round=(n:number)=>Math.round(n*100)/100;
export const eur=(n:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n);
export function companyForOrder(s:State,id:string){const o=s.orders.find(x=>x.id===id);const q=s.quotes.find(x=>x.id===o?.quoteId);return s.opportunities.find(x=>x.id===q?.opportunityId)?.companyId}
export function projectCost(s:State,id:string){return round(s.hours.filter(h=>s.delivery.some(t=>t.id===h.taskId&&t.projectId===id)).reduce((a,h)=>a+h.hours*h.cost,0)+projectPurchaseCost(s,id))}

export function isWonStage(s: Pick<State,'pipelineStages'>, stageId: string) {
  return stageOf(s, stageId)?.kind === 'won';
}
export function isLostStage(s: Pick<State,'pipelineStages'>, stageId: string) {
  return stageOf(s, stageId)?.kind === 'lost';
}
export function isOpenStage(s: Pick<State,'pipelineStages'>, stageId: string) {
  const stage = stageOf(s, stageId);
  return !!stage && stage.kind === 'open' && !stage.archived;
}

export function daysInStage(opportunity: Entity['opportunities'], now = today()) {
  const last = opportunity.stageHistory?.at(-1)?.at?.slice(0, 10);
  return days(last || opportunity.createdAt, now);
}

export function stageProbability(s: Pick<State,'pipelineStages'>, stageId: string) {
  const stage = stageOf(s, stageId);
  if (!stage) return 0;
  if (stage.kind === 'won') return 100;
  if (stage.kind === 'lost') return 0;
  return stage.probability;
}

export function risk(s:State,o:Entity['opportunities'],now=today()){
 const c=s.companies.find(c=>c.id===o.companyId)!;
 const contacts=s.interactions.filter(i=>i.companyId===o.companyId).map(i=>i.date).sort();
 const contacted=contacts.length>0;const last=contacts.at(-1)||o.createdAt; const elapsed=days(last,now);
 if(isLostStage(s,o.stageId))return {level:0,label:'Sin alerta',reason:'Oportunidad cerrada',last,elapsed,contacted};
 const overdue=s.followups.filter(t=>t.opportunityId===o.id&&!t.done&&t.dueDate<now);
 const reasons=[];if(o.nextDate&&o.nextDate<now)reasons.push('Siguiente paso vencido');if(overdue.length)reasons.push(`${overdue.length} seguimiento${overdue.length>1?'s':''} vencido${overdue.length>1?'s':''}`);if(elapsed>=c.contactDays)reasons.push(`${elapsed} días sin contacto · límite ${c.contactDays}`);
 if(reasons.length)return {level:2,label:'Crítico',reason:reasons.join(' · '),last,elapsed,contacted};
 if(isOpenStage(s,o.stageId)&&days(o.closeDate,now)>=-7&&!s.followups.some(t=>t.opportunityId===o.id&&!t.done))return {level:1,label:'Atención',reason:o.closeDate<now?'Cierre vencido sin seguimiento pendiente':'Cierre en 7 días o menos sin seguimiento pendiente',last,elapsed,contacted};
 return {level:0,label:'Al día',reason:'Seguimiento dentro de plazo',last,elapsed,contacted};
}
const fail=(message:string):never=>{throw new Error(message)};
function get<K extends Kind>(s:State,k:K,id:string):Entity[K]{return (s[k] as Entity[K][]).find(x=>x.id===id)||fail('El registro no existe en tu empresa')}

function assertActiveStage(s:State, stageId:string): PipelineStage {
  const stage=stageOf(s,stageId);
  if(!stage||stage.archived)fail('La etapa no existe o está archivada');
  return stage as PipelineStage;
}

function maxRankInStage(s:State, stageId:string){
  const ranks=s.opportunities.filter(o=>o.stageId===stageId).map(o=>o.rank||0);
  return ranks.length?Math.max(...ranks):0;
}
function placeInStage(s:State,o:Entity['opportunities'],beforeId:string|null){
  const column=s.opportunities.filter(item=>item.stageId===o.stageId&&item.id!==o.id).sort((a,b)=>(a.rank||0)-(b.rank||0)||a.id.localeCompare(b.id));
  const index=beforeId?column.findIndex(item=>item.id===beforeId):-1;
  column.splice(index<0?column.length:index,0,o);
  column.forEach((item,position)=>{item.rank=position+1});
}

function appendStageHistory(o:Entity['opportunities'], fromStageId:string, toStageId:string, user=''){
  o.stageHistory=[...(o.stageHistory||[]),{id:crypto.randomUUID(),at:new Date().toISOString(),fromStageId,toStageId,user}];
}

export type Command={
  action:string;kind?:Kind;record?:unknown;id?:string;stage?:string;stageId?:string;expectedStage?:string;expectedStageId?:string;
  policy?:string;amount?:number;title?:string;date?:string;dueDate?:string;hourIds?:string[];vatRate?:number;status?:string;method?:PaymentMethod;note?:string;draft?:boolean;delta?:number;itemId?:string;issueAs?:'draft'|'issued';period?:string;
  stages?:PipelineStage[];tags?:OpportunityTag[];reasons?:LostReason[];lostReasonId?:string;user?:string;rank?:number;direction?:'up'|'down';beforeId?:string|null;priority?:number;ownerUserId?:string;
};

export function apply(s0:State,cmd:Command):State{
 const s=structuredClone(ensureState(s0));const id=()=>crypto.randomUUID();
 if(cmd.action==='save'){
  const k=cmd.kind;if(!k||!schemas[k])fail('Tipo de registro no válido');
  if(['invoices','payments','purchasePayments','stockMoves'].includes(k!))fail('Usa la acción específica para este registro');
  const r=schemas[k!].parse(cmd.record) as any;
  const old=(s[k!] as any[]).find(x=>x.id===r.id);r.demo=old?.demo??false;
  if(!old){if(k==='opportunities'||k==='interactions'||k==='people')r.demo=get(s,'companies',r.companyId).demo;if(k==='followups'||k==='quotes')r.demo=get(s,'opportunities',r.opportunityId).demo;if(k==='orders')r.demo=get(s,'quotes',r.quoteId).demo;if(k==='delivery')r.demo=get(s,'projects',r.projectId).demo;if(k==='hours')r.demo=get(s,'delivery',r.taskId).demo;if(k==='services')r.demo=false}
  if(k==='leads'){if(old){r.createdAt=old.createdAt;r.convertedCompanyId=old.convertedCompanyId;r.convertedOpportunityId=old.convertedOpportunityId;if(old.status==='Convertido')r.status='Convertido'}else{r.createdAt=today();if(r.status==='Convertido')fail('Convierte el lead para crear la empresa y la oportunidad')}}
  if(k==='people'){get(s,'companies',r.companyId);if(r.opportunityId&&get(s,'opportunities',r.opportunityId).companyId!==r.companyId)fail('La oportunidad no corresponde a la empresa')}
  if(k==='services'){/* catalog entry */}
  if(k==='projects')r.tagIds=(r.tagIds||[]).filter((tagId:string)=>s.projectTags.some(t=>t.id===tagId&&!t.archived));
  if(k==='opportunities'){
    get(s,'companies',r.companyId);
    const stage=assertActiveStage(s,r.stageId);
    if(old){
      r.createdAt=old.createdAt;
      r.stageHistory=old.stageHistory||[];
      if(r.companyId!==old.companyId&&(s.interactions.some(i=>i.opportunityId===r.id)||s.quotes.some(q=>q.opportunityId===r.id)))fail('Esta oportunidad tiene interacciones o presupuestos. Conserva su empresa de origen');
      if(r.stageId!==old.stageId){
        if(stage.kind==='lost'&&!r.lostReasonId)fail('Indica el motivo de pérdida');
        if(stage.kind!=='lost')r.lostReasonId=old.lostReasonId||'';
        appendStageHistory(r,old.stageId,r.stageId,cmd.user||'');
        r.rank=maxRankInStage(s,r.stageId)+1;
      }else{
        r.lostReasonId=r.lostReasonId||old.lostReasonId||'';
        r.rank=Number.isFinite(r.rank)?r.rank:old.rank||0;
      }
    }else{
      r.createdAt=today();
      r.stageHistory=[];
      r.rank=maxRankInStage(s,r.stageId)+1;
      if(stage.kind==='lost'&&!r.lostReasonId)fail('Indica el motivo de pérdida');
    }
    r.tagIds=(r.tagIds||[]).filter((tagId:string)=>s.opportunityTags.some(t=>t.id===tagId&&!t.archived));
    r.mrr=r.mrr==null?null:round(Number(r.mrr));
    if(r.mrr!=null&&r.mrr<0)fail('El MRR no puede ser negativo');
  }
  if(k==='interactions'){get(s,'companies',r.companyId);if(r.opportunityId&&get(s,'opportunities',r.opportunityId).companyId!==r.companyId)fail('La oportunidad no corresponde a la empresa');if(r.date>today())fail('El contacto no puede tener una fecha futura')}
  if(k==='followups')get(s,'opportunities',r.opportunityId);
  if(k==='quotes'){get(s,'opportunities',r.opportunityId);if(s.orders.some(o=>o.quoteId===r.id))fail('Este presupuesto ya tiene un pedido. Edita el pedido si aún es borrador')}
  if(k==='orders'){get(s,'quotes',r.quoteId);if(old?.confirmed){if(r.quoteId!==old.quoteId||JSON.stringify(r.lines)!==JSON.stringify(old.lines))fail('Las líneas de un pedido confirmado quedan bloqueadas para conservar sus facturas y horas');r.confirmed=true;const project=s.projects.find(p=>p.orderId===r.id);if(project)project.title=r.title}else r.confirmed=false;if(s.orders.some(o=>o.quoteId===r.quoteId&&o.id!==r.id))fail('Este presupuesto ya tiene un pedido')}
  if(k==='projects'){if(r.orderId&&!s.orders.some(o=>o.id===r.orderId))fail('El pedido no existe');if(old?.orderId&&r.orderId!==old.orderId)fail('Este proyecto sigue ligado a su pedido');if(!old&&r.orderId&&s.projects.some(p=>p.orderId===r.orderId))fail('Ese pedido ya tiene un proyecto')}
  if(k==='delivery'){const p=get(s,'projects',r.projectId);if(p.orderId){const o=get(s,'orders',p.orderId);if(r.lineIndex>=o.lines.length)fail('Línea de pedido no válida')}else r.lineIndex=0;r.done=r.status==='Hecho';if(r.startDate&&r.dueDate&&r.startDate>r.dueDate)fail('La fecha objetivo no puede ser anterior al inicio');if(old&&(r.projectId!==old.projectId||r.lineIndex!==old.lineIndex)&&s.hours.some(h=>h.taskId===r.id))fail('No puedes mover una tarea con horas imputadas')}
  if(k==='hours'){get(s,'delivery',r.taskId);if(billedHourIds(s).has(r.id))fail('Estas horas ya están facturadas');if(r.date>today())fail('No puedes imputar horas futuras')}
  if(k==='purchases'){
    get(s,'companies',r.supplierCompanyId);
    if(r.projectId)get(s,'projects',r.projectId);
    if(r.orderId)get(s,'orders',r.orderId);
    if(r.dueDate<r.date)fail('El vencimiento no puede ser anterior a la factura de compra');
    if((r.lines||[]).length){
      const totals=totalsFromPurchaseLines(r.lines,r.vatRate||0);
      r.base=totals.base;r.vatRate=totals.vatRate;r.vatAmount=totals.vatAmount;r.amount=totals.amount;
    }else{
      r.base=Number(r.base||r.amount)||0;r.vatAmount=Number(r.vatAmount)||0;r.amount=round(r.base+r.vatAmount);
    }
    if(old&&old.status==='void')fail('Una compra anulada no se edita');
    const wasRecorded=!!old&&isPurchaseRecorded(old)&&old.status!=='void';
    const nowRecorded=isPurchaseRecorded(r)&&r.status!=='void';
    if(nowRecorded&&!wasRecorded){
      for(const pl of r.lines||[]){
        if(pl.itemId)applyStockDelta(s,{itemId:pl.itemId,delta:pl.quantity,reason:'purchase',refKind:'purchases',refId:r.id,date:r.date,note:r.title});
      }
    }
    syncPurchasePaid(s,r);
  }
  if(k==='contracts'){get(s,'companies',r.companyId);if(r.opportunityId)get(s,'opportunities',r.opportunityId);if(r.orderId)get(s,'orders',r.orderId);if(r.endDate<r.startDate)fail('La fecha de fin no puede ser anterior al inicio')}
  if(k==='recurringInvoices'){
    if(!r.orderId&&!r.contractId)fail('Indica un pedido o un contrato');
    if(r.orderId)get(s,'orders',r.orderId);
    if(r.contractId)get(s,'contracts',r.contractId);
  }
  if(k==='services'){
    if(r.kind==='product'){r.policy='goods';r.tasks=r.tasks||''}
    else if(r.policy==='goods')r.policy='fixed';
  }
  (s[k!] as any[])=(s[k!] as any[]).filter(x=>x.id!==r.id).concat(r);
 }else if(cmd.action==='convertLead'){
  const lead=get(s,'leads',cmd.id!);
  if(lead.status==='Descartado')fail('Un lead descartado no se convierte. Vuelve a abrirlo si retoma el interés');
  if(lead.status==='Convertido')fail('Este lead ya está convertido');
  const company=s.companies.find(c=>c.id===lead.convertedCompanyId)||s.companies.find(c=>c.demo===lead.demo&&(sameText(c.name,lead.name)||sameText(c.email,lead.email)));
  const companyId=company?.id||lead.convertedCompanyId||id();
  if(company){for(const field of ['contact','email','phone'] as const)if(!company[field]&&lead[field])company[field]=lead[field]}
  else s.companies.push({id:companyId,demo:lead.demo,name:lead.name,email:lead.email,contact:lead.contact,phone:lead.phone,contactDays:30,taxId:'',address:'',paymentDays:30,companyRole:'client'});
  const opportunityId=id();
  const openId=firstOpenStageId(s);
  s.opportunities.push({id:opportunityId,demo:lead.demo,companyId,title:cmd.title||`Oportunidad · ${lead.name}`,amount:0,stageId:openId,closeDate:dateOffset(30),nextStep:lead.nextDate?'Contactar en la fecha prevista':'Preparar la primera reunión',nextDate:lead.nextDate||today(),createdAt:today(),tagIds:[],mrr:null,ownerUserId:'',lostReasonId:'',rank:maxRankInStage(s,openId)+1,priority:0,stageHistory:[]});
  if(lead.contact.trim()||lead.email.trim()||lead.phone.trim()){
   const existing=s.people.find(p=>p.companyId===companyId&&(sameText(p.name,lead.contact)||sameText(p.email,lead.email)));
   if(existing){if(!existing.opportunityId)existing.opportunityId=opportunityId;for(const field of ['email','phone'] as const)if(!existing[field]&&lead[field])existing[field]=lead[field]}
   else s.people.push({id:id(),demo:lead.demo,companyId,name:lead.contact||lead.name,email:lead.email,phone:lead.phone,role:'Decisor',opportunityId});
  }
  if(lead.notes.trim())s.interactions.push({id:id(),demo:lead.demo,companyId,opportunityId,kind:'Nota',date:today(),notes:`Lead convertido · ${lead.notes}`});
  lead.status='Convertido';lead.convertedCompanyId=companyId;lead.convertedOpportunityId=opportunityId;
 }else if(cmd.action==='stage'){
  const o=get(s,'opportunities',cmd.id!);
  const fromExpected=cmd.expectedStageId||(cmd.expectedStage?resolveLegacyStageId(cmd.expectedStage):'');
  if(fromExpected&&o.stageId!==fromExpected)fail('La etapa ha cambiado. Recarga antes de deshacer');
  const toId=cmd.stageId||(cmd.stage?resolveLegacyStageId(cmd.stage):'');
  const stage=assertActiveStage(s,toId);
  if(o.stageId===toId){if(cmd.beforeId!==undefined)placeInStage(s,o,cmd.beforeId);return s}
  if(stage.kind==='lost'){
    const reasonId=cmd.lostReasonId||o.lostReasonId||'';
    if(!reasonId||!s.lostReasons.some(r=>r.id===reasonId&&!r.archived))fail('Indica el motivo de pérdida');
    o.lostReasonId=reasonId;
  }
  if(stage.wipLimit!=null&&stage.wipMode==='block'){
    const count=s.opportunities.filter(item=>item.stageId===toId&&item.id!==o.id).length;
    if(count>=stage.wipLimit)fail(`Límite WIP alcanzado en ${stage.name} (${stage.wipLimit})`);
  }
  appendStageHistory(o,o.stageId,toId,cmd.user||'');
  o.stageId=toId;
  if(cmd.beforeId!==undefined)placeInStage(s,o,cmd.beforeId);
  else o.rank=maxRankInStage(s,toId)+1;
 }else if(cmd.action==='rankOpportunity'){
  const o=get(s,'opportunities',cmd.id!);
  if(cmd.beforeId!==undefined){placeInStage(s,o,cmd.beforeId);return s}
  const column=s.opportunities.filter(item=>item.stageId===o.stageId).sort((a,b)=>(a.rank||0)-(b.rank||0)||a.id.localeCompare(b.id));
  const index=column.findIndex(item=>item.id===o.id);
  if(index<0)return s;
  const swapWith=cmd.direction==='up'?index-1:cmd.direction==='down'?index+1:-1;
  if(swapWith<0||swapWith>=column.length)return s;
  const other=column[swapWith];
  const currentRank=o.rank||0;o.rank=other.rank||0;other.rank=currentRank;
 }else if(cmd.action==='patchOpportunity'){
  const o=get(s,'opportunities',cmd.id!);
  if(cmd.priority!==undefined){
    const priority=Number(cmd.priority);
    if(!Number.isInteger(priority)||priority<0||priority>3)fail('La prioridad va de 0 a 3');
    o.priority=priority;
  }
  if(cmd.ownerUserId!==undefined){
    if(typeof cmd.ownerUserId!=='string'||cmd.ownerUserId.length>120)fail('Responsable no válido');
    o.ownerUserId=cmd.ownerUserId;
  }
 }else if(cmd.action==='savePipelineStages'){
  const next=(cmd.stages||[]).map((stage,index)=>normalizePipelineStage({...stage,order:index,tone:index}));
  if(!next.some(stage=>!stage.archived&&stage.kind==='open'))fail('Necesitas al menos una etapa abierta');
  if(!next.some(stage=>!stage.archived&&stage.kind==='won'))fail('Necesitas una etapa ganada');
  if(!next.some(stage=>!stage.archived&&stage.kind==='lost'))fail('Necesitas una etapa perdida');
  const ids=new Set(next.map(stage=>stage.id));
  if(ids.size!==next.length)fail('Hay etapas duplicadas');
  for(const stage of s.pipelineStages){
    if(!ids.has(stage.id)&&s.opportunities.some(o=>o.stageId===stage.id))fail(`No puedes eliminar ${stage.name}: hay oportunidades en esa etapa`);
  }
  for(const stage of next){
    if(stage.archived&&s.opportunities.some(o=>o.stageId===stage.id))fail(`No puedes archivar ${stage.name}: hay oportunidades en esa etapa`);
  }
  s.pipelineStages=next;
 }else if(cmd.action==='saveOpportunityTags'){
  const next=(cmd.tags||[]).map(tag=>({
    id:tag.id||id(),
    name:String(tag.name||'').trim(),
    color:(TAG_COLORS.includes(tag.color as OpportunityTag['color'])?tag.color:'slate') as OpportunityTag['color'],
    archived:!!tag.archived,
  }));
  for(const tag of next)if(!tag.name)fail('El nombre de la etiqueta es obligatorio');
  if(new Set(next.map(t=>t.id)).size!==next.length)fail('Hay etiquetas duplicadas');
  for(const tag of next){
    if(tag.archived)for(const o of s.opportunities)o.tagIds=(o.tagIds||[]).filter(id=>id!==tag.id);
  }
  s.opportunityTags=next;
 }else if(cmd.action==='saveProjectTags'){
  const next=(cmd.tags||[]).map(tag=>({
    id:tag.id||id(),
    name:String(tag.name||'').trim(),
    color:(TAG_COLORS.includes(tag.color as OpportunityTag['color'])?tag.color:'slate') as OpportunityTag['color'],
    archived:!!tag.archived,
  }));
  for(const tag of next)if(!tag.name)fail('El nombre de la etiqueta es obligatorio');
  if(new Set(next.map(t=>t.id)).size!==next.length)fail('Hay etiquetas duplicadas');
  for(const tag of next){
    if(tag.archived)for(const project of s.projects)project.tagIds=(project.tagIds||[]).filter(id=>id!==tag.id);
  }
  s.projectTags=next;
 }else if(cmd.action==='saveLostReasons'){
  const next=(cmd.reasons||[]).map(reason=>({id:reason.id||id(),name:String(reason.name||'').trim(),archived:!!reason.archived}));
  for(const reason of next)if(!reason.name)fail('El motivo es obligatorio');
  if(!next.some(reason=>!reason.archived))fail('Necesitas al menos un motivo de pérdida activo');
  s.lostReasons=next;
 }else if(cmd.action==='complete'){
  const t=get(s,'followups',cmd.id!);t.done=!t.done;
 }else if(cmd.action==='confirm'){
  const q=get(s,'quotes',cmd.id!);let o=s.orders.find(o=>o.quoteId===q.id);
  if(o?.confirmed)fail('El pedido ya está confirmado');
  if(!o){o={id:id(),demo:q.demo,quoteId:q.id,title:q.title,lines:structuredClone(q.lines),confirmed:false};s.orders.push(o)}
  o.confirmed=true;const p={id:id(),demo:o.demo,orderId:o.id,title:o.title,body:'',tagIds:[] as string[],assigneeUserId:''};s.projects.push(p);
  o.lines.forEach((l,n)=>{
    if(l.policy==='goods'){
      if(l.itemId)applyStockDelta(s,{itemId:l.itemId,delta:-l.quantity,reason:'sale',refKind:'orders',refId:o!.id,date:today(),note:o!.title});
      return;
    }
    String(l.tasks||'').split('\n').map(x=>x.trim()).filter(Boolean).forEach(title=>s.delivery.push({id:id(),demo:o!.demo,projectId:p.id,lineIndex:n,title,done:false,status:'Por hacer',assignee:'',startDate:'',dueDate:''}));
  });
  const opportunity=get(s,'opportunities',q.opportunityId);
  const won=wonStageId(s);
  if(opportunity.stageId!==won){appendStageHistory(opportunity,opportunity.stageId,won,cmd.user||'');opportunity.stageId=won;opportunity.rank=maxRankInStage(s,won)+1}
 }else if(cmd.action==='invoice'){
  const o=get(s,'orders',cmd.id!);if(!o.confirmed)fail('Confirma el pedido antes de facturar');
  const policy=z.enum(['fixed','milestones','hours','goods']).parse(cmd.policy);
  if(!o.lines.some(l=>l.policy===policy))fail('El pedido no tiene líneas con esta política');
  const asDraft=cmd.status==='draft'||cmd.draft===true;
  const vatRate=VAT_RATES.includes(Number(cmd.vatRate) as (typeof VAT_RATES)[number])?Number(cmd.vatRate):0;
  let hourIds:string[]=[];
  let base=0;
  let lines:InvoiceLine[]=[];
  if(policy==='hours'){
   const selected=z.array(z.string()).min(1,'Selecciona horas pendientes').parse(cmd.hourIds);
   if(new Set(selected).size!==selected.length)fail('Horas duplicadas');
   const billed=billedHourIds(s);
   for(const hId of selected){
    const h=get(s,'hours',hId);const t=get(s,'delivery',h.taskId);const p=get(s,'projects',t.projectId);
    if(p.orderId!==o.id||o.lines[t.lineIndex].policy!=='hours')fail('Las horas no corresponden a esta política o pedido');
    if(billed.has(hId))fail('Hay horas ya facturadas');
   }
   hourIds=selected;
   lines=buildInvoiceLines(s,o.id,policy,{hourIds});
   base=linesTotal(lines);
  }else{
   const remaining=remainingBase(s,o.id,policy);
   base=(policy==='fixed'||policy==='goods')?remaining:money.positive('El importe debe ser mayor que cero').parse(cmd.amount);
   if(base<=0||base>remaining)fail(`Importe pendiente: ${eur(remaining)}`);
   lines=buildInvoiceLines(s,o.id,policy,{amount:base});
   if(policy==='fixed'||policy==='goods')base=linesTotal(lines);
  }
  if(base<=0)fail('El importe de la factura debe ser mayor que cero');
  const totals=withVat(base,vatRate);
  const issueDate=date.parse(cmd.date!);
  const due=date.parse(cmd.dueDate!);
  if(due<issueDate)fail('El vencimiento no puede ser anterior a la factura');
  let number='';let title=String(cmd.title||'').trim();
  let status:'draft'|'issued'=asDraft?'draft':'issued';
  if(!asDraft){
   number=allocateNumber(s,issueDate);
   title=number;
  }else if(!title)title='Borrador';
  s.invoices.push(schemas.invoices.parse({
   id:id(),demo:o.demo,orderId:o.id,title,date:issueDate,dueDate:due,
   amount:totals.amount,base:totals.base,vatRate:totals.vatRate,vatAmount:totals.vatAmount,
   policy,hourIds,paid:false,status,kind:'invoice',rectifiesId:'',number,lines,sentAt:'',
  }));
 }else if(cmd.action==='issueInvoice'){
  const i=get(s,'invoices',cmd.id!);
  if(!isDraft(i))fail('Solo se puede emitir un borrador');
  if(i.policy==='hours'){
   const billed=billedHourIds(s);
   for(const hId of i.hourIds)if(billed.has(hId))fail('Hay horas ya facturadas');
  }else if(i.kind!=='credit'){
   const remaining=remainingBase(s,i.orderId,i.policy);
   if((i.base||i.amount)>remaining)fail(`Importe pendiente: ${eur(remaining)}`);
  }
  const issueDate=cmd.date?date.parse(cmd.date):i.date;
  const due=cmd.dueDate?date.parse(cmd.dueDate):i.dueDate;
  if(due<issueDate)fail('El vencimiento no puede ser anterior a la factura');
  i.date=issueDate;i.dueDate=due;
  i.number=allocateNumber(s,issueDate);
  i.title=i.number;
  i.status='issued';
  syncPaid(s,i);
 }else if(cmd.action==='editInvoice'){
  const i=get(s,'invoices',cmd.id!);
  if(isVoid(i))fail('Una factura anulada no se edita');
  if(isDraft(i)){
   if(cmd.title!=null)i.title=name.parse(cmd.title);
   if(cmd.date)i.date=date.parse(cmd.date);
   if(cmd.dueDate)i.dueDate=date.parse(cmd.dueDate);
   if(cmd.vatRate!=null&&VAT_RATES.includes(Number(cmd.vatRate) as (typeof VAT_RATES)[number])){
    const totals=withVat(i.base||i.amount,Number(cmd.vatRate));
    i.base=totals.base;i.vatRate=totals.vatRate;i.vatAmount=totals.vatAmount;i.amount=totals.amount;
   }
   if(cmd.amount!=null&&i.policy==='milestones'){
    const remaining=remainingBase(s,i.orderId,i.policy);
    const base=money.positive().parse(cmd.amount);
    if(base>remaining)fail(`Importe pendiente: ${eur(remaining)}`);
    i.lines=buildInvoiceLines(s,i.orderId,i.policy,{amount:base});
    const totals=withVat(base,i.vatRate||0);
    i.base=totals.base;i.vatAmount=totals.vatAmount;i.amount=totals.amount;
   }
   if(cmd.hourIds&&i.policy==='hours'){
    const selected=z.array(z.string()).min(1).parse(cmd.hourIds);
    const billed=billedHourIds({invoices:s.invoices.filter(x=>x.id!==i.id)});
    for(const hId of selected){get(s,'hours',hId);if(billed.has(hId))fail('Hay horas ya facturadas')}
    i.hourIds=selected;
    i.lines=buildInvoiceLines(s,i.orderId,i.policy,{hourIds:selected});
    const totals=withVat(linesTotal(i.lines),i.vatRate||0);
    i.base=totals.base;i.vatAmount=totals.vatAmount;i.amount=totals.amount;
   }
  }else{
   if(cmd.date)i.date=date.parse(cmd.date);
   if(cmd.dueDate)i.dueDate=date.parse(cmd.dueDate);
  }
  if(i.dueDate<i.date)fail('El vencimiento no puede ser anterior a la factura');
 }else if(cmd.action==='pay'){
  const i=get(s,'invoices',cmd.id!);
  if(!isIssued(i))fail('Solo se cobra una factura emitida');
  if(i.paid)fail('La factura ya está cobrada');
  const payDate=date.parse(cmd.date!);
  if(payDate>today()||payDate<i.date)fail('La fecha de cobro debe estar entre la emisión y hoy');
  const due=round(i.amount-s.payments.filter(p=>p.invoiceId===i.id).reduce((a,p)=>a+p.amount,0));
  if(due<=0)fail('La factura ya está cobrada');
  const amount=cmd.amount==null?due:money.positive('El importe debe ser mayor que cero').parse(cmd.amount);
  if(amount>due)fail(`El cobro supera el saldo pendiente (${eur(due)})`);
  const method=(['transfer','card','cash'].includes(String(cmd.method))?cmd.method:'transfer') as PaymentMethod;
  s.payments.push({id:id(),demo:i.demo,invoiceId:i.id,date:payDate,amount:round(amount),method,note:String(cmd.note||'').slice(0,500)});
  syncPaid(s,i);
 }else if(cmd.action==='voidPayment'){
  const payment=s.payments.find(p=>p.id===cmd.id);
  if(!payment)fail('El cobro no existe');
  else{
   const i=get(s,'invoices',payment.invoiceId);
   s.payments=s.payments.filter(p=>p.id!==cmd.id);
   syncPaid(s,i);
  }
 }else if(cmd.action==='creditInvoice'){
  const original=get(s,'invoices',cmd.id!);
  if(!isIssued(original)||original.kind==='credit')fail('Solo se anula una factura emitida');
  if(s.payments.some(p=>p.invoiceId===original.id))fail('Anula los cobros antes de rectificar la factura');
  const issueDate=date.parse(cmd.date||today());
  const number=allocateNumber(s,issueDate);
  original.status='void';
  original.paid=false;
  s.invoices.push(schemas.invoices.parse({
   id:id(),demo:original.demo,orderId:original.orderId,title:number,date:issueDate,dueDate:issueDate,
   amount:original.amount,base:original.base,vatRate:original.vatRate,vatAmount:original.vatAmount,
   policy:original.policy,hourIds:[],paid:true,status:'issued',kind:'credit',rectifiesId:original.id,
   number,lines:structuredClone(original.lines),sentAt:'',
  }));
 }else if(cmd.action==='payPurchase'){
  const purchase=get(s,'purchases',cmd.id!);
  if(!isPurchaseRecorded(purchase)||purchase.status==='void')fail('Solo se paga una compra registrada');
  if(purchase.paid)fail('La compra ya está pagada');
  const payDate=date.parse(cmd.date!);
  if(payDate>today()||payDate<purchase.date)fail('La fecha de pago debe estar entre la compra y hoy');
  const due=purchaseBalance(s,purchase);
  if(due<=0)fail('La compra ya está pagada');
  const amount=cmd.amount==null?due:money.positive('El importe debe ser mayor que cero').parse(cmd.amount);
  if(amount>due)fail(`El pago supera el saldo pendiente (${eur(due)})`);
  const method=(['transfer','card','cash'].includes(String(cmd.method))?cmd.method:'transfer') as PaymentMethod;
  s.purchasePayments.push({id:id(),demo:purchase.demo,purchaseId:purchase.id,date:payDate,amount:round(amount),method,note:String(cmd.note||'').slice(0,500)});
  syncPurchasePaid(s,purchase);
 }else if(cmd.action==='voidPurchasePayment'){
  const payment=s.purchasePayments.find(p=>p.id===cmd.id);
  if(!payment)fail('El pago no existe');
  else{
   const purchase=get(s,'purchases',payment.purchaseId);
   s.purchasePayments=s.purchasePayments.filter(p=>p.id!==payment.id);
   syncPurchasePaid(s,purchase);
  }
 }else if(cmd.action==='voidPurchase'){
  const purchase=get(s,'purchases',cmd.id!);
  if(purchase.status==='void')fail('La compra ya está anulada');
  if(purchasePaidAmount(s,purchase.id)>0)fail('Anula los pagos antes de anular la compra');
  if(isPurchaseRecorded(purchase)){
    for(const pl of purchase.lines||[]){
      if(pl.itemId)applyStockDelta(s,{itemId:pl.itemId,delta:-pl.quantity,reason:'adjust',refKind:'purchases',refId:purchase.id,date:today(),note:'Anulación compra',allowNegative:true});
    }
  }
  purchase.status='void';purchase.paid=false;
 }else if(cmd.action==='adjustStock'){
  const itemId=String(cmd.itemId||'');
  const delta=Number(cmd.delta);
  if(!itemId||!Number.isFinite(delta)||delta===0)fail('Indica el artículo y la cantidad');
  applyStockDelta(s,{itemId,delta,reason:'adjust',refKind:'adjust',refId:id(),date:cmd.date||today(),note:String(cmd.note||''),allowNegative:true});
 }else if(cmd.action==='renewContract'){
  const c=get(s,'contracts',cmd.id!);
  if(c.status==='ended')fail('Un contrato finalizado no se renueva');
  const months=Number(cmd.amount)||12;
  const end=new Date(Date.parse(c.endDate+'T12:00:00Z'));
  end.setUTCMonth(end.getUTCMonth()+Math.max(1,Math.floor(months)));
  c.endDate=end.toISOString().slice(0,10);
  const renew=new Date(Date.parse(c.renewalDate+'T12:00:00Z'));
  renew.setUTCMonth(renew.getUTCMonth()+Math.max(1,Math.floor(months)));
  c.renewalDate=renew.toISOString().slice(0,10);
  c.status='active';
 }else if(cmd.action==='runRecurring'){
  const schedule=get(s,'recurringInvoices',cmd.id!);
  if(!schedule.active)fail('La programación está desactivada');
  const runDate=cmd.date?date.parse(cmd.date):today();
  if(runDate<schedule.nextDate)fail('Aún no toca generar esta factura');
  const period=runDate.slice(0,7);
  if(schedule.lastPeriod===period)fail('Ya se generó la factura de este periodo');
  let orderId=schedule.orderId;
  if(!orderId&&schedule.contractId){
    const contract=get(s,'contracts',schedule.contractId);
    orderId=contract.orderId;
  }
  if(!orderId)fail('La programación no tiene pedido');
  const order=get(s,'orders',orderId);
  if(!order.confirmed)fail('Confirma el pedido antes de facturar');
  const policy=schedule.policy||'fixed';
  const remaining=remainingBase(s,orderId,policy);
  const base=schedule.amount>0?Math.min(schedule.amount,remaining||schedule.amount):(policy==='hours'?0:remaining);
  if(policy!=='hours'&&base<=0)fail('No queda importe pendiente para facturar');
  const vatRate=VAT_RATES.includes(Number(schedule.vatRate) as any)?Number(schedule.vatRate):21;
  const lines=policy==='hours'?[]:buildInvoiceLines(s,orderId,policy,{amount:base});
  const totals=withVat(policy==='hours'?0:linesTotal(lines)||base,vatRate);
  const asDraft=schedule.issueAs==='draft'||cmd.issueAs==='draft';
  const number=asDraft?'':allocateNumber(s,runDate);
  s.invoices.push(schemas.invoices.parse({
    id:id(),demo:order.demo,orderId,title:number||(schedule.title||`Recurrente ${period}`),date:runDate,dueDate:dateOffset(30),
    amount:totals.amount,base:totals.base,vatRate:totals.vatRate,vatAmount:totals.vatAmount,
    policy,hourIds:[],paid:false,status:asDraft?'draft':'issued',kind:'invoice',rectifiesId:'',number,lines,sentAt:'',
  }));
  schedule.lastPeriod=period;
  const next=new Date(Date.parse(runDate+'T12:00:00Z'));
  next.setUTCMonth(next.getUTCMonth()+1);
  const dom=Math.min(28,Math.max(1,schedule.dayOfMonth||1));
  next.setUTCDate(dom);
  schedule.nextDate=next.toISOString().slice(0,10);
 }else if(cmd.action==='deleteDemo'){
  const demoIds=new Set<string>();
  for(const k of Object.keys(schemas) as Kind[])for(const row of s[k] as any[])if(row.demo)demoIds.add(row.id);
  for(const k of Object.keys(schemas) as Kind[]){
    for(const r of s[k] as any[]){
      if(!r.demo&&Object.entries(r).some(([key,v])=>key.endsWith('Id')&&typeof v==='string'&&demoIds.has(v)))fail('Hay datos propios vinculados a la demostración. Elimina o desvincula esos datos primero');
    }
  }
  for(const k of Object.keys(schemas) as Kind[])(s[k] as any[])=(s[k] as any[]).filter(x=>!x.demo);
 }else if(cmd.action==='delete'){
  const k=cmd.kind!;if(!schemas[k])fail('Registro no válido');get(s,k,cmd.id!);
  const links:Partial<Record<Kind,[Kind,string][]>>={companies:[['opportunities','companyId'],['interactions','companyId'],['people','companyId'],['purchases','supplierCompanyId'],['contracts','companyId']],opportunities:[['quotes','opportunityId'],['interactions','opportunityId'],['followups','opportunityId']],quotes:[['orders','quoteId']],orders:[['projects','orderId'],['invoices','orderId'],['recurringInvoices','orderId']],projects:[['delivery','projectId'],['purchases','projectId']],delivery:[['hours','taskId']],contracts:[['recurringInvoices','contractId']]};
  if(links[k]?.some(([child,key])=>(s[child] as any[]).some(r=>r[key]===cmd.id)))fail('Tiene registros vinculados. Elimínalos primero para conservar la trazabilidad');
  if(k==='hours'&&billedHourIds(s).has(cmd.id!))fail('Estas horas ya están facturadas');
  if(k==='payments'||k==='purchasePayments')fail('Usa anular cobro/pago para quitar un movimiento');
  if(k==='stockMoves')fail('Los movimientos de stock no se borran a mano');
  if(k==='invoices'){
    const invoice=get(s,'invoices',cmd.id!);
    if(!isDraft(invoice))fail('Solo se pueden borrar borradores. Anula una factura emitida con una rectificativa');
    s.payments=s.payments.filter(p=>p.invoiceId!==cmd.id);
  }
  if(k==='purchases'){
    const purchase=get(s,'purchases',cmd.id!);
    if(purchase.status!=='draft')fail('Solo se borran borradores de compra. Anula las registradas');
    s.purchasePayments=s.purchasePayments.filter(p=>p.purchaseId!==cmd.id);
  }
  (s[k] as any[])=(s[k] as any[]).filter(x=>x.id!==cmd.id);
 }else fail('Acción no reconocida');
 for(const i of s.invoices){
  if(i.dueDate<i.date)fail('El vencimiento no puede ser anterior a la factura');
  if(s.payments.some(p=>p.invoiceId===i.id&&p.date<i.date))fail('La emisión no puede ser posterior al cobro');
  if(i.number&&s.invoices.some(j=>j.id!==i.id&&j.number&&j.number===i.number))fail('Ya existe una factura con esta referencia');
  if(!i.number&&i.title&&s.invoices.some(j=>j.id!==i.id&&!j.number&&j.title===i.title))fail('Ya existe una factura con esta referencia');
 }
 for(const o of s.opportunities)if(o.amount!==round(o.amount))fail('El importe admite como máximo dos decimales');
 return s;
}

export function seed():State{
 const s=emptyState();const demo=true;
 s.leads.push(
  {id:'demo-lead',demo,name:'Nubia Servicios',contact:'Laura Martín',email:'laura@nubia.example',phone:'',source:'Referencia',status:'Nuevo',notes:'Busca apoyo para ordenar su proceso comercial y empezar en octubre.',nextDate:dateOffset(3),createdAt:dateOffset(-3)},
  {id:'demo-lead-contacted',demo,name:'Taller Oeste',contact:'Andrés Vidal',email:'andres@talleroeste.example',phone:'',source:'Web',status:'Contactado',notes:'Pidió una llamada para ver si el seguimiento comercial les encaja. La fecha ya pasó.',nextDate:dateOffset(-1),createdAt:dateOffset(-6)},
  {id:'demo-lead-ready',demo,name:'Clínica Bruma',contact:'Elena Ruiz',email:'elena@bruma.example',phone:'',source:'Evento',status:'Cualificado',notes:'Quiere una propuesta para ordenar presupuestos y seguimientos. Orientación: 3.200 €.',nextDate:dateOffset(1),createdAt:dateOffset(-2)}
 );
 s.companies.push({id:'demo-company',demo,name:'Prueba Peña',email:'',contact:'Responsable de operaciones',phone:'',contactDays:30,taxId:'B12345678',address:'Calle Ejemplo 1, Madrid',paymentDays:30,companyRole:'client'});
 s.services.push({id:'demo-service',demo,name:'Servicio a medida',price:2400,kind:'service',policy:'fixed',tasks:'Preparación\nEjecución\nEntrega y revisión',sku:'',stock:0,minStock:0,cost:0,unit:'ud'});
 s.opportunityTags.push({id:'demo-tag-prioridad',name:'Prioridad',color:'amber',archived:false},{id:'demo-tag-saas',name:'SaaS',color:'blue',archived:false});
 s.projectTags.push({id:'demo-ptag-entrega',name:'Entrega',color:'green',archived:false},{id:'demo-ptag-interno',name:'Interno',color:'violet',archived:false});
 s.opportunities.push(
  {id:'demo-opportunity',demo,companyId:'demo-company',title:'Servicio a medida · segunda fase',amount:4800,stageId:'stage-propuesta',closeDate:dateOffset(5),nextStep:'Revisar la propuesta con el responsable',nextDate:dateOffset(-2),createdAt:dateOffset(-40),tagIds:['demo-tag-prioridad'],mrr:320,ownerUserId:'',lostReasonId:'',rank:1,priority:0,stageHistory:[]},
  {id:'demo-won',demo,companyId:'demo-company',title:'Servicio a medida · primera fase',amount:2400,stageId:'stage-ganada',closeDate:dateOffset(-12),nextStep:'Revisar la entrega inicial',nextDate:dateOffset(4),createdAt:dateOffset(-50),tagIds:[],mrr:null,ownerUserId:'',lostReasonId:'',rank:1,priority:0,stageHistory:[]}
 );
 s.people.push({id:'demo-person',demo,companyId:'demo-company',name:'Responsable de operaciones',email:'',phone:'',role:'Decisor',opportunityId:'demo-opportunity'});
 s.interactions.push(...[-18,-10,-4].map((n,i)=>({id:'demo-contact-'+i,demo,companyId:'demo-company',opportunityId:'demo-opportunity',kind:['Llamada','Reunión','Email'][i] as Entity['interactions']['kind'],date:dateOffset(n),notes:['Primera conversación sobre las necesidades de la empresa.','Revisamos el alcance de la segunda fase y las fechas.','Propuesta enviada. Pendiente de revisar condiciones.'][i]})));
 s.followups.push({id:'demo-followup',demo,opportunityId:'demo-opportunity',title:'Llamar para revisar la propuesta',dueDate:dateOffset(-2),done:false});
 s.quotes.push({id:'demo-quote',demo,opportunityId:'demo-won',title:'P-001 · Servicio a medida',lines:[{description:'Servicio a medida · primera fase',quantity:1,price:2400,policy:'fixed',tasks:'Preparación\nEjecución\nEntrega y revisión',itemId:''}]});
 const withOrder=apply(s,{action:'confirm',id:'demo-quote'});withOrder.projects[0].tagIds=['demo-ptag-entrega'];const plan=[[-20,-12,'Hecho'],[-6,4,'En curso'],[5,18,'Por hacer']] as const;withOrder.delivery.forEach((task,index)=>{const [from,to,status]=plan[index]??[0,7,'Por hacer'];task.startDate=dateOffset(from);task.dueDate=dateOffset(to);task.status=status;task.done=status==='Hecho'});const task=withOrder.delivery[0];withOrder.hours.push({id:'demo-hours',demo,taskId:task.id,date:dateOffset(-1),hours:4,cost:35,notes:'Preparación de la primera entrega'});
 return apply(withOrder,{action:'invoice',id:withOrder.orders[0].id,policy:'fixed',title:'F-001 · Servicio a medida',date:today(),dueDate:dateOffset(30)});
}

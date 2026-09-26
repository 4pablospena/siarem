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
const line=z.object({description:name,quantity:z.number().positive().max(1e6),price:money,policy:z.enum(['fixed','milestones','hours']),tasks:z.string().trim().min(1,'Añade al menos una tarea de entrega').max(5000)});
const stageHistoryEntry=z.object({id:z.string().min(1),at:z.string().min(1),fromStageId:z.string(),toStageId:z.string().min(1),user:z.string().max(200).default('')});
export const leadStatuses = ['Nuevo','Contactado','Cualificado','Convertido','Descartado'] as const;
export const taskStatuses = ['Por hacer','En curso','Hecho'] as const;
export const leadSources = ['Web','Referencia','Outbound','Evento','Otro'] as const;
export const personRoles = ['Decisor','Técnico','Finanzas','Otro'] as const;
export const schemas={
 leads:z.object({...base,name,contact:z.string().max(200),email:z.string().email('El correo no es válido').or(z.literal('')),phone:z.string().max(100),source:z.enum(leadSources),status:z.enum(leadStatuses),notes:z.string().max(3000),nextDate:date.or(z.literal('')),createdAt:date,convertedCompanyId:z.string().optional(),convertedOpportunityId:z.string().optional()}),
 companies:z.object({...base,name,email:z.string().email('El correo no es válido').or(z.literal('')),contact:z.string().max(500),phone:z.string().max(100),contactDays:z.number().int().min(1).max(90)}),
 people:z.object({...base,companyId:name,name,email:z.string().email('El correo no es válido').or(z.literal('')),phone:z.string().max(100),role:z.enum(personRoles),opportunityId:z.string().max(80).default('')}),
 services:z.object({...base,name,price:money,policy:z.enum(['fixed','milestones','hours']),tasks:z.string().trim().min(1,'Añade al menos una tarea de entrega').max(5000)}),
 opportunities:z.object({
  ...base,companyId:name,title:name,amount:money,stageId:z.string().min(1),
  closeDate:date,nextStep:z.string().max(500),nextDate:date.or(z.literal('')),createdAt:date,
  tagIds:z.array(z.string()).default([]),
  mrr:money.nullable().optional(),
  ownerUserId:z.string().max(120).default(''),
  lostReasonId:z.string().max(80).default(''),
  rank:z.number().finite().default(0),
  stageHistory:z.array(stageHistoryEntry).default([]),
 }),
 interactions:z.object({...base,companyId:name,opportunityId:z.string(),kind:z.enum(['Llamada','Email','Reunión','Nota']),date,notes:name}),
 followups:z.object({...base,opportunityId:name,title:name,dueDate:date,done:z.boolean()}),
 quotes:z.object({...base,opportunityId:name,title:name,lines:z.array(line).min(1).max(100)}),
 orders:z.object({...base,quoteId:name,title:name,lines:z.array(line).min(1).max(100),confirmed:z.boolean()}),
 projects:z.object({...base,orderId:z.string().max(80).default(''),title:name,body:z.string().max(2000).default('')}),
 delivery:z.object({...base,projectId:name,lineIndex:z.number().int().min(0).default(0),title:name,done:z.boolean(),status:z.enum(taskStatuses).default('Por hacer'),assignee:z.string().max(120).default(''),startDate:date.or(z.literal('')).default(''),dueDate:date.or(z.literal('')).default('')}),
 hours:z.object({...base,taskId:name,date,hours:z.number().positive().max(24),cost:money,notes:z.string().max(500)}),
 invoices:z.object({...base,orderId:name,title:name,date,dueDate:date,amount:money,policy:z.enum(['fixed','milestones','hours']),hourIds:z.array(z.string()),paid:z.boolean()}),
 payments:z.object({...base,invoiceId:name,date,amount:money})
};
export type Kind=keyof typeof schemas;
export type Entity={ [K in Kind]:z.infer<typeof schemas[K]> };
export type State={ [K in Kind]:Entity[K][] } & {
  pipelineStages: PipelineStage[];
  opportunityTags: OpportunityTag[];
  lostReasons: LostReason[];
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
  lostReasons: defaultLostReasons(),
  botActions: [],
});

function migrateOpportunity(row: Entity['opportunities'] & {stage?: string; stageId?: string; tagIds?: string[]; mrr?: number | null; ownerUserId?: string; lostReasonId?: string; rank?: number; stageHistory?: StageHistoryEntry[]}, stagesMap: PipelineStage[]) {
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

  state.opportunityTags = (Array.isArray(input.opportunityTags) ? input.opportunityTags : []).map(tag => ({
    id: tag.id,
    name: String(tag.name || '').trim() || 'Etiqueta',
    color: TAG_COLORS.includes(tag.color) ? tag.color : 'slate',
    archived: !!tag.archived,
  }));
  state.lostReasons = (Array.isArray(input.lostReasons) && input.lostReasons.length
    ? input.lostReasons
    : defaultLostReasons()).map(reason => ({
    id: reason.id,
    name: String(reason.name || '').trim() || 'Motivo',
    archived: !!reason.archived,
  }));

  for (const opportunity of state.opportunities) migrateOpportunity(opportunity as Entity['opportunities'] & {stage?: string}, state.pipelineStages);
  for (const project of state.projects) {
    const row = project as Entity['projects'] & {orderId?: string; body?: string};
    row.orderId = row.orderId || '';
    row.body = row.body ?? '';
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
  return state;
}

export const total=(lines:Entity['quotes']['lines'])=>Math.round(lines.reduce((s,l)=>s+l.quantity*l.price,0)*100)/100;
export const round=(n:number)=>Math.round(n*100)/100;
export const eur=(n:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n);
export function companyForOrder(s:State,id:string){const o=s.orders.find(x=>x.id===id);const q=s.quotes.find(x=>x.id===o?.quoteId);return s.opportunities.find(x=>x.id===q?.opportunityId)?.companyId}
export function projectCost(s:State,id:string){return round(s.hours.filter(h=>s.delivery.some(t=>t.id===h.taskId&&t.projectId===id)).reduce((a,h)=>a+h.hours*h.cost,0))}

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

function appendStageHistory(o:Entity['opportunities'], fromStageId:string, toStageId:string, user=''){
  o.stageHistory=[...(o.stageHistory||[]),{id:crypto.randomUUID(),at:new Date().toISOString(),fromStageId,toStageId,user}];
}

export type Command={
  action:string;kind?:Kind;record?:unknown;id?:string;stage?:string;stageId?:string;expectedStage?:string;expectedStageId?:string;
  policy?:string;amount?:number;title?:string;date?:string;dueDate?:string;hourIds?:string[];
  stages?:PipelineStage[];tags?:OpportunityTag[];reasons?:LostReason[];lostReasonId?:string;user?:string;rank?:number;direction?:'up'|'down';
};

export function apply(s0:State,cmd:Command):State{
 const s=structuredClone(ensureState(s0));const id=()=>crypto.randomUUID();
 if(cmd.action==='save'){
  const k=cmd.kind;if(!k||!schemas[k])fail('Tipo de registro no válido');
  if(['invoices','payments'].includes(k!))fail('Usa la acción específica para este registro');
  const r=schemas[k!].parse(cmd.record) as any;
  const old=(s[k!] as any[]).find(x=>x.id===r.id);r.demo=old?.demo??false;
  if(!old){if(k==='opportunities'||k==='interactions'||k==='people')r.demo=get(s,'companies',r.companyId).demo;if(k==='followups'||k==='quotes')r.demo=get(s,'opportunities',r.opportunityId).demo;if(k==='orders')r.demo=get(s,'quotes',r.quoteId).demo;if(k==='delivery')r.demo=get(s,'projects',r.projectId).demo;if(k==='hours')r.demo=get(s,'delivery',r.taskId).demo;if(k==='services')r.demo=false}
  if(k==='leads'){if(old){r.createdAt=old.createdAt;r.convertedCompanyId=old.convertedCompanyId;r.convertedOpportunityId=old.convertedOpportunityId;if(old.status==='Convertido')r.status='Convertido'}else{r.createdAt=today();if(r.status==='Convertido')fail('Convierte el lead para crear la empresa y la oportunidad')}}
  if(k==='people'){get(s,'companies',r.companyId);if(r.opportunityId&&get(s,'opportunities',r.opportunityId).companyId!==r.companyId)fail('La oportunidad no corresponde a la empresa')}
  if(k==='services'){/* catalog entry */}
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
  if(k==='hours'){get(s,'delivery',r.taskId);if(s.invoices.some(i=>i.hourIds.includes(r.id)))fail('Estas horas ya están facturadas');if(r.date>today())fail('No puedes imputar horas futuras')}
  (s[k!] as any[])=(s[k!] as any[]).filter(x=>x.id!==r.id).concat(r);
 }else if(cmd.action==='convertLead'){
  const lead=get(s,'leads',cmd.id!);
  if(lead.status==='Descartado')fail('Un lead descartado no se convierte. Vuelve a abrirlo si retoma el interés');
  if(lead.status==='Convertido')fail('Este lead ya está convertido');
  const company=s.companies.find(c=>c.id===lead.convertedCompanyId)||s.companies.find(c=>c.demo===lead.demo&&(sameText(c.name,lead.name)||sameText(c.email,lead.email)));
  const companyId=company?.id||lead.convertedCompanyId||id();
  if(company){for(const field of ['contact','email','phone'] as const)if(!company[field]&&lead[field])company[field]=lead[field]}
  else s.companies.push({id:companyId,demo:lead.demo,name:lead.name,email:lead.email,contact:lead.contact,phone:lead.phone,contactDays:30});
  const opportunityId=id();
  const openId=firstOpenStageId(s);
  s.opportunities.push({id:opportunityId,demo:lead.demo,companyId,title:cmd.title||`Oportunidad · ${lead.name}`,amount:0,stageId:openId,closeDate:dateOffset(30),nextStep:lead.nextDate?'Contactar en la fecha prevista':'Preparar la primera reunión',nextDate:lead.nextDate||today(),createdAt:today(),tagIds:[],mrr:null,ownerUserId:'',lostReasonId:'',rank:maxRankInStage(s,openId)+1,stageHistory:[]});
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
  if(o.stageId===toId)return s;
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
  o.rank=maxRankInStage(s,toId)+1;
 }else if(cmd.action==='rankOpportunity'){
  const o=get(s,'opportunities',cmd.id!);
  const column=s.opportunities.filter(item=>item.stageId===o.stageId).sort((a,b)=>(a.rank||0)-(b.rank||0)||a.id.localeCompare(b.id));
  const index=column.findIndex(item=>item.id===o.id);
  if(index<0)return s;
  const swapWith=cmd.direction==='up'?index-1:cmd.direction==='down'?index+1:-1;
  if(swapWith<0||swapWith>=column.length)return s;
  const other=column[swapWith];
  const currentRank=o.rank||0;o.rank=other.rank||0;other.rank=currentRank;
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
  o.confirmed=true;const p={id:id(),demo:o.demo,orderId:o.id,title:o.title,body:''};s.projects.push(p);
  o.lines.forEach((l,n)=>l.tasks.split('\n').map(x=>x.trim()).filter(Boolean).forEach(title=>s.delivery.push({id:id(),demo:o!.demo,projectId:p.id,lineIndex:n,title,done:false,status:'Por hacer',assignee:'',startDate:'',dueDate:''})));
  const opportunity=get(s,'opportunities',q.opportunityId);
  const won=wonStageId(s);
  if(opportunity.stageId!==won){appendStageHistory(opportunity,opportunity.stageId,won,cmd.user||'');opportunity.stageId=won;opportunity.rank=maxRankInStage(s,won)+1}
 }else if(cmd.action==='invoice'){
  const o=get(s,'orders',cmd.id!);if(!o.confirmed)fail('Confirma el pedido antes de facturar');
  const policy=z.enum(['fixed','milestones','hours']).parse(cmd.policy);
  const eligible=o.lines.map((l,i)=>({l,i})).filter(x=>x.l.policy===policy);if(!eligible.length)fail('El pedido no tiene líneas con esta política');
  let amount=0;let hourIds:string[]=[];
  if(policy==='hours'){
   const selected=z.array(z.string()).min(1,'Selecciona horas pendientes').parse(cmd.hourIds);if(new Set(selected).size!==selected.length)fail('Horas duplicadas');
   const hs=selected.map(h=>get(s,'hours',h));for(const h of hs){const t=get(s,'delivery',h.taskId);const p=get(s,'projects',t.projectId);if(p.orderId!==o.id||o.lines[t.lineIndex].policy!=='hours')fail('Las horas no corresponden a esta política o pedido');if(s.invoices.some(i=>i.hourIds.includes(h.id)))fail('Hay horas ya facturadas');amount+=h.hours*o.lines[t.lineIndex].price}hourIds=selected;
  }else{
   const budget=total(eligible.map(x=>x.l));const billed=s.invoices.filter(i=>i.orderId===o.id&&i.policy===policy).reduce((a,i)=>a+i.amount,0);const remaining=round(budget-billed);
   amount=policy==='fixed'?remaining:money.positive('El importe debe ser mayor que cero').parse(cmd.amount);
   if(amount<=0||amount>remaining)fail(`Importe pendiente: ${eur(remaining)}`);
  }
  if(round(amount)<=0)fail('El importe de la factura debe ser mayor que cero');
  s.invoices.push(schemas.invoices.parse({id:id(),demo:o.demo,orderId:o.id,title:cmd.title,date:cmd.date,dueDate:cmd.dueDate,amount:round(amount),policy,hourIds,paid:false}));
 }else if(cmd.action==='editInvoice'){
  const i=get(s,'invoices',cmd.id!);i.title=name.parse(cmd.title);i.date=date.parse(cmd.date);i.dueDate=date.parse(cmd.dueDate);
 }else if(cmd.action==='pay'){
  const i=get(s,'invoices',cmd.id!);if(i.paid)fail('La factura ya está cobrada');if(cmd.date!>today()||cmd.date!<i.date)fail('La fecha de cobro debe estar entre la emisión y hoy');s.payments.push({id:id(),demo:i.demo,invoiceId:i.id,date:date.parse(cmd.date),amount:i.amount});i.paid=true;
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
  const links:Partial<Record<Kind,[Kind,string][]>>={companies:[['opportunities','companyId'],['interactions','companyId'],['people','companyId']],opportunities:[['quotes','opportunityId'],['interactions','opportunityId'],['followups','opportunityId']],quotes:[['orders','quoteId']],orders:[['projects','orderId'],['invoices','orderId']],projects:[['delivery','projectId']],delivery:[['hours','taskId']]};
  if(links[k]?.some(([child,key])=>(s[child] as any[]).some(r=>r[key]===cmd.id)))fail('Tiene registros vinculados. Elimínalos primero para conservar la trazabilidad');
  if(k==='hours'&&s.invoices.some(i=>i.hourIds.includes(cmd.id!)))fail('Estas horas ya están facturadas');
  if(k==='payments')fail('El cobro registrado no puede borrarse desde esta acción');
  if(k==='invoices')s.payments=s.payments.filter(p=>p.invoiceId!==cmd.id);
  (s[k] as any[])=(s[k] as any[]).filter(x=>x.id!==cmd.id);
 }else fail('Acción no reconocida');
 for(const i of s.invoices){if(i.dueDate<i.date)fail('El vencimiento no puede ser anterior a la factura');if(s.payments.some(p=>p.invoiceId===i.id&&p.date<i.date))fail('La emisión no puede ser posterior al cobro');if(s.invoices.some(j=>j.id!==i.id&&j.title===i.title))fail('Ya existe una factura con esta referencia')}
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
 s.companies.push({id:'demo-company',demo,name:'Prueba Peña',email:'',contact:'Responsable de operaciones',phone:'',contactDays:30});
 s.services.push({id:'demo-service',demo,name:'Servicio a medida',price:2400,policy:'fixed',tasks:'Preparación\nEjecución\nEntrega y revisión'});
 s.opportunityTags.push({id:'demo-tag-prioridad',name:'Prioridad',color:'amber',archived:false},{id:'demo-tag-saas',name:'SaaS',color:'blue',archived:false});
 s.opportunities.push(
  {id:'demo-opportunity',demo,companyId:'demo-company',title:'Servicio a medida · segunda fase',amount:4800,stageId:'stage-propuesta',closeDate:dateOffset(5),nextStep:'Revisar la propuesta con el responsable',nextDate:dateOffset(-2),createdAt:dateOffset(-40),tagIds:['demo-tag-prioridad'],mrr:320,ownerUserId:'',lostReasonId:'',rank:1,stageHistory:[]},
  {id:'demo-won',demo,companyId:'demo-company',title:'Servicio a medida · primera fase',amount:2400,stageId:'stage-ganada',closeDate:dateOffset(-12),nextStep:'Revisar la entrega inicial',nextDate:dateOffset(4),createdAt:dateOffset(-50),tagIds:[],mrr:null,ownerUserId:'',lostReasonId:'',rank:1,stageHistory:[]}
 );
 s.people.push({id:'demo-person',demo,companyId:'demo-company',name:'Responsable de operaciones',email:'',phone:'',role:'Decisor',opportunityId:'demo-opportunity'});
 s.interactions.push(...[-18,-10,-4].map((n,i)=>({id:'demo-contact-'+i,demo,companyId:'demo-company',opportunityId:'demo-opportunity',kind:['Llamada','Reunión','Email'][i] as Entity['interactions']['kind'],date:dateOffset(n),notes:['Primera conversación sobre las necesidades de la empresa.','Revisamos el alcance de la segunda fase y las fechas.','Propuesta enviada. Pendiente de revisar condiciones.'][i]})));
 s.followups.push({id:'demo-followup',demo,opportunityId:'demo-opportunity',title:'Llamar para revisar la propuesta',dueDate:dateOffset(-2),done:false});
 s.quotes.push({id:'demo-quote',demo,opportunityId:'demo-won',title:'P-001 · Servicio a medida',lines:[{description:'Servicio a medida · primera fase',quantity:1,price:2400,policy:'fixed',tasks:'Preparación\nEjecución\nEntrega y revisión'}]});
 const withOrder=apply(s,{action:'confirm',id:'demo-quote'});const plan=[[-20,-12,'Hecho'],[-6,4,'En curso'],[5,18,'Por hacer']] as const;withOrder.delivery.forEach((task,index)=>{const [from,to,status]=plan[index]??[0,7,'Por hacer'];task.startDate=dateOffset(from);task.dueDate=dateOffset(to);task.status=status;task.done=status==='Hecho'});const task=withOrder.delivery[0];withOrder.hours.push({id:'demo-hours',demo,taskId:task.id,date:dateOffset(-1),hours:4,cost:35,notes:'Preparación de la primera entrega'});
 return apply(withOrder,{action:'invoice',id:withOrder.orders[0].id,policy:'fixed',title:'F-001 · Servicio a medida',date:today(),dueDate:dateOffset(30)});
}

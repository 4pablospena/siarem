import { z } from 'zod';
export const stages = ['Cualificación','Propuesta','Negociación','Ganada','Perdida'] as const;
const legacyStages: Record<string,(typeof stages)[number]> = {'Lead Discovery':'Cualificación','Meeting Scheduled':'Cualificación','Sales Qualified':'Cualificación','Proposal sent & Negotiation':'Propuesta','Won & Ongoing':'Ganada','Finnished':'Ganada','ReActivate in the future':'Cualificación','Lost or Discarded':'Perdida'};
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const dateOffset = (n:number) => {const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export const days = (date:string, now=today()) => Math.floor((Date.parse(now+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000);
const name=z.string().trim().min(1,'Falta un campo obligatorio').max(500);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Indica una fecha válida').refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Fecha no válida');
const money=z.number().finite().min(0).max(1e10);
const base={id:z.string().min(1),demo:z.boolean().default(false)};
const line=z.object({description:name,quantity:z.number().positive().max(1e6),price:money,policy:z.enum(['fixed','milestones','hours']),tasks:z.string().trim().min(1,'Añade al menos una tarea de entrega').max(5000)});
export const leadStatuses = ['Nuevo','Contactado','Cualificado','Convertido','Descartado'] as const;
export const leadSources = ['Web','Referencia','Outbound','Evento','Otro'] as const;
export const schemas={
 leads:z.object({...base,name,contact:z.string().max(200),email:z.string().email('El correo no es válido').or(z.literal('')),phone:z.string().max(100),source:z.enum(leadSources),status:z.enum(leadStatuses),notes:z.string().max(3000),nextDate:date.or(z.literal('')),createdAt:date,convertedCompanyId:z.string().optional(),convertedOpportunityId:z.string().optional()}),
 companies:z.object({...base,name,email:z.string().email('El correo no es válido').or(z.literal('')),contact:z.string().max(500),phone:z.string().max(100),contactDays:z.number().int().min(1).max(90)}),
 opportunities:z.object({...base,companyId:name,title:name,amount:money,stage:z.enum(stages),closeDate:date,nextStep:z.string().max(500),nextDate:date.or(z.literal('')),createdAt:date}),
 interactions:z.object({...base,companyId:name,opportunityId:z.string(),kind:z.enum(['Llamada','Email','Reunión','Nota']),date,notes:name}),
 followups:z.object({...base,opportunityId:name,title:name,dueDate:date,done:z.boolean()}),
 quotes:z.object({...base,opportunityId:name,title:name,lines:z.array(line).min(1).max(100)}),
 orders:z.object({...base,quoteId:name,title:name,lines:z.array(line).min(1).max(100),confirmed:z.boolean()}),
 projects:z.object({...base,orderId:name,title:name}),
 delivery:z.object({...base,projectId:name,lineIndex:z.number().int().min(0),title:name,done:z.boolean()}),
 hours:z.object({...base,taskId:name,date,hours:z.number().positive().max(24),cost:money,notes:z.string().max(500)}),
 invoices:z.object({...base,orderId:name,title:name,date,dueDate:date,amount:money,policy:z.enum(['fixed','milestones','hours']),hourIds:z.array(z.string()),paid:z.boolean()}),
 payments:z.object({...base,invoiceId:name,date,amount:money})
};
export type Kind=keyof typeof schemas;
export type Entity={ [K in Kind]:z.infer<typeof schemas[K]> };
export type State={ [K in Kind]:Entity[K][] };
export const emptyState=():State=>Object.fromEntries(Object.keys(schemas).map(k=>[k,[]])) as unknown as State;
export function ensureState(input:State):State{const state=structuredClone({...emptyState(),...input,leads:input.leads??[]}) as State;for(const opportunity of state.opportunities){const stage=legacyStages[(opportunity as {stage:string}).stage];if(stage)opportunity.stage=stage}return state}
export const total=(lines:Entity['quotes']['lines'])=>Math.round(lines.reduce((s,l)=>s+l.quantity*l.price,0)*100)/100;
export const round=(n:number)=>Math.round(n*100)/100;
export const eur=(n:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n);
export function companyForOrder(s:State,id:string){const o=s.orders.find(x=>x.id===id);const q=s.quotes.find(x=>x.id===o?.quoteId);return s.opportunities.find(x=>x.id===q?.opportunityId)?.companyId}
export function projectCost(s:State,id:string){return round(s.hours.filter(h=>s.delivery.some(t=>t.id===h.taskId&&t.projectId===id)).reduce((a,h)=>a+h.hours*h.cost,0))}
export function risk(s:State,o:Entity['opportunities'],now=today()){
 const c=s.companies.find(c=>c.id===o.companyId)!;
 const contacts=s.interactions.filter(i=>i.companyId===o.companyId).map(i=>i.date).sort();
 const contacted=contacts.length>0;const last=contacts.at(-1)||o.createdAt; const elapsed=days(last,now);
 if(o.stage==='Perdida')return {level:0,label:'Sin alerta',reason:'Oportunidad cerrada',last,elapsed,contacted};
 const overdue=s.followups.filter(t=>t.opportunityId===o.id&&!t.done&&t.dueDate<now);
 const reasons=[];if(o.nextDate&&o.nextDate<now)reasons.push('Siguiente paso vencido');if(overdue.length)reasons.push(`${overdue.length} seguimiento${overdue.length>1?'s':''} vencido${overdue.length>1?'s':''}`);if(elapsed>=c.contactDays)reasons.push(`${elapsed} días sin contacto · límite ${c.contactDays}`);
 if(reasons.length)return {level:2,label:'Crítico',reason:reasons.join(' · '),last,elapsed,contacted};
 if(o.stage!=='Ganada'&&days(o.closeDate,now)>=-7&&!s.followups.some(t=>t.opportunityId===o.id&&!t.done))return {level:1,label:'Atención',reason:o.closeDate<now?'Cierre vencido sin seguimiento pendiente':'Cierre en 7 días o menos sin seguimiento pendiente',last,elapsed,contacted};
 return {level:0,label:'Al día',reason:'Seguimiento dentro de plazo',last,elapsed,contacted};
}
const fail=(message:string):never=>{throw new Error(message)};
function get<K extends Kind>(s:State,k:K,id:string):Entity[K]{return (s[k] as Entity[K][]).find(x=>x.id===id)||fail('El registro no existe en tu empresa')}
export type Command={action:string;kind?:Kind;record?:unknown;id?:string;stage?:string;expectedStage?:string;policy?:string;amount?:number;title?:string;date?:string;dueDate?:string;hourIds?:string[]};
export function apply(s0:State,cmd:Command):State{
 const s=structuredClone(ensureState(s0));const id=()=>crypto.randomUUID();
 if(cmd.action==='save'){
  const k=cmd.kind;if(!k||!schemas[k])fail('Tipo de registro no válido');
  if(['projects','invoices','payments'].includes(k!))fail('Usa la acción específica para este registro');
  const r=schemas[k!].parse(cmd.record) as any;
  const old=(s[k!] as any[]).find(x=>x.id===r.id);r.demo=old?.demo??false;
  if(!old){if(k==='opportunities'||k==='interactions')r.demo=get(s,'companies',r.companyId).demo;if(k==='followups'||k==='quotes')r.demo=get(s,'opportunities',r.opportunityId).demo;if(k==='orders')r.demo=get(s,'quotes',r.quoteId).demo;if(k==='delivery')r.demo=get(s,'projects',r.projectId).demo;if(k==='hours')r.demo=get(s,'delivery',r.taskId).demo}
  if(k==='leads'){if(old){r.createdAt=old.createdAt;r.convertedCompanyId=old.convertedCompanyId;r.convertedOpportunityId=old.convertedOpportunityId;if(old.status==='Convertido')r.status='Convertido'}else{r.createdAt=today();if(r.status==='Convertido')fail('Convierte el lead para crear la empresa y la oportunidad')}}
  if(k==='opportunities'){get(s,'companies',r.companyId);if(old){r.createdAt=old.createdAt;if(r.companyId!==old.companyId&&(s.interactions.some(i=>i.opportunityId===r.id)||s.quotes.some(q=>q.opportunityId===r.id)))fail('Esta oportunidad tiene interacciones o presupuestos. Conserva su empresa de origen')}else r.createdAt=today()}
  if(k==='interactions'){get(s,'companies',r.companyId);if(r.opportunityId&&get(s,'opportunities',r.opportunityId).companyId!==r.companyId)fail('La oportunidad no corresponde a la empresa');if(r.date>today())fail('El contacto no puede tener una fecha futura')}
  if(k==='followups')get(s,'opportunities',r.opportunityId);
  if(k==='quotes'){get(s,'opportunities',r.opportunityId);if(s.orders.some(o=>o.quoteId===r.id))fail('Este presupuesto ya tiene un pedido. Edita el pedido si aún es borrador')}
  if(k==='orders'){get(s,'quotes',r.quoteId);if(old?.confirmed){if(r.quoteId!==old.quoteId||JSON.stringify(r.lines)!==JSON.stringify(old.lines))fail('Las líneas de un pedido confirmado quedan bloqueadas para conservar sus facturas y horas');r.confirmed=true;const project=s.projects.find(p=>p.orderId===r.id);if(project)project.title=r.title}else r.confirmed=false;if(s.orders.some(o=>o.quoteId===r.quoteId&&o.id!==r.id))fail('Este presupuesto ya tiene un pedido')}
  if(k==='delivery'){const p=get(s,'projects',r.projectId);const o=get(s,'orders',p.orderId);if(r.lineIndex>=o.lines.length)fail('Línea de pedido no válida');if(old&&(r.projectId!==old.projectId||r.lineIndex!==old.lineIndex)&&s.hours.some(h=>h.taskId===r.id))fail('No puedes mover una tarea con horas imputadas')}
  if(k==='hours'){get(s,'delivery',r.taskId);if(s.invoices.some(i=>i.hourIds.includes(r.id)))fail('Estas horas ya están facturadas');if(r.date>today())fail('No puedes imputar horas futuras')}
  (s[k!] as any[])=(s[k!] as any[]).filter(x=>x.id!==r.id).concat(r);
 }else if(cmd.action==='convertLead'){
  const lead=get(s,'leads',cmd.id!);
  if(lead.status==='Descartado')fail('Un lead descartado no se convierte. Vuelve a abrirlo si retoma el interés');
  if(lead.status==='Convertido')fail('Este lead ya está convertido');
  const companyId=lead.convertedCompanyId||id();
  if(!s.companies.some(c=>c.id===companyId))s.companies.push({id:companyId,demo:lead.demo,name:lead.name,email:lead.email,contact:lead.contact,phone:lead.phone,contactDays:30});
  const opportunityId=id();
  s.opportunities.push({id:opportunityId,demo:lead.demo,companyId,title:cmd.title||`Oportunidad · ${lead.name}`,amount:0,stage:'Cualificación',closeDate:dateOffset(30),nextStep:lead.nextDate?'Contactar en la fecha prevista':'Preparar la primera reunión',nextDate:lead.nextDate||today(),createdAt:today()});
  if(lead.notes.trim())s.interactions.push({id:id(),demo:lead.demo,companyId,opportunityId,kind:'Nota',date:today(),notes:`Lead convertido · ${lead.notes}`});
  lead.status='Convertido';lead.convertedCompanyId=companyId;lead.convertedOpportunityId=opportunityId;
 }else if(cmd.action==='stage'){
  const o=get(s,'opportunities',cmd.id!);if(cmd.expectedStage&&o.stage!==cmd.expectedStage)fail('La etapa ha cambiado. Recarga antes de deshacer');o.stage=z.enum(stages).parse(cmd.stage);
 }else if(cmd.action==='complete'){
  const t=get(s,'followups',cmd.id!);t.done=!t.done;
 }else if(cmd.action==='confirm'){
  const q=get(s,'quotes',cmd.id!);let o=s.orders.find(o=>o.quoteId===q.id);
  if(o?.confirmed)fail('El pedido ya está confirmado');
  if(!o){o={id:id(),demo:q.demo,quoteId:q.id,title:q.title,lines:structuredClone(q.lines),confirmed:false};s.orders.push(o)}
  o.confirmed=true;const p={id:id(),demo:o.demo,orderId:o.id,title:o.title};s.projects.push(p);
  o.lines.forEach((l,n)=>l.tasks.split('\n').map(x=>x.trim()).filter(Boolean).forEach(title=>s.delivery.push({id:id(),demo:o!.demo,projectId:p.id,lineIndex:n,title,done:false})));
  get(s,'opportunities',q.opportunityId).stage='Ganada';
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
  // Retain demonstration parents when real records depend on them.
  const demoIds=new Set(Object.values(s).flat().filter(x=>x.demo).map(x=>x.id));
  for(const r of Object.values(s).flat()){if(!r.demo&&Object.entries(r).some(([k,v])=>k.endsWith('Id')&&demoIds.has(v as string)))fail('Hay datos propios vinculados a la demostración. Elimina o desvincula esos datos primero')}
  for(const k of Object.keys(s) as Kind[])(s[k] as any[])=(s[k] as any[]).filter(x=>!x.demo);
 }else if(cmd.action==='delete'){
  const k=cmd.kind!;if(!schemas[k])fail('Registro no válido');get(s,k,cmd.id!);
  const links:Partial<Record<Kind,[Kind,string][]>>={companies:[['opportunities','companyId'],['interactions','companyId']],opportunities:[['quotes','opportunityId'],['interactions','opportunityId'],['followups','opportunityId']],quotes:[['orders','quoteId']],orders:[['projects','orderId'],['invoices','orderId']],projects:[['delivery','projectId']],delivery:[['hours','taskId']]};
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
 s.opportunities.push({id:'demo-opportunity',demo,companyId:'demo-company',title:'Servicio a medida · segunda fase',amount:4800,stage:'Propuesta',closeDate:dateOffset(5),nextStep:'Revisar la propuesta con el responsable',nextDate:dateOffset(-2),createdAt:dateOffset(-40)},{id:'demo-won',demo,companyId:'demo-company',title:'Servicio a medida · primera fase',amount:2400,stage:'Ganada',closeDate:dateOffset(-12),nextStep:'Revisar la entrega inicial',nextDate:dateOffset(4),createdAt:dateOffset(-50)});
 s.interactions.push(...[-18,-10,-4].map((n,i)=>({id:'demo-contact-'+i,demo,companyId:'demo-company',opportunityId:'demo-opportunity',kind:['Llamada','Reunión','Email'][i] as Entity['interactions']['kind'],date:dateOffset(n),notes:['Primera conversación sobre las necesidades de la empresa.','Revisamos el alcance de la segunda fase y las fechas.','Propuesta enviada. Pendiente de revisar condiciones.'][i]})));
 s.followups.push({id:'demo-followup',demo,opportunityId:'demo-opportunity',title:'Llamar para revisar la propuesta',dueDate:dateOffset(-2),done:false});
 s.quotes.push({id:'demo-quote',demo,opportunityId:'demo-won',title:'P-001 · Servicio a medida',lines:[{description:'Servicio a medida · primera fase',quantity:1,price:2400,policy:'fixed',tasks:'Preparación\nEjecución\nEntrega y revisión'}]});
 const withOrder=apply(s,{action:'confirm',id:'demo-quote'});const task=withOrder.delivery[0];withOrder.hours.push({id:'demo-hours',demo,taskId:task.id,date:dateOffset(-1),hours:4,cost:35,notes:'Preparación de la primera entrega'});
 return apply(withOrder,{action:'invoice',id:withOrder.orders[0].id,policy:'fixed',title:'F-001 · Servicio a medida',date:today(),dueDate:dateOffset(30)});
}

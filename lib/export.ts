import { pipelineNextAction, pipelineOpportunities, type PipelineFilterOptions } from './pipeline.ts';
import { projectTasks } from './project-tasks.ts';
import { reportCsv } from './reports.ts';
import {risk,total,projectCost,companyForOrder,today,ensureState,type State} from './crm.ts';
import { stageName } from './pipeline-stages.ts';

export function csvExport(s:State,view:string,query='',filter='all',companyFilter='all',projectId='',extra: PipelineFilterOptions = {}){
 s=ensureState(s);
 const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const match=(...v:unknown[])=>normalize(v.join(' ')).includes(normalize(query));
 const company=(id?:string)=>s.companies.find(c=>c.id===id);
 const scoped=(id?:string)=>companyFilter==='all'||companyFilter===id;
 let rows:unknown[][]=[];
 if(view==='Informes')return reportCsv(s);
 if(view==='Foco'||view==='Pipeline'){
  const opps=pipelineOpportunities(s,{query,company:companyFilter,focus:view==='Foco',filter,...extra});
  rows=[['Empresa','Oportunidad','Importe EUR','MRR EUR','Etapa','Etiquetas','Responsable','Último contacto','Siguiente paso','Riesgo','Motivo','Fecha de siguiente acción'],...opps.map(o=>{
   const r=risk(s,o);
   const next=pipelineNextAction(s,o);
   const tags=(o.tagIds||[]).map(id=>s.opportunityTags.find(t=>t.id===id)?.name).filter(Boolean).join(', ');
   return [company(o.companyId)?.name,o.title,o.amount,o.mrr??'',stageName(s,o.stageId),tags,o.ownerUserId||'',r.contacted?r.last:'Sin contacto',next?.title||'',r.label,r.reason,next?.date||''];
  })];
 }else if(view==='Leads')rows=[['Lead','Contacto','Email','Teléfono','Fuente','Estado','Próxima acción','Notas'],...s.leads.filter(l=>match(l.name,l.contact,l.email,l.source,l.status,l.notes)&&(filter==='all'||(filter==='due'?!!l.nextDate&&l.nextDate<today()&&!['Convertido','Descartado'].includes(l.status):l.status===filter))).map(l=>[l.name,l.contact,l.email,l.phone,l.source,l.status,l.nextDate,l.notes])];
 else if(view==='Empresas')rows=[['Empresa','Contacto','Email','Teléfono','Días sin contacto','Personas'],...s.companies.filter(c=>match(c.name,c.contact,c.email,c.phone)).map(c=>[c.name,c.contact,c.email,c.phone,c.contactDays,s.people.filter(p=>p.companyId===c.id).map(p=>p.name).join(', ')])];
 else if(view==='Catálogo')rows=[['Servicio','Política','Precio EUR','Tareas'],...s.services.filter(svc=>match(svc.name,svc.policy,svc.tasks)).map(svc=>[svc.name,svc.policy,svc.price,svc.tasks.replaceAll('\n',' | ')])];
 else if(view==='Ventas'){
 const quotes=s.quotes.filter(q=>{const o=s.opportunities.find(o=>o.id===q.opportunityId);return scoped(o?.companyId)&&match(q.title,company(o?.companyId)?.name)});
 const orders=s.orders.filter(o=>scoped(companyForOrder(s,o.id))&&match(o.title,company(companyForOrder(s,o.id))?.name));
 rows=[['Tipo','Documento','Empresa','Importe EUR','Estado'],...(filter==='orders'?[]:quotes.map(q=>['Presupuesto',q.title,company(s.opportunities.find(o=>o.id===q.opportunityId)?.companyId)?.name,total(q.lines),s.orders.some(o=>o.quoteId===q.id&&o.confirmed)?'Confirmado':'Pendiente'])),...(filter==='quotes'?[]:orders.map(o=>['Pedido',o.title,company(companyForOrder(s,o.id))?.name,total(o.lines),o.confirmed?'Confirmado':'Borrador']))];
 }else if(view==='Proyectos'&&projectId){
 const project=s.projects.find(p=>p.id===projectId);if(!project)throw new Error('El proyecto no existe');
 rows=[['Proyecto','Tarea','Estado','Responsable','Inicio','Fecha objetivo'],...projectTasks(s,projectId,query,filter).map(t=>[project.title,t.title,t.status,t.assignee,t.startDate,t.dueDate])];
 }else if(view==='Proyectos')rows=[['Proyecto','Empresa','Pedido EUR','Coste horas EUR','Margen EUR'],...s.projects.filter(p=>scoped(companyForOrder(s,p.orderId))&&match(p.title,p.body,company(companyForOrder(s,p.orderId))?.name)).map(p=>{const o=s.orders.find(o=>o.id===p.orderId);const cost=projectCost(s,p.id);return[p.title,o?company(companyForOrder(s,o.id))?.name:'',o?total(o.lines):'',cost,o?total(o.lines)-cost:'']})];
 else if(view==='Facturas')rows=[['Factura','Empresa','Fecha','Vencimiento','Importe EUR','Estado'],...s.invoices.filter(i=>scoped(companyForOrder(s,i.orderId))&&match(i.title,company(companyForOrder(s,i.orderId))?.name)&&(filter==='all'||(filter==='paid'?i.paid:!i.paid))).map(i=>[i.title,company(companyForOrder(s,i.orderId))?.name,i.date,i.dueDate,i.amount,i.paid?'Cobrada':'Pendiente'])];
 else throw new Error('Pantalla no válida');
 return '\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"').join(';')).join('\r\n');
}

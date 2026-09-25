import { projectTasks } from './project-tasks.ts';
import {risk,total,projectCost,companyForOrder,today,ensureState,type State} from './crm.ts';
export function csvExport(s:State,view:string,query='',filter='all',companyFilter='all',projectId=''){
 s=ensureState(s);
 const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const match=(...v:unknown[])=>normalize(v.join(' ')).includes(normalize(query));
 const company=(id?:string)=>s.companies.find(c=>c.id===id);
 const scoped=(id?:string)=>companyFilter==='all'||companyFilter===id;
 let rows:unknown[][]=[];
 if(view==='Foco'||view==='Pipeline'){
  let opps=s.opportunities.filter(o=>scoped(o.companyId)&&match(o.title,company(o.companyId)?.name,o.nextStep,o.stage));
  if(view==='Foco')opps=opps.filter(o=>filter==='all'?risk(s,o).level>0:filter==='healthy'?risk(s,o).level===0:String(risk(s,o).level)===filter).sort((a,b)=>risk(s,b).level-risk(s,a).level||(a.nextDate||a.closeDate).localeCompare(b.nextDate||b.closeDate));
  rows=[['Empresa','Oportunidad','Importe EUR','Etapa','Último contacto','Siguiente paso','Riesgo','Motivo'],...opps.map(o=>{const r=risk(s,o);const task=s.followups.filter(t=>t.opportunityId===o.id&&!t.done).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];return [company(o.companyId)?.name,o.title,o.amount,o.stage,r.contacted?r.last:'Sin contacto',task?.title||o.nextStep,r.label,r.reason]})];
 }else if(view==='Leads')rows=[['Lead','Contacto','Email','Teléfono','Fuente','Estado','Próxima acción','Notas'],...s.leads.filter(l=>match(l.name,l.contact,l.email,l.source,l.status,l.notes)&&(filter==='all'||(filter==='due'?!!l.nextDate&&l.nextDate<today()&&!['Convertido','Descartado'].includes(l.status):l.status===filter))).map(l=>[l.name,l.contact,l.email,l.phone,l.source,l.status,l.nextDate,l.notes])];
 else if(view==='Empresas')rows=[['Empresa','Contacto','Email','Teléfono','Días sin contacto'],...s.companies.filter(c=>match(c.name,c.contact,c.email,c.phone)).map(c=>[c.name,c.contact,c.email,c.phone,c.contactDays])];
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

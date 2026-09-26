import { getChatGPTUser } from '../../chatgpt-auth';
import { database, getMembership as membership, listMembers, revokeMember } from '@/db/store';
import { apply, seed, ensureState } from '@/lib/crm';
import { canDeleteDemo, canManagePipeline, canManageTeam, runBotAction, type TeamRole } from '@/lib/bot-actions';
import { z } from 'zod';
export const dynamic='force-dynamic';
const error=(message:string,status=400)=>Response.json({error:message},{status});
async function identity(){const u=await getChatGPTUser();if(!u)throw new Error('AUTH');return u}
async function payload(m:NonNullable<Awaited<ReturnType<typeof membership>>>,u:{userId:string;displayName:string}){
 const team=await listMembers(m.tenant_id);
 return {
  state:ensureState(JSON.parse(m.data)),
  revision:m.revision,
  tenant:m.name,
  role:m.role,
  user:u.displayName,
  team:team.map(member=>({
   userId:member.userId,
   role:member.role,
   name:member.userId===u.userId?u.displayName:`Compañero ${member.userId.slice(0,6)}`,
   self:member.userId===u.userId,
  })),
 };
}
export async function GET(){try{const u=await identity();const m=await membership(u.userId);return Response.json(m?await payload(m,u):{onboarding:true,user:u.displayName},{headers:{'Cache-Control':'no-store'}})}catch(e){console.error(e);return error(e instanceof Error&&e.message==='AUTH'?'Inicia sesión para continuar':'No se pudieron cargar los datos. Vuelve a intentarlo',e instanceof Error&&e.message==='AUTH'?401:503)}}
export async function POST(request:Request){try{
 const u=await identity();const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return error('Origen no permitido',403);
 const body=await request.text();if(body.length>500000)return error('El contenido es demasiado grande',413);const b=JSON.parse(body);const db=database();const m=await membership(u.userId);
 if(b.action==='onboard'){
  if(m)return error('Ya perteneces a una empresa',409);
  const name=z.string().trim().min(1).max(120).parse(b.name);const id=crypto.randomUUID();await db.batch([db.prepare('INSERT INTO tenants (id,name,data,revision) VALUES (?,?,?,0)').bind(id,name,JSON.stringify(seed())),db.prepare('INSERT INTO members (user_id,tenant_id,role) VALUES (?,?,?)').bind(u.userId,id,'owner')]);return GET();
 }
 if(b.action==='join'){
  if(m)return error('Ya perteneces a una empresa',409);const token=z.string().uuid().parse(b.token);const inv=await db.prepare('SELECT tenant_id FROM invitations WHERE token=? AND expires>?').bind(token,Date.now()).first<{tenant_id:string}>();if(!inv)return error('La invitación no existe o ha caducado');
  await db.batch([db.prepare("INSERT INTO members (user_id,tenant_id,role) SELECT ?,tenant_id,'member' FROM invitations WHERE token=? AND expires>?").bind(u.userId,token,Date.now()),db.prepare('DELETE FROM invitations WHERE token=?').bind(token)]);if(!await membership(u.userId))return error('La invitación ya se ha utilizado',409);return GET();
 }
 if(!m)return error('Crea una empresa o acepta una invitación',403);
 if(b.action==='invite'){if(!canManageTeam(m.role))return error('Solo el propietario puede invitar',403);const token=crypto.randomUUID();await db.prepare('INSERT INTO invitations (token,tenant_id,expires) VALUES (?,?,?)').bind(token,m.tenant_id,Date.now()+86400000).run();return Response.json({token})}
 if(b.action==='revoke'){if(!canManageTeam(m.role))return error('Solo el propietario puede revocar',403);await revokeMember(m.tenant_id,z.string().min(1).parse(b.userId),u.userId);return Response.json(await payload(await membership(u.userId) as NonNullable<Awaited<ReturnType<typeof membership>>>,u),{headers:{'Cache-Control':'no-store'}})}
 if(b.action==='botAction'){
  if(b.revision!==m.revision)return error('Un compañero ha actualizado los datos. Recarga y vuelve a guardar; tu formulario se conserva.',409);
  const executed=runBotAction(ensureState(JSON.parse(m.data)),m.role as TeamRole,u.displayName,m.revision,{
   requestId:z.string().uuid().parse(b.requestId),
   kind:z.enum(['stage','followup','pay']).parse(b.kind),
   opportunityId:b.opportunityId,
   stage:b.stage,
   stageId:b.stageId,
   expectedStage:b.expectedStage,
   expectedStageId:b.expectedStageId,
   lostReasonId:b.lostReasonId,
   title:b.title,
   dueDate:b.dueDate,
   invoiceId:b.invoiceId,
   date:b.date,
  });
  if(!executed.replayed){
   const result=await db.prepare('UPDATE tenants SET data=?, revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(executed.state),m.tenant_id,m.revision).run();
   if(result.meta.changes!==1)return error('Los datos han cambiado. Recarga y vuelve a intentarlo.',409);
  }
  const fresh=await membership(u.userId);
  return Response.json({...(await payload(fresh!,u)),botResult:executed.result,replayed:executed.replayed},{headers:{'Cache-Control':'no-store'}});
 }
 if(b.revision!==m.revision)return error('Un compañero ha actualizado los datos. Recarga y vuelve a guardar; tu formulario se conserva.',409);
 if(b.action==='deleteDemo'&&!canDeleteDemo(m.role))return error('Solo el propietario puede borrar la demostración',403);
 if(['savePipelineStages','saveOpportunityTags','saveLostReasons'].includes(b.action)&&!canManagePipeline(m.role))return error('Solo el propietario puede configurar el pipeline',403);
 const next=apply(ensureState(JSON.parse(m.data)),{...b,user:u.displayName});const result=await db.prepare('UPDATE tenants SET data=?, revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(next),m.tenant_id,m.revision).run();if(result.meta.changes!==1)return error('Los datos han cambiado. Recarga y vuelve a intentarlo.',409);
 const fresh=await membership(u.userId);
 return Response.json(await payload(fresh!,u),{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof z.ZodError)return error(e.issues.map(i=>{const field=({name:'Nombre',title:'Nombre o referencia',email:'Email',companyId:'Empresa',opportunityId:'Oportunidad',taskId:'Tarea',date:'Fecha',dueDate:'Vencimiento',amount:'Importe',hours:'Horas',cost:'Coste por hora',contactDays:'Días sin contacto',lines:'Líneas de servicio',closeDate:'Fecha de cierre',nextDate:'Fecha del siguiente paso',description:'Servicio',quantity:'Cantidad',price:'Precio',tasks:'Tareas de entrega',role:'Rol',policy:'Política'} as Record<string,string>)[String(i.path.at(-1))]||'Campo obligatorio';return `${field}: ${/^(Expected|Required|Invalid|Number must|String must|Array must)/.test(i.message)?'revisa el valor introducido':i.message}`}).join(' · '));if(e instanceof Error&&e.message==='AUTH')return error('Inicia sesión para continuar',401);console.error(e);return error(e instanceof Error&&!/SQL|D1|database|UNIQUE|JSON/.test(e.message)?e.message:'No se pudo guardar. Conservamos el formulario; vuelve a intentarlo')}
}

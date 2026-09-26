import { env } from 'cloudflare:workers';
export function database(){if(!env.DB)throw new Error('La base de datos no está disponible');return env.DB}
export async function getMembership(userId:string){return database().prepare('SELECT m.tenant_id, m.role, t.name, t.data, t.revision FROM members m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=?').bind(userId).first<{tenant_id:string;role:string;name:string;data:string;revision:number}>()}
export async function listMembers(tenantId:string){
 return database().prepare('SELECT user_id as userId, role FROM members WHERE tenant_id=? ORDER BY role DESC, user_id').bind(tenantId).all<{userId:string;role:string}>().then(r=>r.results||[]);
}
export async function revokeMember(tenantId:string,userId:string,actorUserId:string){
 if(userId===actorUserId)throw new Error('No puedes revocar tu propio acceso');
 const target=await database().prepare('SELECT role FROM members WHERE tenant_id=? AND user_id=?').bind(tenantId,userId).first<{role:string}>();
 if(!target)throw new Error('Ese miembro no está en el equipo');
 if(target.role==='owner')throw new Error('No se puede revocar al propietario');
 const result=await database().prepare('DELETE FROM members WHERE tenant_id=? AND user_id=? AND role!=?').bind(tenantId,userId,'owner').run();
 if(result.meta.changes!==1)throw new Error('No se pudo revocar al miembro');
}

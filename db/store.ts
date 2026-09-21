import { env } from 'cloudflare:workers';
export function database(){if(!env.DB)throw new Error('La base de datos no está disponible');return env.DB}
export async function getMembership(userId:string){return database().prepare('SELECT m.tenant_id, m.role, t.name, t.data, t.revision FROM members m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=?').bind(userId).first<{tenant_id:string;role:string;name:string;data:string;revision:number}>()}

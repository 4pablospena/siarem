import { getChatGPTUser } from '../../chatgpt-auth';
import { getMembership } from '@/db/store';
import { csvExport } from '@/lib/export';
import { today } from '@/lib/crm';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const user=await getChatGPTUser();if(!user)return Response.json({error:'Inicia sesión para exportar'},{status:401});const m=await getMembership(user.userId);if(!m)return Response.json({error:'No tienes acceso a un equipo'},{status:403});const q=new URL(request.url).searchParams;const view=q.get('view')||'Foco';const csv=csvExport(JSON.parse(m.data),view,q.get('q')||'',q.get('filter')||'all',q.get('company')||'all');return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="siarem-${view.toLowerCase()}-${today()}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}catch(e){console.error(e);return Response.json({error:'No se pudo exportar. Vuelve a intentarlo.'},{status:503})}}

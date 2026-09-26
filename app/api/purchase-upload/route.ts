import { getChatGPTUser } from '../../chatgpt-auth';
import { getMembership as membership } from '@/db/store';
import { putBlob } from '@/lib/blob-store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: 'Inicia sesión para continuar' }, { status: 401 });
    const member = await membership(user.userId);
    if (!member) return Response.json({ error: 'Crea una empresa o acepta una invitación' }, { status: 403 });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Origen no permitido' }, { status: 403 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ error: 'Adjunta un archivo' }, { status: 400 });
    if (file.size > 8_000_000) return Response.json({ error: 'El archivo supera 8 MB' }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const key = `tenants/${member.tenant_id}/purchases/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
    await putBlob(key, bytes, file.type || 'application/octet-stream');
    return Response.json({ key, name: file.name, contentType: file.type || 'application/octet-stream', size: file.size }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'No se pudo subir el archivo' }, { status: 500 });
  }
}

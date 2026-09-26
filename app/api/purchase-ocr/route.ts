import { getChatGPTUser } from '../../chatgpt-auth';
import { getMembership as membership } from '@/db/store';
import { ensureState } from '@/lib/crm';
import { getBlob, parseInvoiceText } from '@/lib/blob-store';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: 'Inicia sesión para continuar' }, { status: 401 });
    const member = await membership(user.userId);
    if (!member) return Response.json({ error: 'Crea una empresa o acepta una invitación' }, { status: 403 });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Origen no permitido' }, { status: 403 });
    const body = z.object({ key: z.string().min(1), text: z.string().optional() }).parse(await request.json());
    let raw = body.text || '';
    if (!raw) {
      const blob = await getBlob(body.key);
      if (!blob) return Response.json({ error: 'No encuentro el archivo' }, { status: 404 });
      const endpoint = process.env.OCR_ENDPOINT;
      const apiKey = process.env.OCR_API_KEY;
      if (endpoint && apiKey) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: body.key }),
        });
        if (!res.ok) return Response.json({ error: 'El OCR no respondió' }, { status: 502 });
        const data = await res.json() as { text?: string };
        raw = data.text || '';
      } else {
        raw = new TextDecoder().decode(blob.bytes);
      }
    }
    const draft = parseInvoiceText(raw);
    const state = ensureState(JSON.parse(member.data));
    const supplier = draft.taxId
      ? state.companies.find(c => (c.taxId || '').toUpperCase() === draft.taxId.toUpperCase())
      : undefined;
    return Response.json({
      draft: {
        ...draft,
        supplierCompanyId: supplier?.id || '',
        supplierName: supplier?.name || '',
        attachmentKey: body.key,
        status: 'draft',
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: 'Indica el archivo' }, { status: 400 });
    console.error(error);
    return Response.json({ error: 'No se pudo leer la factura' }, { status: 500 });
  }
}

import { getChatGPTUser } from '../../chatgpt-auth';
import { getMembership as membership } from '@/db/store';
import { ensureState } from '@/lib/crm';
import { getBlob } from '@/lib/blob-store';
import { offlineExtract } from '@/lib/documents/run-extract';
import { extractWithModel, hasExtractModel } from '@/lib/documents/extract-model';
import { normalizeExtraction } from '@/lib/documents/normalize';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** Compat: sync OCR for callers that still POST { key }. Prefer /api/documents/*. */
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
      raw = new TextDecoder().decode(blob.bytes);
    }
    const payload = { mode: 'text' as const, extractedText: raw };
    const normalized = hasExtractModel()
      ? normalizeExtraction(await extractWithModel('invoice', payload))
      : offlineExtract(payload);
    const state = ensureState(JSON.parse(member.data));
    const supplier = normalized.taxId
      ? state.companies.find(c => (c.taxId || '').toUpperCase() === normalized.taxId.toUpperCase())
      : undefined;
    return Response.json({
      draft: {
        ...normalized,
        supplierCompanyId: supplier?.id || '',
        supplierName: supplier?.name || normalized.supplierName || '',
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

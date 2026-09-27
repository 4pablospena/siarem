import { z } from 'zod';
import { requireMember } from '../auth';
import { parseDocument } from '@/lib/documents/parse';
import { MAX_FILE_BYTES } from '@/lib/documents/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = await requireMember(request);
    if ('error' in auth) return auth.error;
    const body = z.object({
      data: z.string().min(1),
      contentType: z.string().optional(),
    }).parse(await request.json());
    // Rough size guard on base64 (~4/3 of bytes).
    if (body.data.length > MAX_FILE_BYTES * 1.4) {
      return Response.json({ error: 'El archivo supera 10 MB' }, { status: 400 });
    }
    const parsed = await parseDocument(body.data, body.contentType || 'application/pdf');
    return Response.json(parsed, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: 'Indica el archivo en base64' }, { status: 400 });
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : 'No se pudo parsear' }, { status: 500 });
  }
}

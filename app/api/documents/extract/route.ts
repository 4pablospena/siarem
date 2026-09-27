import { z } from 'zod';
import { requireMember } from '../auth';
import { createExtractJob } from '@/lib/documents/jobs';
import { runExtractJob } from '@/lib/documents/run-extract';
import { MAX_VISION_PAGES } from '@/lib/documents/types';
import type { ExtractPayload } from '@/lib/documents/types';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  schemaId: z.enum(['invoice']).default('invoice'),
  attachmentKey: z.string().optional(),
  extractedText: z.string().optional(),
  pageImageDataUrls: z.array(z.string()).max(MAX_VISION_PAGES).optional(),
  fileBase64: z.string().optional(),
});

function scheduleJob(jobId: string) {
  // Vinext/Workers may kill fire-and-forget work when the response is sent.
  // Prefer waitUntil; otherwise the caller awaits runExtractJob.
  try {
    const g = globalThis as { Cloudflare?: { waitUntil?: (p: Promise<unknown>) => void } };
    if (typeof g.Cloudflare?.waitUntil === 'function') {
      g.Cloudflare.waitUntil(runExtractJob(jobId));
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export async function POST(request: Request) {
  try {
    const auth = await requireMember(request);
    if ('error' in auth) return auth.error;
    const body = bodySchema.parse(await request.json());

    let payload: ExtractPayload;
    if (body.pageImageDataUrls?.length) {
      payload = { mode: 'vision', pageImageDataUrls: body.pageImageDataUrls.slice(0, MAX_VISION_PAGES) };
    } else if (body.extractedText != null && body.extractedText !== '') {
      payload = { mode: 'text', extractedText: body.extractedText };
    } else if (body.fileBase64) {
      payload = { mode: 'document', fileBase64: body.fileBase64 };
    } else {
      return Response.json({ error: 'Indica texto, imágenes o PDF' }, { status: 400 });
    }

    const jobId = await createExtractJob({
      ownerUserId: auth.user.userId,
      tenantId: auth.member.tenant_id,
      schemaId: body.schemaId,
      payload: { ...payload, attachmentKey: body.attachmentKey || '' },
    });

    if (!scheduleJob(jobId)) {
      // Keep the isolate alive until extraction finishes (202 + poll still holds).
      await runExtractJob(jobId);
    }

    return Response.json({ jobId }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: 'Petición inválida' }, { status: 400 });
    console.error(error);
    return Response.json({ error: 'No se pudo iniciar la extracción' }, { status: 500 });
  }
}

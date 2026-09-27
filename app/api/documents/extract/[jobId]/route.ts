import { requireMember } from '../../auth';
import { getJob } from '@/lib/documents/jobs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const auth = await requireMember(request);
    if ('error' in auth) return auth.error;
    const { jobId } = await context.params;
    if (!jobId) return Response.json({ error: 'Indica el trabajo' }, { status: 400 });
    const job = await getJob(jobId, auth.user.userId);
    if (!job) return Response.json({ error: 'Trabajo no encontrado o caducado' }, { status: 404 });
    if (job.status === 'succeeded') {
      let data: unknown = null;
      try {
        data = job.resultJson ? JSON.parse(job.resultJson) : null;
      } catch {
        data = null;
      }
      return Response.json({ status: job.status, data }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (job.status === 'failed') {
      return Response.json({ status: job.status, error: job.errorCode || 'extract_failed' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ status: job.status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'No se pudo consultar el trabajo' }, { status: 500 });
  }
}

import { getChatGPTUser } from '../../chatgpt-auth';
import { database, getMembership as membership } from '@/db/store';
import { apply, ensureState, today } from '@/lib/crm';
import { isIssued } from '@/lib/invoices';
import { buildInvoicePdf } from '@/lib/invoice-pdf';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
const error = (message: string, status = 400) => Response.json({ error: message }, { status });

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return error('Inicia sesión para continuar', 401);
    const member = await membership(user.userId);
    if (!member) return error('Crea una empresa o acepta una invitación', 403);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return error('Origen no permitido', 403);
    const body = z.object({ id: z.string().min(1), revision: z.number().int() }).parse(await request.json());
    if (body.revision !== member.revision) return error('Un compañero ha actualizado los datos. Recarga y vuelve a guardar.', 409);
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.INVOICE_FROM;
    if (!apiKey || !from) return error('El envío de facturas no está configurado', 503);
    const state = ensureState(JSON.parse(member.data));
    const invoice = state.invoices.find(item => item.id === body.id);
    if (!invoice || !isIssued(invoice)) return error('Solo se envía una factura emitida');
    const order = state.orders.find(o => o.id === invoice.orderId);
    const quote = state.quotes.find(q => q.id === order?.quoteId);
    const companyId = state.opportunities.find(o => o.id === quote?.opportunityId)?.companyId;
    const company = state.companies.find(c => c.id === companyId);
    if (!company?.email) return error('La empresa no tiene email');
    const bytes = await buildInvoicePdf({ state, invoice, tenantName: member.name, company });
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [company.email],
        subject: `Factura ${invoice.number || invoice.title}`,
        text: `Adjuntamos la factura ${invoice.number || invoice.title}.`,
        attachments: [{ filename: `${(invoice.number || invoice.title).replace(/[^\w.-]+/g, '_')}.pdf`, content: Buffer.from(bytes).toString('base64') }],
      }),
    });
    if (!res.ok) {
      console.error(await res.text());
      return error('No se pudo enviar el email', 502);
    }
    const next = apply(state, { action: 'markInvoiceSent', id: invoice.id, date: today() });
    const db = database();
    const result = await db.prepare('UPDATE tenants SET data=?, revision=revision+1 WHERE id=? AND revision=?')
      .bind(JSON.stringify(next), member.tenant_id, member.revision).run();
    if (result.meta.changes !== 1) return error('Los datos han cambiado. Recarga y vuelve a intentarlo.', 409);
    const fresh = await membership(user.userId);
    return Response.json({
      state: ensureState(JSON.parse(fresh!.data)),
      revision: fresh!.revision,
      tenant: fresh!.name,
      role: fresh!.role,
      user: user.displayName,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof z.ZodError) return error('Indica la factura');
    console.error(e);
    return error(e instanceof Error && e.message === 'AUTH' ? 'Inicia sesión para continuar' : 'No se pudo enviar la factura', e instanceof Error && e.message === 'AUTH' ? 401 : 500);
  }
}

import { getChatGPTUser } from '../../chatgpt-auth';
import { getMembership as membership } from '@/db/store';
import { ensureState } from '@/lib/crm';
import { isIssued } from '@/lib/invoices';
import { buildInvoicePdf } from '@/lib/invoice-pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: 'Inicia sesión para continuar' }, { status: 401 });
    const member = await membership(user.userId);
    if (!member) return Response.json({ error: 'Crea una empresa o acepta una invitación' }, { status: 403 });
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'Indica la factura' }, { status: 400 });
    const state = ensureState(JSON.parse(member.data));
    const invoice = state.invoices.find(item => item.id === id);
    if (!invoice || !isIssued(invoice)) return Response.json({ error: 'La factura no está emitida' }, { status: 404 });
    const companyId = (() => {
      const order = state.orders.find(o => o.id === invoice.orderId);
      const quote = state.quotes.find(q => q.id === order?.quoteId);
      return state.opportunities.find(o => o.id === quote?.opportunityId)?.companyId;
    })();
    const company = state.companies.find(c => c.id === companyId);
    const bytes = await buildInvoicePdf({ state, invoice, tenantName: member.name, company });
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${(invoice.number || invoice.title).replace(/[^\w.-]+/g, '_')}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'No se pudo generar el PDF' }, { status: 500 });
  }
}

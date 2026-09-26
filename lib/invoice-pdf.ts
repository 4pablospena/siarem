import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { eur, type Entity, type State } from '@/lib/crm';
import { methodLabel, paymentLabel, paymentLabelText, paymentsOf } from '@/lib/invoices';

type Invoice = Entity['invoices'];

export async function buildInvoicePdf(args: {
  state: State;
  invoice: Invoice;
  tenantName: string;
  company?: Entity['companies'];
}) {
  const { state, invoice, tenantName, company } = args;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.4, 0.45, 0.5);
  let y = 800;
  const write = (text: string, opts: { size?: number; font?: typeof font; color?: typeof black; x?: number } = {}) => {
    page.drawText(text.slice(0, 110), {
      x: opts.x ?? 48,
      y,
      size: opts.size ?? 11,
      font: opts.font ?? font,
      color: opts.color ?? black,
    });
    y -= (opts.size ?? 11) + 8;
  };

  write(tenantName || 'siarem', { font: bold, size: 18 });
  write('Factura ' + (invoice.number || invoice.title), { font: bold, size: 14 });
  write(`Emisión ${invoice.date} · Vencimiento ${invoice.dueDate}`, { color: muted, size: 10 });
  y -= 8;
  write('Cliente', { font: bold, size: 11 });
  write(company?.name || 'Sin empresa');
  if (company?.taxId) write('NIF ' + company.taxId, { size: 10, color: muted });
  if (company?.address) write(company.address, { size: 10, color: muted });
  y -= 10;
  write('Concepto', { font: bold });
  for (const line of invoice.lines || []) {
    write(`${line.description} · ${line.quantity} × ${eur(line.price)} = ${eur(line.amount)}`, { size: 10 });
  }
  y -= 8;
  write(`Base imponible ${eur(invoice.base ?? invoice.amount)}`, { size: 11 });
  write(`IVA ${invoice.vatRate ?? 0}% ${eur(invoice.vatAmount ?? 0)}`, { size: 11 });
  write(`Total ${eur(invoice.amount)}`, { font: bold, size: 13 });
  write(paymentLabelText(paymentLabel(state, invoice)), { size: 10, color: muted });
  const pays = paymentsOf(state, invoice.id);
  if (pays.length) {
    y -= 6;
    write('Cobros', { font: bold });
    for (const payment of pays) {
      write(`${payment.date} · ${eur(payment.amount)} · ${methodLabel(payment.method)}${payment.note ? ' · ' + payment.note : ''}`, { size: 10 });
    }
  }
  return Buffer.from(await pdf.save());
}

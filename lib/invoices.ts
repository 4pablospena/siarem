import type { Entity, State } from './crm.ts';

export const VAT_RATES = [0, 4, 10, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];
export type PaymentMethod = 'transfer' | 'card' | 'cash';
export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'cash', label: 'Efectivo' },
];

export type InvoiceLine = { description: string; quantity: number; price: number; amount: number };
export type InvoicePaymentLabel = 'draft' | 'void' | 'pending' | 'partial' | 'paid';

type Invoice = Entity['invoices'];

const round = (n: number) => Math.round(n * 100) / 100;
const lineTotal = (lines: { quantity: number; price: number }[]) =>
  round(lines.reduce((sum, line) => sum + line.quantity * line.price, 0));

export function isIssued(invoice: Pick<Invoice, 'status'>) {
  return (invoice.status || 'issued') === 'issued';
}

export function isDraft(invoice: Pick<Invoice, 'status'>) {
  return invoice.status === 'draft';
}

export function isVoid(invoice: Pick<Invoice, 'status'>) {
  return invoice.status === 'void';
}

/** Hours are reserved only by issued (non-void) invoices. */
export function billedHourIds(s: Pick<State, 'invoices'>) {
  const ids = new Set<string>();
  for (const invoice of s.invoices) {
    if (!isIssued(invoice)) continue;
    for (const hourId of invoice.hourIds || []) ids.add(hourId);
  }
  return ids;
}

export function paymentsOf(s: Pick<State, 'payments'>, invoiceId: string) {
  return s.payments.filter(payment => payment.invoiceId === invoiceId);
}

export function collected(s: Pick<State, 'payments'>, invoiceId: string) {
  return round(paymentsOf(s, invoiceId).reduce((sum, payment) => sum + payment.amount, 0));
}

export function balance(s: Pick<State, 'payments'>, invoice: Pick<Invoice, 'id' | 'amount' | 'status'>) {
  if (!isIssued(invoice)) return 0;
  return round(Math.max(0, invoice.amount - collected(s, invoice.id)));
}

export function syncPaid(s: Pick<State, 'payments'>, invoice: Invoice) {
  invoice.paid = isIssued(invoice) && balance(s, invoice) <= 0 && invoice.amount > 0;
  return invoice;
}

export function paymentLabel(s: Pick<State, 'payments'>, invoice: Invoice): InvoicePaymentLabel {
  if (isDraft(invoice)) return 'draft';
  if (isVoid(invoice)) return 'void';
  if (invoice.paid || balance(s, invoice) <= 0) return 'paid';
  if (collected(s, invoice.id) > 0) return 'partial';
  return 'pending';
}

export function paymentLabelText(label: InvoicePaymentLabel) {
  return ({
    draft: 'Borrador',
    void: 'Anulada',
    pending: 'Pendiente de cobro',
    partial: 'Cobrada en parte',
    paid: 'Cobrada',
  })[label];
}

export function withVat(base: number, vatRate: number) {
  const safeBase = round(base);
  const rate = VAT_RATES.includes(vatRate as VatRate) ? vatRate : 0;
  const vatAmount = round(safeBase * rate / 100);
  return { base: safeBase, vatRate: rate as VatRate, vatAmount, amount: round(safeBase + vatAmount) };
}

/** Base already invoiced for a policy (issued invoices only; excludes credits and voids). */
export function billedBase(s: Pick<State, 'invoices'>, orderId: string, policy: string) {
  return round(s.invoices
    .filter(invoice => invoice.orderId === orderId
      && invoice.policy === policy
      && isIssued(invoice)
      && (invoice.kind || 'invoice') === 'invoice')
    .reduce((sum, invoice) => sum + (invoice.base ?? invoice.amount), 0));
}

export function remainingBase(s: State, orderId: string, policy: string) {
  const order = s.orders.find(item => item.id === orderId);
  if (!order) return 0;
  const budget = lineTotal(order.lines.filter(line => line.policy === policy));
  return round(Math.max(0, budget - billedBase(s, orderId, policy)));
}

export function buildInvoiceLines(s: State, orderId: string, policy: string, opts: { amount?: number; hourIds?: string[] }): InvoiceLine[] {
  const order = s.orders.find(item => item.id === orderId);
  if (!order) return [];
  if (policy === 'hours') {
    return (opts.hourIds || []).map(hourId => {
      const hour = s.hours.find(item => item.id === hourId)!;
      const task = s.delivery.find(item => item.id === hour.taskId)!;
      const line = order.lines[task.lineIndex];
      const amount = round(hour.hours * line.price);
      return {
        description: `${task.title} · ${hour.date} · ${hour.hours} h`,
        quantity: hour.hours,
        price: line.price,
        amount,
      };
    });
  }
  if (policy === 'milestones') {
    const amount = round(Number(opts.amount) || 0);
    return [{ description: 'Hito de facturación', quantity: 1, price: amount, amount }];
  }
  return order.lines.filter(line => line.policy === policy).map(line => ({
    description: line.description,
    quantity: line.quantity,
    price: line.price,
    amount: round(line.quantity * line.price),
  }));
}

export function linesTotal(lines: InvoiceLine[]) {
  return round(lines.reduce((sum, line) => sum + line.amount, 0));
}

export function allocateNumber(s: State, issueDate: string) {
  const year = Number(issueDate.slice(0, 4));
  if (!Array.isArray(s.invoiceSeries)) s.invoiceSeries = [];
  let row = s.invoiceSeries.find(item => item.year === year);
  if (!row) {
    row = { year, last: 0 };
    s.invoiceSeries.push(row);
  }
  row.last += 1;
  return `F-${year}-${String(row.last).padStart(3, '0')}`;
}

export function dueFromIssue(issueDate: string, paymentDays?: number | null) {
  const days = Number.isFinite(paymentDays) && (paymentDays as number) > 0
    ? Math.min(365, Math.max(1, Math.floor(paymentDays as number)))
    : 30;
  const next = new Date(Date.parse(`${issueDate}T12:00:00Z`));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function agingBuckets(s: State, now: string) {
  const open = s.invoices.filter(invoice => isIssued(invoice) && !invoice.paid);
  const bucket = () => ({ count: 0, amount: 0 });
  const groups = {
    current: bucket(),
    d1_30: bucket(),
    d31_60: bucket(),
    d61_90: bucket(),
    d90plus: bucket(),
  };
  let pending = 0;
  for (const invoice of open) {
    const due = balance(s, invoice);
    if (due <= 0) continue;
    pending = round(pending + due);
    const age = Math.floor((Date.parse(`${now}T12:00:00Z`) - Date.parse(`${invoice.dueDate}T12:00:00Z`)) / 86400000);
    const target = age < 1 ? groups.current
      : age <= 30 ? groups.d1_30
        : age <= 60 ? groups.d31_60
          : age <= 90 ? groups.d61_90
            : groups.d90plus;
    target.count += 1;
    target.amount = round(target.amount + due);
  }
  return { pending, ...groups };
}

export function projectInvoicedRevenue(s: State, orderId: string) {
  if (!orderId) return 0;
  return round(s.invoices
    .filter(invoice => invoice.orderId === orderId && isIssued(invoice) && (invoice.kind || 'invoice') === 'invoice')
    .reduce((sum, invoice) => sum + invoice.amount, 0));
}

export function methodLabel(method?: string) {
  return PAYMENT_METHODS.find(item => item.value === method)?.label || 'Transferencia';
}

export function pendingHours(s: State, orderId: string) {
  const billed = billedHourIds(s);
  return s.hours.filter(hour => {
    if (billed.has(hour.id)) return false;
    const task = s.delivery.find(item => item.id === hour.taskId);
    const project = s.projects.find(item => item.id === task?.projectId);
    if (project?.orderId !== orderId || !task) return false;
    const order = s.orders.find(item => item.id === orderId);
    return order?.lines[task.lineIndex]?.policy === 'hours';
  });
}

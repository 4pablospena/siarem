'use client';

import { Download, Mail, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { eur, type Entity, type State } from '@/lib/crm';
import {
  balance, collected, isDraft, isIssued, methodLabel, paymentLabel, paymentLabelText, paymentsOf,
} from '@/lib/invoices';

type Invoice = Entity['invoices'];

export function InvoicePanel({
  open, invoice, state, companyName, orderTitle, companyEmail, busy, onClose, onPay, onEdit, onIssue, onCredit, onVoidPayment, onSent,
}: {
  open: boolean;
  invoice: Invoice | null;
  state: State;
  companyName: string;
  orderTitle: string;
  companyEmail?: string;
  busy: boolean;
  onClose: () => void;
  onPay: () => void;
  onEdit: () => void;
  onIssue: () => void;
  onCredit: () => void;
  onVoidPayment: (paymentId: string) => void;
  onSent: () => void;
}) {
  if (!invoice) return null;
  const label = paymentLabel(state, invoice);
  const due = balance(state, invoice);
  const pays = paymentsOf(state, invoice.id);
  const hours = (invoice.hourIds || []).map(id => state.hours.find(h => h.id === id)).filter(Boolean);
  return <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
    <SheetContent className="invoice-panel" showCloseButton={false}>
      <SheetClose className="close-panel" aria-label="Cerrar"><X size={17}/></SheetClose>
      <SheetHeader>
        <SheetTitle>{invoice.number || invoice.title}</SheetTitle>
        <SheetDescription>{companyName} · {orderTitle}</SheetDescription>
      </SheetHeader>
      <div className="invoice-status"><span className={'badge tone-' + (label === 'paid' ? 'done' : label === 'void' || label === 'draft' ? 'open' : 'late')}>{paymentLabelText(label)}</span>
        {due > 0 && <strong>Saldo {eur(due)}</strong>}
      </div>
      <dl className="invoice-meta">
        <div><dt>Emisión</dt><dd>{invoice.date}</dd></div>
        <div><dt>Vencimiento</dt><dd>{invoice.dueDate}</dd></div>
        <div><dt>Base</dt><dd>{eur(invoice.base ?? invoice.amount)}</dd></div>
        <div><dt>IVA {invoice.vatRate ?? 0}%</dt><dd>{eur(invoice.vatAmount ?? 0)}</dd></div>
        <div><dt>Total</dt><dd>{eur(invoice.amount)}</dd></div>
        <div><dt>Cobrado</dt><dd>{eur(collected(state, invoice.id))}</dd></div>
      </dl>
      {(invoice.lines || []).length > 0 && <section><h3>Líneas</h3><ul className="invoice-lines">{(invoice.lines || []).map((line, index) =>
        <li key={index}><span>{line.description}</span><strong>{eur(line.amount)}</strong></li>)}</ul></section>}
      {hours.length > 0 && <section><h3>Horas</h3><ul className="invoice-lines">{hours.map(hour => hour &&
        <li key={hour.id}><span>{hour.date} · {hour.hours} h</span><small>{hour.notes}</small></li>)}</ul></section>}
      <section><h3>Cobros</h3>
        {!pays.length && <p className="muted">Todavía no hay cobros.</p>}
        <ul className="invoice-lines">{pays.map(payment => <li key={payment.id}>
          <span>{payment.date} · {methodLabel(payment.method)}{payment.note ? ` · ${payment.note}` : ''}</span>
          <strong>{eur(payment.amount)}</strong>
          <button type="button" className="subtle" disabled={busy} onClick={() => onVoidPayment(payment.id)}>Anular</button>
        </li>)}</ul>
      </section>
      <div className="invoice-actions">
        {isDraft(invoice) && <button type="button" className="primary" disabled={busy} onClick={onIssue}>Emitir</button>}
        {isIssued(invoice) && due > 0 && <button type="button" className="primary" disabled={busy} onClick={onPay}>Registrar cobro</button>}
        <button type="button" className="outline" disabled={busy} onClick={onEdit}>Editar fechas</button>
        {isIssued(invoice) && <a className="outline" href={'/api/invoice-pdf?id=' + encodeURIComponent(invoice.id)}><Download size={14}/> PDF</a>}
        {isIssued(invoice) && <button type="button" className="outline" disabled={busy || !companyEmail} title={!companyEmail ? 'La empresa no tiene email' : undefined} onClick={onSent}><Mail size={14}/> Enviar</button>}
        {isIssued(invoice) && invoice.kind !== 'credit' && !pays.length && <button type="button" className="danger" disabled={busy} onClick={onCredit}>Rectificar</button>}
      </div>
      {!companyEmail && isIssued(invoice) && <p className="muted">Añade un email a la empresa para poder enviar la factura.</p>}
      {invoice.sentAt && <p className="muted">Enviada el {invoice.sentAt.slice(0, 10)}</p>}
    </SheetContent>
  </Sheet>;
}

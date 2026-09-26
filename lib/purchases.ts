import type { Entity, State } from './crm.ts';
import { VAT_RATES, withVat, type PaymentMethod, type VatRate } from './invoices.ts';

export type PurchaseLine = { description: string; quantity: number; price: number; amount: number; itemId?: string };
export type PurchaseLabel = 'draft' | 'void' | 'pending' | 'partial' | 'paid';

type Purchase = Entity['purchases'];

const round = (n: number) => Math.round(n * 100) / 100;

export function isPurchaseRecorded(p: Pick<Purchase, 'status'>) {
  return (p.status || 'recorded') === 'recorded' || p.status === 'paid';
}

export function isPurchaseDraft(p: Pick<Purchase, 'status'>) {
  return p.status === 'draft';
}

export function isPurchaseVoid(p: Pick<Purchase, 'status'>) {
  return p.status === 'void';
}

export function purchasePaymentsOf(s: Pick<State, 'purchasePayments'>, purchaseId: string) {
  return (s.purchasePayments || []).filter(p => p.purchaseId === purchaseId);
}

export function purchasePaidAmount(s: Pick<State, 'purchasePayments'>, purchaseId: string) {
  return round(purchasePaymentsOf(s, purchaseId).reduce((sum, p) => sum + p.amount, 0));
}

export function purchaseBalance(s: Pick<State, 'purchasePayments'>, purchase: Pick<Purchase, 'id' | 'amount' | 'status'>) {
  if (!isPurchaseRecorded(purchase) || purchase.status === 'void') return 0;
  return round(Math.max(0, purchase.amount - purchasePaidAmount(s, purchase.id)));
}

export function syncPurchasePaid(s: Pick<State, 'purchasePayments'>, purchase: Purchase) {
  const due = purchaseBalance(s, purchase);
  purchase.paid = isPurchaseRecorded(purchase) && due <= 0 && purchase.amount > 0;
  if (purchase.paid && purchase.status === 'recorded') purchase.status = 'paid';
  if (!purchase.paid && purchase.status === 'paid') purchase.status = 'recorded';
  return purchase;
}

export function purchaseLabel(s: Pick<State, 'purchasePayments'>, purchase: Purchase): PurchaseLabel {
  if (isPurchaseDraft(purchase)) return 'draft';
  if (isPurchaseVoid(purchase)) return 'void';
  if (purchase.paid || purchaseBalance(s, purchase) <= 0) return 'paid';
  if (purchasePaidAmount(s, purchase.id) > 0) return 'partial';
  return 'pending';
}

export function purchaseLabelText(label: PurchaseLabel) {
  return ({
    draft: 'Borrador',
    void: 'Anulado',
    pending: 'Pendiente de pago',
    partial: 'Pagado en parte',
    paid: 'Pagado',
  })[label];
}

export function purchaseAgingBuckets(s: State, now: string) {
  const open = (s.purchases || []).filter(p => isPurchaseRecorded(p) && !p.paid && p.status !== 'void');
  const bucket = () => ({ count: 0, amount: 0 });
  const groups = {
    current: bucket(),
    d1_30: bucket(),
    d31_60: bucket(),
    d61_90: bucket(),
    d90plus: bucket(),
  };
  let pending = 0;
  for (const purchase of open) {
    const due = purchaseBalance(s, purchase);
    if (due <= 0) continue;
    pending = round(pending + due);
    const age = Math.floor((Date.parse(`${now}T12:00:00Z`) - Date.parse(`${purchase.dueDate}T12:00:00Z`)) / 86400000);
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

/** Cost of recorded purchases linked to a project (base without VAT for margin consistency with hours cost). */
export function projectPurchaseCost(s: State, projectId: string) {
  return round((s.purchases || [])
    .filter(p => p.projectId === projectId && isPurchaseRecorded(p) && p.status !== 'void')
    .reduce((sum, p) => sum + (p.base ?? p.amount), 0));
}

export function totalsFromPurchaseLines(lines: PurchaseLine[], vatRate: number) {
  const base = round(lines.reduce((sum, line) => sum + line.amount, 0));
  return withVat(base, vatRate);
}

export { VAT_RATES, withVat };
export type { PaymentMethod, VatRate };

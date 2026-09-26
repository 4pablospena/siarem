import type { Entity, State } from './crm.ts';

const round = (n: number) => Math.round(n * 100) / 100;

export function isProduct(item: Pick<Entity['services'], 'kind'>) {
  return (item.kind || 'service') === 'product';
}

export function isService(item: Pick<Entity['services'], 'kind'>) {
  return !isProduct(item);
}

export function lowStockItems(s: State) {
  return (s.services || []).filter(item => isProduct(item) && item.stock <= (item.minStock ?? 0));
}

export function applyStockDelta(
  s: State,
  args: { itemId: string; delta: number; reason: 'sale' | 'purchase' | 'adjust'; refKind: string; refId: string; date: string; note?: string; allowNegative?: boolean },
) {
  const item = s.services.find(service => service.id === args.itemId);
  if (!item || !isProduct(item)) throw new Error('El artículo de inventario no existe');
  const next = round(item.stock + args.delta);
  if (!args.allowNegative && next < -1e-9) throw new Error(`Stock insuficiente de ${item.name} (disponible ${item.stock})`);
  item.stock = next;
  if (!Array.isArray(s.stockMoves)) s.stockMoves = [];
  s.stockMoves.push({
    id: crypto.randomUUID(),
    demo: item.demo,
    itemId: args.itemId,
    delta: args.delta,
    reason: args.reason,
    refKind: args.refKind,
    refId: args.refId,
    date: args.date,
    note: (args.note || '').slice(0, 500),
  });
  return item;
}

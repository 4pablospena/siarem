import type { Entity, State } from './crm.ts';

type Contract = Entity['contracts'];

export function isContractActive(c: Pick<Contract, 'status'>) {
  return (c.status || 'active') === 'active' || c.status === 'notice';
}

export function contractsMrr(s: State) {
  return Math.round((s.contracts || [])
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + (c.mrr || 0), 0) * 100) / 100;
}

export function renewalsDue(s: State, from: string, to: string) {
  return (s.contracts || []).filter(c => isContractActive(c) && c.renewalDate >= from && c.renewalDate <= to);
}

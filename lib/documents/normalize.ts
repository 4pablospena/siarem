import type { DocumentRole, DocumentTipo, ExtractedLine, ExtractedRecord, NormalizedExtraction } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Parse EU-style amounts: 1.234,56 → 1234.56; plain JSON numbers kept. */
export function parseEuNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;
  const raw = value.trim().replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) {
    return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (/^\d+,\d+$/.test(raw)) return Number(raw.replace(',', '.')) || 0;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw) || 0;
  return Number(raw.replace(/[^\d.-]/g, '')) || 0;
}

/** Accept DD/MM/AAAA, DD.MM.AAAA, DD-MM-AAAA, ISO; return YYYY-MM-DD for CRM. */
export function normalizeDate(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return validYmd(y, m, d) ? v : '';
  }
  const m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return '';
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!validYmd(year, month, day)) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function validYmd(year: number, month: number, day: number) {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function asRole(value: unknown): DocumentRole {
  return value === 'checksum' || value === 'duplicate' || value === 'item' ? value : 'item';
}

function asTipo(value: unknown): DocumentTipo {
  return value === 'albaran' || value === 'otro' || value === 'factura' ? value : 'factura';
}

function asLine(value: unknown): ExtractedLine {
  const o = asRecord(value);
  return {
    description: String(o.description || ''),
    quantity: parseEuNumber(o.quantity) || 1,
    price: parseEuNumber(o.price),
    amount: parseEuNumber(o.amount),
  };
}

/**
 * European thousands mis-serialized as decimals (e.g. 20.409 → 20409).
 * Scale when n < 1000 and fractional digits look like a thousands group.
 */
export function fixEuThousands(n: number, peerHasThreeDecimals = false): number {
  if (!Number.isFinite(n) || n >= 1000 || n <= 0) return n;
  const text = String(n);
  const frac = text.split('.')[1] || '';
  if (!(frac.length === 3 || (frac.length === 2 && peerHasThreeDecimals))) return n;
  const scaled = n * 1000;
  const whole = Math.round(scaled);
  if (Math.abs(scaled - whole) < 1e-6) return whole;
  return n;
}

function applyMoneyFixes(records: ExtractedRecord[]): ExtractedRecord[] {
  const amounts = records.flatMap(r => [r.base, r.amount, r.vatAmount, ...r.lines.map(l => l.amount)]);
  const three = amounts.filter(n => ((String(n).split('.')[1] || '').length === 3)).length;
  const peerHasThree = amounts.length > 0 && three * 2 >= amounts.length;
  const fix = (n: number) => Math.round(fixEuThousands(n, peerHasThree) * 100) / 100;
  return records.map(record => ({
    ...record,
    base: fix(record.base),
    vatAmount: fix(record.vatAmount),
    amount: fix(record.amount),
    lines: record.lines.map(line => ({
      ...line,
      price: fix(line.price),
      amount: fix(line.amount),
    })),
  }));
}

function coerceRecord(value: unknown): ExtractedRecord {
  const o = asRecord(value);
  const { records: _nested, ...rest } = o;
  void _nested;
  const lines = Array.isArray(rest.lines) ? rest.lines.map(asLine) : [];
  const amount = parseEuNumber(rest.amount ?? rest.cantidad);
  const base = parseEuNumber(rest.base);
  const vatAmount = parseEuNumber(rest.vatAmount);
  const vatRate = parseEuNumber(rest.vatRate);
  let date = normalizeDate(rest.date);
  let dueDate = normalizeDate(rest.dueDate);
  if (date && !dueDate) dueDate = date;
  if (!date && dueDate) date = dueDate;
  return {
    role: asRole(rest.role),
    tipo: asTipo(rest.tipo),
    taxId: String(rest.taxId || '').toUpperCase(),
    supplierName: String(rest.supplierName || ''),
    number: String(rest.number || ''),
    date,
    dueDate,
    base,
    vatRate: vatRate || (base > 0 && amount > base ? Math.round(((amount / base) - 1) * 100) : 21),
    vatAmount: vatAmount || Math.max(0, Math.round((amount - base) * 100) / 100),
    amount: amount || base,
    lines: lines.length ? lines : [{ description: 'Concepto detectado', quantity: 1, price: base || amount, amount: base || amount }],
    rawPreview: String(rest.rawPreview || '').slice(0, 2000),
  };
}

function emptyRecord(): ExtractedRecord {
  return {
    role: 'item',
    tipo: 'factura',
    taxId: '',
    supplierName: '',
    number: '',
    date: '',
    dueDate: '',
    base: 0,
    vatRate: 21,
    vatAmount: 0,
    amount: 0,
    lines: [],
    rawPreview: '',
  };
}

/** Phase 4 — deterministic normalizer. Accepts { records } or a flat legacy object. */
export function normalizeExtraction(raw: unknown): NormalizedExtraction {
  const root = asRecord(raw);
  let list: unknown[] = [];
  if (Array.isArray(root.records)) list = root.records;
  else if (Object.keys(root).length) list = [root];

  const fixed = applyMoneyFixes(list.map(coerceRecord));
  const items = fixed.filter(r => r.role === 'item');
  const principal = items[0] || fixed[0] || emptyRecord();
  return { ...principal, records: fixed };
}

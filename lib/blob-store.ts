/** Ephemeral / R2-backed blob store for purchase attachments. */
type Binding = { put: (key: string, value: ArrayBuffer | Uint8Array | string, opts?: { httpMetadata?: { contentType?: string } }) => Promise<unknown>; get: (key: string) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer>; text: () => Promise<string> } | null> };

const memory = new Map<string, { bytes: Uint8Array; contentType: string }>();

function r2(): Binding | null {
  try {
    const env = (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env;
    const binding = (env as { R2?: Binding } | undefined)?.R2
      || (globalThis as { R2?: Binding }).R2;
    return binding || null;
  } catch {
    return null;
  }
}

export async function putBlob(key: string, bytes: Uint8Array, contentType: string) {
  const store = r2();
  if (store) {
    await store.put(key, bytes, { httpMetadata: { contentType } });
    return key;
  }
  memory.set(key, { bytes, contentType });
  return key;
}

export async function getBlob(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const store = r2();
  if (store) {
    const obj = await store.get(key);
    if (!obj) return null;
    const buf = await obj.arrayBuffer();
    return { bytes: new Uint8Array(buf), contentType: 'application/octet-stream' };
  }
  return memory.get(key) || null;
}

/** Extract draft fields from OCR text or a naive PDF/text dump. Used when OCR_ENDPOINT is unset (tests/local). */
export function parseInvoiceText(raw: string) {
  const text = raw.replace(/\r/g, '\n');
  const taxId = (text.match(/\b([A-Z]\d{7,8}[A-Z0-9]|\d{8}[A-Z])\b/i) || [])[1] || '';
  const number = (text.match(/(?:factura|invoice|n[ºo°]?)\s*[:#]?\s*([A-Z0-9\-\/]+)/i) || [])[1] || '';
  const dates = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2}|\d{2}[\/.]\d{2}[\/.]20\d{2})\b/g)].map(m => m[1]);
  const normalizeDate = (value: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const m = value.match(/^(\d{2})[\/.](\d{2})[\/.](20\d{2})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  };
  const amounts = [...text.matchAll(/(?:total|base|iva)\s*[:.]?\s*(\d+[.,]\d{2})/gi)].map(m => Number(m[1].replace(',', '.')));
  const total = amounts.at(-1) || 0;
  const base = amounts.length > 1 ? amounts[0] : Math.round(total / 1.21 * 100) / 100;
  const vatAmount = Math.round((total - base) * 100) / 100;
  return {
    taxId: taxId.toUpperCase(),
    number,
    date: normalizeDate(dates[0] || '') || '',
    dueDate: normalizeDate(dates[1] || dates[0] || '') || '',
    base,
    vatRate: total > 0 && base > 0 ? Math.round((total / base - 1) * 100) : 21,
    vatAmount,
    amount: total || base,
    lines: [{ description: 'Concepto detectado', quantity: 1, price: base || total, amount: base || total }],
    rawPreview: text.slice(0, 2000),
  };
}

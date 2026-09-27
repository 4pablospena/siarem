import { parseInvoiceText } from '@/lib/blob-store';
import { ExtractModelError, extractWithModel, hasExtractModel } from './extract-model';
import { getJobForRunner, takeJobPayload, updateJob } from './jobs';
import { normalizeExtraction } from './normalize';
import type { ExtractPayload, NormalizedExtraction } from './types';

export function offlineExtract(payload: ExtractPayload): NormalizedExtraction {
  let raw = '';
  if (payload.mode === 'text') raw = payload.extractedText;
  else if (payload.mode === 'document') {
    try {
      const b64 = payload.fileBase64.includes(',')
        ? payload.fileBase64.slice(payload.fileBase64.indexOf(',') + 1)
        : payload.fileBase64;
      raw = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    } catch {
      raw = '';
    }
  }
  const draft = parseInvoiceText(raw);
  return normalizeExtraction({
    records: [{
      role: 'item',
      tipo: 'factura',
      cantidad: draft.amount,
      taxId: draft.taxId,
      supplierName: '',
      number: draft.number,
      date: draft.date,
      dueDate: draft.dueDate,
      base: draft.base,
      vatRate: draft.vatRate,
      vatAmount: draft.vatAmount,
      amount: draft.amount,
      lines: draft.lines,
      rawPreview: draft.rawPreview,
    }],
  });
}

function errorCode(error: unknown): string {
  if (error instanceof ExtractModelError) return error.code;
  if (error instanceof Error) {
    if (/timeout|abort/i.test(error.message)) return 'model_timeout';
    if (/modelo|payload/i.test(error.message)) return 'model_error';
  }
  return 'extract_failed';
}

export async function runExtractJob(jobId: string) {
  const row = getJobForRunner(jobId);
  const payload = takeJobPayload(jobId);
  if (!row || !payload) {
    await updateJob(jobId, { status: 'failed', errorCode: 'payload_lost' });
    return;
  }
  await updateJob(jobId, { status: 'running' });
  try {
    let normalized: NormalizedExtraction;
    if (hasExtractModel()) {
      const raw = await extractWithModel(row.schemaId, payload);
      normalized = normalizeExtraction(raw);
    } else {
      normalized = offlineExtract(payload);
    }
    if (!normalized.records.some(r => r.role === 'item') && !normalized.amount && !normalized.number) {
      await updateJob(jobId, { status: 'failed', errorCode: 'empty_result' });
      return;
    }
    await updateJob(jobId, {
      status: 'succeeded',
      resultJson: JSON.stringify({
        ...normalized,
        attachmentKey: payload.attachmentKey || '',
      }),
    });
  } catch (error) {
    console.error(error);
    await updateJob(jobId, { status: 'failed', errorCode: errorCode(error) });
  }
}

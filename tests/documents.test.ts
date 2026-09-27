import test from 'node:test';
import assert from 'node:assert/strict';
import { alphanumericCount, chooseExtractMode, isUsableText } from '../lib/documents/usable-text.ts';
import { fixEuThousands, normalizeDate, normalizeExtraction, parseEuNumber } from '../lib/documents/normalize.ts';
import { createExtractJob, getJob, getJobForRunner, takeJobPayload, updateJob } from '../lib/documents/jobs.ts';
import { offlineExtract, runExtractJob } from '../lib/documents/run-extract.ts';
import { invoiceToolSchema } from '../lib/documents/schemas/invoice.ts';

test('usable text ignores page markers', () => {
  assert.equal(isUsableText('--- Página 1 ---\n--- Página 2 ---'), false);
  assert.ok(alphanumericCount('--- Página 1 ---\nabc') >= 3);
  assert.ok(isUsableText('Factura número F-1 con base 100 euros y total'));
});

test('router picks text, vision or document', () => {
  assert.equal(chooseExtractMode({ text: 'Factura número F-1 con base 100 euros y total', imageDataUrls: [] }).mode, 'text');
  assert.equal(chooseExtractMode({ text: '--- Página 1 ---', imageDataUrls: ['data:image/png;base64,xx'] }).mode, 'vision');
  assert.equal(chooseExtractMode({ text: '', imageDataUrls: [], fileBase64: 'JVBERi0=' }).mode, 'document');
  assert.throws(() => chooseExtractMode({ text: '', imageDataUrls: [] }));
});

test('normalize dates and EU numbers', () => {
  assert.equal(normalizeDate('15/01/2026'), '2026-01-15');
  assert.equal(normalizeDate('15.01.2026'), '2026-01-15');
  assert.equal(normalizeDate('2026-01-15'), '2026-01-15');
  assert.equal(normalizeDate('32/01/2026'), '');
  assert.equal(parseEuNumber('1.234,56'), 1234.56);
  assert.equal(parseEuNumber(20.409), 20.409);
  assert.equal(fixEuThousands(20.409), 20409);
  assert.equal(fixEuThousands(20409), 20409);
});

test('normalizeExtraction accepts flat or records and drops nested', () => {
  const flat = normalizeExtraction({
    tipo: 'factura',
    cantidad: 121,
    role: 'item',
    taxId: 'B22222222',
    number: 'F-1',
    date: '15/01/2026',
    base: 100,
    amount: 121,
  });
  assert.equal(flat.taxId, 'B22222222');
  assert.equal(flat.date, '2026-01-15');
  assert.equal(flat.dueDate, '2026-01-15');
  assert.equal(flat.records.length, 1);

  const multi = normalizeExtraction({
    records: [
      { role: 'item', tipo: 'factura', cantidad: 10, number: 'A', date: '01/02/2026' },
      { role: 'checksum', tipo: 'factura', cantidad: 10, number: 'A', date: '01/02/2026' },
      { role: 'item', tipo: 'factura', cantidad: 5, number: 'B', date: '01/02/2026', records: [{ role: 'item' }] },
    ],
  });
  assert.equal(multi.number, 'A');
  assert.equal(multi.records.length, 3);
  assert.equal(multi.records[2].role, 'item');
});

test('invoice tool schema forces records and role', () => {
  assert.deepEqual(invoiceToolSchema.required, ['records']);
  assert.ok(invoiceToolSchema.properties.records.items.required.includes('role'));
  assert.equal(invoiceToolSchema.additionalProperties, false);
});

test('extract job memory lifecycle with offline extract', async () => {
  const jobId = await createExtractJob({
    ownerUserId: 'u1',
    tenantId: 't1',
    schemaId: 'invoice',
    payload: {
      mode: 'text',
      extractedText: 'Factura F-99\nNIF B22222222\nFecha 2026-01-15\nBase 100,00\nTotal 121,00',
      attachmentKey: 'k1',
    },
  });
  assert.ok(takeJobPayload(jobId));
  assert.equal(getJobForRunner(jobId)?.status, 'pending');
  await runExtractJob(jobId);
  const job = await getJob(jobId, 'u1');
  assert.equal(job?.status, 'succeeded');
  const data = JSON.parse(job!.resultJson);
  assert.equal(data.taxId, 'B22222222');
  assert.equal(data.attachmentKey, 'k1');
  assert.equal(takeJobPayload(jobId), null);
});

test('offlineExtract maps regex draft into records', () => {
  const out = offlineExtract({
    mode: 'text',
    extractedText: 'Factura F-7\nNIF B22222222\nFecha 15/01/2026\nTotal 50,00',
  });
  assert.ok(out.records.length >= 1);
  assert.equal(out.records[0].role, 'item');
});

test('updateJob marks failed', async () => {
  const jobId = await createExtractJob({
    ownerUserId: 'u2',
    tenantId: 't1',
    schemaId: 'invoice',
    payload: { mode: 'text', extractedText: 'abc' },
  });
  await updateJob(jobId, { status: 'failed', errorCode: 'model_error' });
  const job = await getJob(jobId, 'u2');
  assert.equal(job?.status, 'failed');
  assert.equal(job?.errorCode, 'model_error');
});

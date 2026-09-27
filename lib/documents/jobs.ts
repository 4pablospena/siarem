import type { ExtractJobRow, ExtractPayload, JobStatus, SchemaId } from './types';
import { JOB_TTL_MS } from './types';

export type JobPayload = ExtractPayload & { attachmentKey?: string };

const memoryMeta = new Map<string, ExtractJobRow>();
const memoryPayload = new Map<string, JobPayload>();

function now() {
  return Date.now();
}

async function d1(): Promise<D1Database | null> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env as { DB?: D1Database }).DB || null;
  } catch {
    return null;
  }
}

export async function createExtractJob(input: {
  ownerUserId: string;
  tenantId: string;
  schemaId: SchemaId;
  payload: JobPayload;
}): Promise<string> {
  const id = crypto.randomUUID();
  const createdAt = now();
  const expiresAt = createdAt + JOB_TTL_MS;
  const row: ExtractJobRow = {
    id,
    ownerUserId: input.ownerUserId,
    tenantId: input.tenantId,
    schemaId: input.schemaId,
    status: 'pending',
    resultJson: '',
    errorCode: '',
    expiresAt,
    createdAt,
  };
  memoryMeta.set(id, row);
  memoryPayload.set(id, input.payload);
  const db = await d1();
  if (db) {
    try {
      await db.prepare(
        `INSERT INTO extract_jobs (id, owner_user_id, tenant_id, schema_id, status, result_json, error_code, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, input.ownerUserId, input.tenantId, input.schemaId, 'pending', '', '', expiresAt, createdAt).run();
    } catch (error) {
      console.error('extract_jobs insert skipped', error);
    }
  }
  return id;
}

export function takeJobPayload(jobId: string): JobPayload | null {
  return memoryPayload.get(jobId) || null;
}

/** Runner lookup without owner check (same process only). */
export function getJobForRunner(jobId: string): ExtractJobRow | null {
  const row = memoryMeta.get(jobId);
  if (!row) return null;
  if (row.expiresAt < now()) {
    memoryMeta.delete(jobId);
    memoryPayload.delete(jobId);
    return null;
  }
  return row;
}

export async function updateJob(jobId: string, patch: { status: JobStatus; resultJson?: string; errorCode?: string }) {
  const current = memoryMeta.get(jobId);
  if (current) {
    memoryMeta.set(jobId, {
      ...current,
      status: patch.status,
      resultJson: patch.resultJson ?? current.resultJson,
      errorCode: patch.errorCode ?? current.errorCode,
    });
  }
  const db = await d1();
  if (db) {
    try {
      await db.prepare(
        `UPDATE extract_jobs SET status = ?, result_json = COALESCE(?, result_json), error_code = COALESCE(?, error_code) WHERE id = ?`,
      ).bind(patch.status, patch.resultJson ?? null, patch.errorCode ?? null, jobId).run();
    } catch (error) {
      console.error('extract_jobs update skipped', error);
    }
  }
  if (patch.status === 'succeeded' || patch.status === 'failed') {
    memoryPayload.delete(jobId);
  }
}

export async function getJob(jobId: string, ownerUserId: string): Promise<ExtractJobRow | null> {
  const mem = memoryMeta.get(jobId);
  if (mem) {
    if (mem.ownerUserId !== ownerUserId) return null;
    if (mem.expiresAt < now()) {
      memoryMeta.delete(jobId);
      memoryPayload.delete(jobId);
      return null;
    }
    return mem;
  }
  const db = await d1();
  if (!db) return null;
  try {
    const row = await db.prepare(
      `SELECT id, owner_user_id as ownerUserId, tenant_id as tenantId, schema_id as schemaId, status,
              result_json as resultJson, error_code as errorCode, expires_at as expiresAt, created_at as createdAt
       FROM extract_jobs WHERE id = ?`,
    ).bind(jobId).first<ExtractJobRow>();
    if (!row || row.ownerUserId !== ownerUserId) return null;
    if (row.expiresAt < now()) return null;
    return row;
  } catch {
    return null;
  }
}

export function purgeExpiredJobs(at = now()) {
  for (const [id, row] of memoryMeta) {
    if (row.expiresAt < at) {
      memoryMeta.delete(id);
      memoryPayload.delete(id);
    }
  }
}

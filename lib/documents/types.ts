export type DocumentRole = 'item' | 'checksum' | 'duplicate';

export type DocumentTipo = 'factura' | 'albaran' | 'otro';

export type ExtractedLine = {
  description: string;
  quantity: number;
  price: number;
  amount: number;
};

export type ExtractedRecord = {
  role: DocumentRole;
  tipo: DocumentTipo;
  taxId: string;
  supplierName: string;
  number: string;
  date: string;
  dueDate: string;
  base: number;
  vatRate: number;
  vatAmount: number;
  amount: number;
  lines: ExtractedLine[];
  rawPreview: string;
};

export type NormalizedExtraction = ExtractedRecord & {
  records: ExtractedRecord[];
};

export type ParseResult = {
  text: string;
  imageDataUrls: string[];
  pageCount: number;
};

export type ExtractPayload =
  | { mode: 'text'; extractedText: string }
  | { mode: 'vision'; pageImageDataUrls: string[] }
  | { mode: 'document'; fileBase64: string };

export type SchemaId = 'invoice';

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export type ExtractJobRow = {
  id: string;
  ownerUserId: string;
  tenantId: string;
  schemaId: SchemaId;
  status: JobStatus;
  resultJson: string;
  errorCode: string;
  expiresAt: number;
  createdAt: number;
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_VISION_PAGES = 12;
export const JOB_TTL_MS = 15 * 60 * 1000;
export const POLL_TIMEOUT_MS = 3 * 60 * 1000;
export const USABLE_TEXT_MIN_CHARS = 30;

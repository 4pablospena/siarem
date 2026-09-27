import type { ExtractPayload, SchemaId } from './types';
import { invoiceSystemPrompt, invoiceToolSchema } from './schemas/invoice';

export type ExtractModelErrorCode = 'model_forbidden' | 'model_timeout' | 'model_error' | 'empty_payload';

export class ExtractModelError extends Error {
  code: ExtractModelErrorCode;
  constructor(code: ExtractModelErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const MODEL_TIMEOUT_MS = 60_000;

function litellmBase() {
  return (process.env.LITELLM_BASE_URL || process.env.HERMES_BASE_URL || '').replace(/\/$/, '');
}

function litellmKey() {
  return process.env.LITELLM_API_KEY || process.env.LLM_API_KEY || process.env.HERMES_API_KEY || '';
}

function litellmModel() {
  return process.env.LITELLM_MODEL || process.env.LLM_MODEL || 'hermes-agent';
}

export function hasExtractModel() {
  return Boolean(litellmBase() && litellmKey());
}

function schemaFor(id: SchemaId) {
  if (id === 'invoice') return { schema: invoiceToolSchema, system: invoiceSystemPrompt };
  throw new Error('Esquema no soportado');
}

function userContent(payload: ExtractPayload): unknown[] {
  if (payload.mode === 'text') {
    return [{ type: 'text', text: payload.extractedText }];
  }
  if (payload.mode === 'vision') {
    const images = payload.pageImageDataUrls.slice(0, 12).map(url => {
      const m = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: m?.[1] || 'image/png',
          data: m?.[2] || url.replace(/^data:[^;]+;base64,/, ''),
        },
      };
    });
    return [
      { type: 'text', text: 'La primera imagen es la página 1; no hay capa de texto usable. Extrae los registros del documento.' },
      ...images,
    ];
  }
  return [
    {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: payload.fileBase64.includes(',') ? payload.fileBase64.slice(payload.fileBase64.indexOf(',') + 1) : payload.fileBase64,
      },
    },
    { type: 'text', text: 'Documento PDF sin capa de texto usable. Extrae los registros.' },
  ];
}

function parseJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function recordsNonEmpty(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const records = (payload as { records?: unknown }).records;
  if (Array.isArray(records)) return records.length > 0;
  return Object.keys(payload as object).length > 0;
}

function extractFromMessage(data: unknown): unknown | null {
  const root = data as {
    content?: Array<{ type?: string; name?: string; input?: unknown; text?: string }>;
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }>; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
  };
  const blocks = root.content || [];
  for (const block of blocks) {
    if (block.type === 'tool_use' && block.name === 'extract_document' && block.input && typeof block.input === 'object') {
      return block.input;
    }
  }
  for (const block of blocks) {
    if (block.type === 'text' && block.text) {
      const parsed = parseJsonObject(block.text);
      if (parsed) return parsed;
    }
  }
  for (const choice of root.choices || []) {
    for (const call of choice.message?.tool_calls || []) {
      if (call.function?.name === 'extract_document' && call.function.arguments) {
        const parsed = parseJsonObject(call.function.arguments);
        if (parsed) return parsed;
      }
    }
    const content = choice.message?.content;
    if (typeof content === 'string') {
      const parsed = parseJsonObject(content);
      if (parsed) return parsed;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.text) {
          const parsed = parseJsonObject(part.text);
          if (parsed) return parsed;
        }
      }
    }
  }
  return null;
}

async function fetchModel(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODEL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
      throw new ExtractModelError('model_timeout', 'El modelo no respondió a tiempo');
    }
    throw new ExtractModelError('model_error', 'No se pudo contactar con el modelo');
  } finally {
    clearTimeout(timer);
  }
}

function throwForStatus(status: number, body: string) {
  if (status === 401 || status === 403) {
    throw new ExtractModelError('model_forbidden', 'La clave no puede usar el modelo configurado');
  }
  if (status === 404 || status === 405) return 'fallback' as const;
  const snippet = body.slice(0, 200);
  if (/not allowed to access model|model_not_found|Invalid model/i.test(snippet)) {
    throw new ExtractModelError('model_forbidden', 'La clave no puede usar el modelo configurado');
  }
  throw new ExtractModelError('model_error', 'El modelo no respondió');
}

async function callChatCompletions(schemaId: SchemaId, payload: ExtractPayload, withTools: boolean): Promise<unknown | null> {
  const { schema, system } = schemaFor(schemaId);
  const base = litellmBase();
  const key = litellmKey();
  const model = litellmModel();
  let userText = '';
  if (payload.mode === 'text') userText = payload.extractedText;
  else if (payload.mode === 'vision') userText = 'Imágenes de páginas sin capa de texto. Extrae registros.';
  else userText = 'PDF sin capa de texto. Extrae registros.';
  if (!withTools) {
    userText += '\n\nResponde solo JSON con forma {"records":[...]} sin markdown.';
  }

  const content: unknown[] = [{ type: 'text', text: userText }];
  if (payload.mode === 'vision') {
    for (const url of payload.pageImageDataUrls.slice(0, 12)) {
      content.push({ type: 'image_url', image_url: { url } });
    }
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: payload.mode === 'text' ? userText : content },
    ],
  };
  if (withTools) {
    body.tools = [{
      type: 'function',
      function: {
        name: 'extract_document',
        description: 'Extrae registros estructurados del documento.',
        parameters: schema,
      },
    }];
    body.tool_choice = { type: 'function', function: { name: 'extract_document' } };
  }

  const res = await fetchModel(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throwForStatus(res.status, text);
    throw new ExtractModelError('model_error', 'El modelo no respondió');
  }
  try {
    return extractFromMessage(JSON.parse(text));
  } catch {
    throw new ExtractModelError('model_error', 'Respuesta del modelo ilegible');
  }
}

async function callMessages(schemaId: SchemaId, payload: ExtractPayload): Promise<unknown | null> {
  const { schema, system } = schemaFor(schemaId);
  const base = litellmBase();
  const key = litellmKey();
  const model = litellmModel();
  if (/^ollama/i.test(model)) {
    try {
      const withTools = await callChatCompletions(schemaId, payload, true);
      if (withTools && recordsNonEmpty(withTools)) return withTools;
    } catch (error) {
      if (error instanceof ExtractModelError && error.code === 'model_forbidden') throw error;
      // Model may reject tools; fall through to JSON-only.
    }
    return callChatCompletions(schemaId, payload, false);
  }

  const body = {
    model,
    max_tokens: 16384,
    system,
    messages: [{ role: 'user', content: userContent(payload) }],
    tools: [{ name: 'extract_document', description: 'Extrae registros estructurados del documento.', input_schema: schema }],
    tool_choice: { type: 'tool', name: 'extract_document' },
  };
  const res = await fetchModel(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    if (throwForStatus(res.status, text) === 'fallback') {
      const withTools = await callChatCompletions(schemaId, payload, true);
      if (withTools && recordsNonEmpty(withTools)) return withTools;
      return callChatCompletions(schemaId, payload, false);
    }
  }
  try {
    return extractFromMessage(JSON.parse(text));
  } catch {
    throw new ExtractModelError('model_error', 'Respuesta del modelo ilegible');
  }
}

/** Up to 2 model calls. Empty records[] is rejected and retried. */
export async function extractWithModel(schemaId: SchemaId, payload: ExtractPayload): Promise<unknown> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await callMessages(schemaId, payload);
    if (last && recordsNonEmpty(last)) return last;
  }
  throw new ExtractModelError('empty_payload', 'Sin payload usable del modelo');
}

import { extractText, getDocumentProxy } from 'unpdf';
import { PDFDocument } from 'pdf-lib';
import { MAX_FILE_BYTES, MAX_VISION_PAGES, type ParseResult } from './types';

function bytesFromBase64(data: string) {
  const raw = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function looksLikePdf(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function pageMarkedText(pages: string[]) {
  return pages.map((page, index) => `--- Página ${index + 1} ---\n${page.trim()}`).join('\n\n');
}

/**
 * Phase 1 — parse without a model.
 * Extracts per-page text. Page screenshots are not rendered on Workers (no canvas);
 * imageDataUrls stays empty and the extract router falls back to PDF base64 for scans.
 */
export async function parseDocument(dataBase64: string, contentType = 'application/pdf'): Promise<ParseResult> {
  const bytes = bytesFromBase64(dataBase64);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('El archivo supera 10 MB');

  if (contentType.startsWith('text/') || (!looksLikePdf(bytes) && contentType === 'text/plain')) {
    const text = new TextDecoder().decode(bytes);
    return { text: `--- Página 1 ---\n${text}`, imageDataUrls: [], pageCount: 1 };
  }

  if (contentType.startsWith('image/')) {
    const dataUrl = dataBase64.startsWith('data:') ? dataBase64 : `data:${contentType};base64,${dataBase64}`;
    return { text: '', imageDataUrls: [dataUrl], pageCount: 1 };
  }

  if (!looksLikePdf(bytes)) {
    const text = new TextDecoder().decode(bytes);
    return { text: `--- Página 1 ---\n${text}`, imageDataUrls: [], pageCount: 1 };
  }

  const pdf = await getDocumentProxy(bytes);
  const limited = Math.min(pdf.numPages, MAX_VISION_PAGES);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text.slice(0, limited) : [String(text || '')];
  while (pages.length < limited) pages.push('');

  // pdf-lib confirms page count when unpdf reports 0 (corrupt/empty).
  let pageCount = limited || 0;
  if (!pageCount) {
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      pageCount = Math.min(doc.getPageCount(), MAX_VISION_PAGES);
    } catch {
      pageCount = pages.length || 1;
    }
  }

  return {
    text: pageMarkedText(pages.length ? pages : ['']),
    imageDataUrls: [],
    pageCount: pageCount || 1,
  };
}

export function toBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

import { USABLE_TEXT_MIN_CHARS } from './types';

/** Page markers alone do not count as usable text. */
export function stripPageMarkers(text: string) {
  return text.replace(/---\s*Página\s+\d+\s*---/gi, ' ');
}

/** Count alphanumeric characters after removing page markers. */
export function alphanumericCount(text: string) {
  return (stripPageMarkers(text).match(/[0-9A-Za-zÀ-ÿ]/g) || []).length;
}

export function isUsableText(text: string, min = USABLE_TEXT_MIN_CHARS) {
  return alphanumericCount(text) >= min;
}

export function chooseExtractMode(input: {
  text: string;
  imageDataUrls: string[];
  fileBase64?: string;
}): { mode: 'text'; extractedText: string } | { mode: 'vision'; pageImageDataUrls: string[] } | { mode: 'document'; fileBase64: string } {
  if (isUsableText(input.text)) return { mode: 'text', extractedText: input.text };
  if (input.imageDataUrls.length > 0) {
    return { mode: 'vision', pageImageDataUrls: input.imageDataUrls.slice(0, 12) };
  }
  if (input.fileBase64) return { mode: 'document', fileBase64: input.fileBase64 };
  throw new Error('No hay texto usable ni capturas ni PDF para extraer');
}

'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  Eye,
  FileScan,
  FileText,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { eur, type State } from '@/lib/crm';
import { chooseExtractMode } from '@/lib/documents/usable-text';
import { POLL_TIMEOUT_MS } from '@/lib/documents/types';
import type { ExtractedRecord, NormalizedExtraction } from '@/lib/documents/types';

export type OcrDraft = {
  taxId: string;
  number: string;
  date: string;
  dueDate: string;
  base: number;
  vatRate: number;
  vatAmount: number;
  amount: number;
  lines: { description: string; quantity: number; price: number; amount: number; itemId?: string }[];
  rawPreview: string;
  supplierCompanyId: string;
  supplierName: string;
  attachmentKey: string;
  status: string;
  records?: ExtractedRecord[];
};

export type OcrInboxItem = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  key: string;
  at: string;
  draft: OcrDraft | null;
  error?: string;
  jobId?: string;
  /** Local object URL for preview (revoked on remove). */
  previewUrl?: string;
};

function kindIcon(contentType: string, name: string) {
  if (contentType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)) return ImageIcon;
  return FileText;
}

function isPdf(contentType: string, name: string) {
  return contentType === 'application/pdf' || /\.pdf$/i.test(name);
}

function isImage(contentType: string, name: string) {
  return contentType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name);
}

function isText(contentType: string, name: string) {
  return contentType.startsWith('text/') || /\.txt$/i.test(name);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(item: OcrInboxItem) {
  if (item.error) return 'Error';
  if (item.draft) return 'Listo';
  if (item.jobId) return 'Extrayendo';
  return 'Procesando';
}

function statusTone(item: OcrInboxItem) {
  if (item.error) return 'error';
  if (item.draft) return 'ready';
  return 'busy';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function toDraft(data: NormalizedExtraction & { attachmentKey?: string }, companies: State['companies']): OcrDraft {
  const supplier = data.taxId
    ? companies.find(c => (c.taxId || '').toUpperCase() === data.taxId.toUpperCase())
    : undefined;
  return {
    taxId: data.taxId,
    number: data.number,
    date: data.date,
    dueDate: data.dueDate,
    base: data.base,
    vatRate: data.vatRate,
    vatAmount: data.vatAmount,
    amount: data.amount,
    lines: (data.lines || []).map(l => ({ ...l, itemId: '' })),
    rawPreview: data.rawPreview,
    supplierCompanyId: supplier?.id || '',
    supplierName: supplier?.name || data.supplierName || '',
    attachmentKey: data.attachmentKey || '',
    status: 'draft',
    records: data.records,
  };
}

const jobErrorMessage: Record<string, string> = {
  model_forbidden: 'La clave del modelo no puede usar LITELLM_MODEL / LLM_MODEL. Revisa el modelo permitido.',
  model_timeout: 'El modelo no respondió a tiempo. Vuelve a intentar.',
  model_error: 'El modelo no pudo extraer el documento.',
  empty_payload: 'El modelo no devolvió datos útiles.',
  empty_result: 'No se detectaron datos de factura.',
  payload_lost: 'Se perdió el archivo en el servidor. Vuelve a subir el documento.',
  extract_failed: 'La extracción falló.',
};

async function pollJob(jobId: string): Promise<NormalizedExtraction & { attachmentKey?: string }> {
  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const res = await fetch(`/api/documents/extract/${jobId}`);
    const json = await res.json() as { status?: string; data?: NormalizedExtraction & { attachmentKey?: string }; error?: string };
    if (!res.ok) throw new Error(jobErrorMessage[json.error || ''] || json.error || 'No se pudo consultar la extracción');
    if (json.status === 'succeeded' && json.data) return json.data;
    if (json.status === 'failed') {
      const code = json.error || 'extract_failed';
      throw new Error(jobErrorMessage[code] || `La extracción falló (${code})`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('La extracción superó 3 minutos');
}

function DocumentPreview({ item, className }: { item: OcrInboxItem; className?: string }) {
  if (!item.previewUrl) {
    return (
      <div className={'ocr-preview-empty ' + (className || '')}>
        <FileText size={28} />
        <p>Sin vista previa local</p>
      </div>
    );
  }
  if (isImage(item.contentType, item.name)) {
    return (
      <div className={'ocr-preview-media ' + (className || '')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.previewUrl} alt={item.name} />
      </div>
    );
  }
  if (isPdf(item.contentType, item.name)) {
    return (
      <iframe
        className={'ocr-preview-frame ' + (className || '')}
        title={item.name}
        src={item.previewUrl}
      />
    );
  }
  if (isText(item.contentType, item.name)) {
    return (
      <iframe
        className={'ocr-preview-frame ocr-preview-text ' + (className || '')}
        title={item.name}
        src={item.previewUrl}
      />
    );
  }
  return (
    <div className={'ocr-preview-empty ' + (className || '')}>
      <FileText size={28} />
      <p>Vista previa no disponible para este tipo</p>
    </div>
  );
}

function DropSurface({
  dragging,
  working,
  busy,
  compact,
  onBrowse,
  onDragState,
  onDropFiles,
}: {
  dragging: boolean;
  working: boolean;
  busy: boolean;
  compact?: boolean;
  onBrowse: () => void;
  onDragState: (v: boolean) => void;
  onDropFiles: (files: FileList) => void;
}) {
  const dragDepth = useRef(0);

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    dragDepth.current += 1;
    onDragState(true);
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) onDragState(false);
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    onDragState(false);
    if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={'ocr-dropzone' + (compact ? ' is-compact' : '') + (dragging ? ' is-dragging' : '') + (working ? ' is-working' : '')}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      aria-label="Zona para soltar documentos"
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onBrowse();
        }
      }}
      onClick={() => { if (!busy && !working) onBrowse(); }}
    >
      <div className="ocr-dropzone-icon" aria-hidden>
        {working ? <Loader2 size={compact ? 22 : 32} className="spin" /> : <FileScan size={compact ? 22 : 32} />}
      </div>
      <div className="ocr-dropzone-copy">
        <strong>{working ? 'Leyendo documentos…' : dragging ? 'Suelta para cargar' : 'Arrastra documentos aquí'}</strong>
        <p>
          {compact
            ? 'PDF, imagen o texto · hasta 10 MB'
            : 'Facturas, albaranes u otros archivos. PDF, imagen o texto · hasta 10 MB. Nada se guarda hasta que confirmes el gasto.'}
        </p>
      </div>
      {!working && (
        <button
          type="button"
          className="primary"
          disabled={busy || working}
          onClick={e => { e.stopPropagation(); onBrowse(); }}
        >
          <Upload size={16} /> Elegir archivos
        </button>
      )}
      <ul className="ocr-format-chips" aria-label="Formatos admitidos">
        <li>PDF</li>
        <li>Imagen</li>
        <li>Texto</li>
      </ul>
    </div>
  );
}

export function OcrInbox({
  state,
  busy,
  items,
  onItemsChange,
  onCreatePurchase,
}: {
  state: State;
  busy: boolean;
  items: OcrInboxItem[];
  onItemsChange: (items: OcrInboxItem[]) => void;
  onCreatePurchase: (draft: OcrDraft, fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const selected = items.find(item => item.id === selectedId) || items[0] || null;

  useEffect(() => {
    return () => {
      for (const item of items) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
    // Only revoke on unmount of the module.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeItem = useCallback((id: string) => {
    const target = items.find(x => x.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    const filtered = items.filter(x => x.id !== id);
    onItemsChange(filtered);
    if (selectedId === id) {
      setSelectedId(filtered[0]?.id || null);
      setViewerOpen(false);
    }
  }, [items, onItemsChange, selectedId]);

  const ingest = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length || working || busy) return;
    setWorking(true);
    const next = [...items];
    try {
      for (const file of list) {
        const id = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);
        const placeholder: OcrInboxItem = {
          id,
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          key: '',
          at: new Date().toISOString(),
          draft: null,
          previewUrl,
        };
        next.unshift(placeholder);
        onItemsChange([...next]);
        setSelectedId(id);

        const patch = (partial: Partial<OcrInboxItem>) => {
          const idx = next.findIndex(item => item.id === id);
          if (idx >= 0) next[idx] = { ...next[idx], ...partial };
          onItemsChange([...next]);
        };

        try {
          if (file.size > 10_000_000) throw new Error('El archivo supera 10 MB');

          const base64 = await fileToBase64(file);
          const fd = new FormData();
          fd.append('file', file);
          const up = await fetch('/api/purchase-upload', { method: 'POST', body: fd });
          const uj = await up.json() as { error?: string; key?: string };
          if (!up.ok || !uj.key) throw new Error(uj.error || 'No se pudo subir');

          const parseRes = await fetch('/api/documents/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: base64, contentType: file.type || 'application/pdf' }),
          });
          const parsed = await parseRes.json() as { error?: string; text?: string; imageDataUrls?: string[] };
          if (!parseRes.ok) throw new Error(parsed.error || 'No se pudo parsear');

          const route = chooseExtractMode({
            text: parsed.text || '',
            imageDataUrls: parsed.imageDataUrls || [],
            fileBase64: base64,
          });

          const extractBody =
            route.mode === 'text' ? { extractedText: route.extractedText }
              : route.mode === 'vision' ? { pageImageDataUrls: route.pageImageDataUrls }
                : { fileBase64: route.fileBase64 };

          const ex = await fetch('/api/documents/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schemaId: 'invoice', attachmentKey: uj.key, ...extractBody }),
          });
          const ej = await ex.json() as { error?: string; jobId?: string };
          if (!ex.ok || !ej.jobId) throw new Error(ej.error || 'No se pudo iniciar la extracción');
          patch({ key: uj.key, jobId: ej.jobId });

          const data = await pollJob(ej.jobId);
          const draft = toDraft(data, state.companies);
          patch({ key: uj.key, draft, jobId: ej.jobId });
        } catch (error) {
          patch({ error: (error as Error).message });
        }
      }
    } finally {
      setWorking(false);
    }
  }, [busy, items, onItemsChange, state.companies, working]);

  const browse = () => inputRef.current?.click();
  const Icon = selected ? kindIcon(selected.contentType, selected.name) : Upload;
  const itemRecords = (selected?.draft?.records || []).filter(r => r.role === 'item');

  return (
    <div className="ocr-module">
      <header className="ocr-hero">
        <div>
          <p className="eyebrow">Módulo OCR</p>
          <h2>Digitalizar documentos</h2>
          <p className="ocr-hero-text">Carga, revisa el original y confirma los datos antes de crear el gasto.</p>
        </div>
      </header>

      <DropSurface
        dragging={dragging}
        working={working}
        busy={busy}
        onBrowse={browse}
        onDragState={setDragging}
        onDropFiles={files => void ingest(files)}
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf,text/plain,.txt"
        multiple
        hidden
        disabled={busy || working}
        onChange={e => {
          const files = e.target.files;
          e.target.value = '';
          if (files) void ingest(files);
        }}
      />

      <div className="ocr-layout">
        <aside className="ocr-list" aria-label="Documentos cargados">
          <div className="ocr-list-head">
            <h3>Bandeja <span className="count">{items.length}</span></h3>
          </div>
          {!items.length && (
            <DropSurface
              compact
              dragging={dragging}
              working={working}
              busy={busy}
              onBrowse={browse}
              onDragState={setDragging}
              onDropFiles={files => void ingest(files)}
            />
          )}
          <ul>
            {items.map(item => {
              const ItemIcon = kindIcon(item.contentType, item.name);
              const tone = statusTone(item);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={selected?.id === item.id ? 'selected' : ''}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="ocr-list-thumb" aria-hidden>
                      <ItemIcon size={16} />
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {formatBytes(item.size)}
                        <span className={'ocr-status-dot tone-' + tone}>{statusLabel(item)}</span>
                      </small>
                    </span>
                  </button>
                  <button type="button" className="icon-button" aria-label="Quitar de la bandeja" onClick={() => removeItem(item.id)}>
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="ocr-review" aria-label="Revisión OCR">
          {!selected && <p className="muted">Sube un documento para ver el original y los datos detectados.</p>}
          {selected && (
            <>
              <header className="ocr-review-head">
                <div className="ocr-review-title">
                  <Icon size={20} />
                  <div>
                    <strong>{selected.name}</strong>
                    <small>{selected.contentType || 'archivo'} · {formatBytes(selected.size)}</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="outline"
                  disabled={!selected.previewUrl}
                  onClick={() => setViewerOpen(true)}
                >
                  <Eye size={16} /> Ver documento
                </button>
              </header>

              <div className="ocr-split">
                  <div className={'ocr-doc-pane' + (selected.previewUrl ? ' is-openable' : '')}
                    role={selected.previewUrl ? 'button' : undefined}
                    tabIndex={selected.previewUrl ? 0 : undefined}
                    onClick={() => selected.previewUrl && setViewerOpen(true)}
                    onKeyDown={e => {
                      if (!selected.previewUrl) return;
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewerOpen(true); }
                    }}
                    aria-label={selected.previewUrl ? 'Abrir vista ampliada del documento' : undefined}
                  >
                    <DocumentPreview item={selected} className="ocr-doc-pane-preview" />
                    {selected.previewUrl && <span className="ocr-doc-pane-hint"><Maximize2 size={14} /> Ampliar</span>}
                  </div>

                <div className="ocr-data-pane">
                  {selected.error && <p className="error" role="alert">{selected.error}</p>}
                  {!selected.draft && !selected.error && (
                    <p className="muted ocr-loading"><Loader2 size={14} className="spin" /> Parseando y extrayendo…</p>
                  )}
                  {selected.draft && (
                    <>
                      {itemRecords.length > 1 && (
                        <p className="muted">{itemRecords.length} registros detectados. Se usará el primero al crear el gasto.</p>
                      )}
                      <dl className="ocr-meta">
                        <div><dt>Proveedor</dt><dd>{selected.draft.supplierName || 'Sin coincidencia por NIF'}{selected.draft.taxId ? ` · ${selected.draft.taxId}` : ''}</dd></div>
                        <div><dt>Número</dt><dd>{selected.draft.number || '—'}</dd></div>
                        <div><dt>Emisión</dt><dd>{selected.draft.date || '—'}</dd></div>
                        <div><dt>Vencimiento</dt><dd>{selected.draft.dueDate || '—'}</dd></div>
                        <div><dt>Base</dt><dd>{eur(selected.draft.base || 0)}</dd></div>
                        <div><dt>IVA {selected.draft.vatRate || 0}%</dt><dd>{eur(selected.draft.vatAmount || 0)}</dd></div>
                        <div><dt>Total</dt><dd>{eur(selected.draft.amount || 0)}</dd></div>
                      </dl>
                      {(selected.draft.lines || []).length > 0 && (
                        <ul className="ocr-lines">
                          {selected.draft.lines.map((line, index) => (
                            <li key={index}><span>{line.description}</span><strong>{eur(line.amount)}</strong></li>
                          ))}
                        </ul>
                      )}
                      {selected.draft.rawPreview && (
                        <details className="ocr-preview">
                          <summary>Texto detectado</summary>
                          <pre>{selected.draft.rawPreview}</pre>
                        </details>
                      )}
                      <div className="panel-actions">
                        <button
                          type="button"
                          className="primary"
                          disabled={busy}
                          onClick={() => onCreatePurchase(selected.draft!, selected.name)}
                        >
                          Crear gasto con estos datos
                        </button>
                        {!selected.draft.supplierCompanyId && selected.draft.taxId && (
                          <p className="muted">No hay empresa con NIF {selected.draft.taxId}. Elige proveedor al guardar el gasto.</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <Dialog open={viewerOpen && !!selected} onOpenChange={setViewerOpen}>
        <DialogContent showCloseButton={false} className="ocr-viewer-dialog">
          <DialogClose className="close-panel" aria-label="Cerrar"><X size={17} /></DialogClose>
          <DialogHeader>
            <DialogTitle>{selected?.name || 'Documento'}</DialogTitle>
            <DialogDescription>
              {selected ? `${formatBytes(selected.size)} · vista del original` : 'Vista del documento'}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="ocr-viewer-body">
              <DocumentPreview item={selected} className="ocr-viewer-preview" />
            </div>
          )}
          {selected?.draft && (
            <div className="ocr-viewer-footer">
              <span className="muted">
                {selected.draft.number ? `Factura ${selected.draft.number}` : 'Datos detectados'}
                {selected.draft.amount ? ` · ${eur(selected.draft.amount)}` : ''}
              </span>
              <button
                type="button"
                className="primary"
                disabled={busy || !selected.draft}
                onClick={() => {
                  if (!selected.draft) return;
                  onCreatePurchase(selected.draft, selected.name);
                  setViewerOpen(false);
                }}
              >
                Crear gasto
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

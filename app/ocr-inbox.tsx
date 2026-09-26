'use client';

import { useCallback, useRef, useState, type DragEvent } from 'react';
import { FileScan, FileText, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { eur, type State } from '@/lib/crm';

export type OcrDraft = {
  taxId: string;
  number: string;
  date: string;
  dueDate: string;
  base: number;
  vatRate: number;
  vatAmount: number;
  amount: number;
  lines: { description: string; quantity: number; price: number; amount: number }[];
  rawPreview: string;
  supplierCompanyId: string;
  supplierName: string;
  attachmentKey: string;
  status: string;
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
};

function kindIcon(contentType: string, name: string) {
  if (contentType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)) return ImageIcon;
  return FileText;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
  const selected = items.find(item => item.id === selectedId) || items[0] || null;

  const ingest = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length || working || busy) return;
    setWorking(true);
    const next = [...items];
    try {
      for (const file of list) {
        const id = crypto.randomUUID();
        const placeholder: OcrInboxItem = {
          id,
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          key: '',
          at: new Date().toISOString(),
          draft: null,
        };
        next.unshift(placeholder);
        onItemsChange([...next]);
        setSelectedId(id);
        try {
          const fd = new FormData();
          fd.append('file', file);
          const up = await fetch('/api/purchase-upload', { method: 'POST', body: fd });
          const uj = await up.json() as { error?: string; key?: string };
          if (!up.ok || !uj.key) throw new Error(uj.error || 'No se pudo subir');
          const oc = await fetch('/api/purchase-ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: uj.key }),
          });
          const oj = await oc.json() as { error?: string; draft?: OcrDraft };
          if (!oc.ok || !oj.draft) throw new Error(oj.error || 'No se pudo leer');
          const idx = next.findIndex(item => item.id === id);
          if (idx >= 0) next[idx] = { ...next[idx], key: uj.key, draft: oj.draft };
          onItemsChange([...next]);
        } catch (error) {
          const idx = next.findIndex(item => item.id === id);
          if (idx >= 0) next[idx] = { ...next[idx], error: (error as Error).message };
          onItemsChange([...next]);
        }
      }
    } finally {
      setWorking(false);
    }
  }, [busy, items, onItemsChange, working]);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void ingest(event.dataTransfer.files);
  }

  const Icon = selected ? kindIcon(selected.contentType, selected.name) : Upload;

  return (
    <div className="ocr-module">
      <div
        className={'ocr-dropzone' + (dragging ? ' is-dragging' : '')}
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <FileScan size={28} aria-hidden />
        <div>
          <strong>Contenedor OCR</strong>
          <p>Arrastra facturas, albaranes o documentos (PDF, imagen o texto). Se leen aquí; nada se guarda hasta que confirmes el gasto.</p>
        </div>
        <button type="button" className="primary" disabled={busy || working} onClick={() => inputRef.current?.click()}>
          {working ? <><Loader2 size={16} className="spin" /> Leyendo…</> : <><Upload size={16} /> Elegir archivos</>}
        </button>
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
      </div>

      <div className="ocr-layout">
        <aside className="ocr-list" aria-label="Documentos cargados">
          <h3>Bandeja <span className="count">{items.length}</span></h3>
          {!items.length && <p className="muted">Todavía no hay documentos.</p>}
          <ul>
            {items.map(item => {
              const ItemIcon = kindIcon(item.contentType, item.name);
              return (
                <li key={item.id}>
                  <button type="button" className={selected?.id === item.id ? 'selected' : ''} onClick={() => setSelectedId(item.id)}>
                    <ItemIcon size={16} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{formatBytes(item.size)}{item.error ? ' · error' : item.draft ? ' · leído' : ' · procesando'}</small>
                    </span>
                  </button>
                  <button type="button" className="icon-button" aria-label="Quitar de la bandeja" onClick={() => {
                    const filtered = items.filter(x => x.id !== item.id);
                    onItemsChange(filtered);
                    if (selectedId === item.id) setSelectedId(filtered[0]?.id || null);
                  }}><Trash2 size={14} /></button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="ocr-review" aria-label="Revisión OCR">
          {!selected && <p className="muted">Sube un documento para ver el resultado del OCR.</p>}
          {selected && (
            <>
              <header>
                <Icon size={20} />
                <div>
                  <strong>{selected.name}</strong>
                  <small>{selected.contentType || 'archivo'} · {formatBytes(selected.size)}</small>
                </div>
              </header>
              {selected.error && <p className="error" role="alert">{selected.error}</p>}
              {!selected.draft && !selected.error && <p className="muted"><Loader2 size={14} className="spin" /> Extrayendo datos…</p>}
              {selected.draft && (
                <>
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
                    {!state.companies.some(c => c.companyRole !== 'client') && (
                      <p className="muted">Crea una empresa con rol proveedor para enlazar el gasto.</p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

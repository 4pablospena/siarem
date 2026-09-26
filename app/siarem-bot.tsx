'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, Copy, Send, Square, X } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { eur, risk, today, type State } from '@/lib/crm';
import { isOpenOpportunity, pipelineNextAction, pipelineOpportunities } from '@/lib/pipeline';
import { areaOf } from '@/lib/areas';
import type { BotActionInput } from '@/lib/bot-actions';

type ChatMessage = { role: 'user' | 'assistant'; content: string; action?: BotActionInput };

const promptsByArea: Record<string, string[]> = {
  Hoy: ['¿Qué hago ahora?', '¿A quién escribo primero?', 'Prepárame el siguiente mensaje'],
  Pipeline: ['¿Qué oportunidad priorizo?', 'Muévela de etapa si procede', 'Prepárame el siguiente mensaje'],
  Proyectos: ['¿Qué tareas van tarde?', '¿Quién necesita apoyo?', 'Resume el estado del proyecto'],
  Leads: ['¿A quién contacto primero?', '¿Cuáles están listos para convertir?', 'Prepárame el siguiente mensaje'],
  Clientes: ['¿A quién debo retomar?', 'Resume el historial de este cliente', '¿Qué falta en los contactos?'],
  Facturación: ['¿Qué cobro reclamo primero?', 'Registra un cobro pendiente', 'Resume lo pendiente de cobro'],
  Informes: ['Resume el embudo', '¿Qué se atasca?', '¿Cómo van los cobros del mes?'],
  Inicio: ['¿Qué hago ahora?', '¿A quién escribo primero?', 'Prepárame el siguiente mensaje'],
};

export function botBrief(view: string, state: State) {
  const openLeads = state.leads.filter((lead) => lead.status !== 'Convertido' && lead.status !== 'Descartado');
  const openOpps = state.opportunities.filter(isOpenOpportunity);
  const urgent = pipelineOpportunities(state, { focus: true });
  const next = (item: State['opportunities'][number]) => {
    const action = pipelineNextAction(state, item);
    return action ? `siguiente acción ${action.title}${action.date ? ' (' + action.date + ')' : ''}` : '';
  };
  const unpaid = state.invoices.filter((invoice) => !invoice.paid);
  const area = areaOf(view)?.name || view;
  const lines = [
    `Área: ${area}`,
    `Pantalla: ${view}`,
    `Hoy: ${today()}`,
    openLeads.length
      ? `Leads por trabajar: ${openLeads.map((lead) => `${lead.name} (${lead.status}${lead.nextDate ? ', acción ' + lead.nextDate : ''})`).join('; ')}`
      : 'Leads por trabajar: ninguno',
    openOpps.length
      ? `Oportunidades abiertas: ${openOpps.map((item) => `${item.title} id=${item.id} en ${item.stage}, ${eur(item.amount)}, ${next(item)}`).join('; ')}`
      : 'Oportunidades abiertas: ninguna',
    urgent.length
      ? `Piden atención, por prioridad: ${urgent.map((item) => `${item.title}: ${risk(state, item).reason}`).join('; ')}`
      : 'Piden atención: ninguna',
    unpaid.length ? `Facturas sin cobrar: ${unpaid.map((invoice) => `${invoice.title} id=${invoice.id} ${eur(invoice.amount)} vence ${invoice.dueDate}`).join('; ')}` : 'Facturas sin cobrar: ninguna',
  ];
  return lines.join('\n').slice(0, 6000);
}

function parseBotAction(text: string): { clean: string; action?: BotActionInput } {
  const match = text.match(/BOT_ACTION:(\{.*\})\s*$/m);
  if (!match) return { clean: text };
  try {
    const raw = JSON.parse(match[1]) as Omit<BotActionInput, 'requestId'>;
    if (!raw.kind || !['stage', 'followup', 'pay'].includes(raw.kind)) return { clean: text };
    return {
      clean: text.replace(match[0], '').trim(),
      action: { ...raw, requestId: crypto.randomUUID() },
    };
  } catch {
    return { clean: text };
  }
}

function actionLabel(action: BotActionInput) {
  if (action.kind === 'stage') return `Mover oportunidad a ${action.stage}`;
  if (action.kind === 'followup') return `Crear seguimiento: ${action.title}`;
  return `Registrar cobro de factura`;
}

/** Lightweight formatting without HTML injection. */
function BotText({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  lines.forEach((line, index) => {
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const content = bullet ? bullet[1] : line;
    const parts = content.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
      return part;
    });
    if (bullet) nodes.push(<li key={index}>{parts}</li>);
    else nodes.push(<p key={index}>{parts.length ? parts : '\u00a0'}</p>);
  });
  const grouped: ReactNode[] = [];
  let list: ReactNode[] = [];
  nodes.forEach((node, index) => {
    if (typeof node === 'object' && node && 'type' in node && node.type === 'li') {
      list.push(node);
      return;
    }
    if (list.length) {
      grouped.push(<ul key={'list-' + index}>{list}</ul>);
      list = [];
    }
    grouped.push(node);
  });
  if (list.length) grouped.push(<ul key="list-end">{list}</ul>);
  return <div className="bot-text">{grouped}</div>;
}

export function SiaremBot({ open, view, context, onClose, onRestoreFocus, onAction }: {
  open: boolean; view: string; context: string; onClose: () => void; onRestoreFocus: () => void;
  onAction?: (action: BotActionInput) => Promise<{ ok: boolean; detail?: string }>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const area = areaOf(view)?.name || 'Inicio';
  const prompts = promptsByArea[area] || promptsByArea.Inicio;

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, busy]);

  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setDraft('');
    setError('');
    setBusy(false);
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...messages, { role: 'user' as const, content }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setDraft('');
    setBusy(true);
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content: body }) => ({ role, content: body })), context }),
        signal: controller.signal,
      });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !type.includes('text/event-stream') || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Siarem-bot no ha podido responder.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]' || data.startsWith(':')) continue;
          try {
            const event = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
            const delta = event.choices?.[0]?.delta?.content;
            if (!delta) continue;
            answer += delta;
            const parsed = parseBotAction(answer);
            const snapshot = parsed.clean;
            setMessages((current) => current.map((item, index) => (index === current.length - 1 ? { ...item, content: snapshot, action: parsed.action } : item)));
          } catch {
            continue;
          }
        }
      }
      if (!answer) setMessages((current) => current.map((item, index) => (index === current.length - 1 ? { ...item, content: 'Siarem-bot no ha dicho nada. Prueba con otra pregunta.' } : item)));
      else {
        const parsed = parseBotAction(answer);
        setMessages((current) => current.map((item, index) => (index === current.length - 1 ? { ...item, content: parsed.clean || item.content, action: parsed.action } : item)));
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        setMessages((current) => {
          const last = current[current.length - 1];
          if (last?.role === 'assistant' && !last.content) return current.slice(0, -1);
          return current;
        });
      } else {
        setMessages((current) => current.slice(0, -1));
        setError(cause instanceof Error ? cause.message : 'Siarem-bot no ha podido responder.');
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function confirmAction(action: BotActionInput, index: number) {
    if (!onAction || actionBusy) return;
    setActionBusy(true);
    setError('');
    try {
      const result = await onAction(action);
      if (!result.ok) throw new Error(result.detail || 'No se pudo ejecutar la acción');
      setMessages(current => current.map((item, i) => i === index ? { ...item, action: undefined, content: `${item.content}\n\nHecho: ${result.detail || 'cambio guardado'}` } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo ejecutar la acción');
    } finally {
      setActionBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError('No se pudo copiar. Selecciona el texto y cópialo.');
    }
  }

  return (
    <Sheet open={open} onOpenChange={value => { if (!value) onClose() }}>
      <SheetContent onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus() }} side="right" showCloseButton={false} className="bot-panel">
        <header className="bot-header">
          <div className="bot-identity">
            <span className="bot-avatar" aria-hidden="true"><Bot size={18} /></span>
            <div>
              <SheetTitle>Siarem-bot</SheetTitle>
              <SheetDescription>{busy ? 'Escribiendo…' : 'Listo · Confirma cada cambio antes de guardarlo'}</SheetDescription>
            </div>
          </div>
          <div className="bot-header-actions">
            {messages.length > 0 && <button type="button" className="subtle" onClick={reset}>Nueva conversación</button>}
            <button type="button" className="icon-button" aria-label="Cerrar Siarem-bot" onClick={onClose}><X size={16} /></button>
          </div>
        </header>
        <div className="bot-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversación con Siarem-bot">
          {messages.length === 0 && (
            <div className="bot-empty">
              <span className="bot-avatar" aria-hidden="true"><Bot size={20} /></span>
              <p>Pregúntame qué hacer con leads, oportunidades o cobros. Si propongo un cambio, lo confirmas aquí antes de guardarlo.</p>
            </div>
          )}
          {messages.map((item, index) => (
            <article key={`${item.role}-${index}`} className={item.role === 'user' ? 'bot-user' : 'bot-assistant'}>
              {item.role === 'assistant' && <span className="bot-avatar" aria-hidden="true"><Bot size={14} /></span>}
              <div className="bot-bubble">
                {item.content
                  ? <BotText text={item.content} />
                  : busy && index === messages.length - 1
                    ? <span className="bot-typing" aria-label="Escribiendo"><i /><i /><i /></span>
                    : null}
                {item.role === 'assistant' && item.action && onAction && (
                  <button type="button" className="primary bot-action" disabled={actionBusy} onClick={() => void confirmAction(item.action!, index)}>
                    {actionBusy ? 'Guardando…' : 'Confirmar: ' + actionLabel(item.action)}
                  </button>
                )}
                {item.role === 'assistant' && item.content && (
                  <button type="button" className="bot-copy" onClick={() => void copy(item.content)} aria-label="Copiar respuesta">
                    <Copy size={13} /> Copiar
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {messages.length === 0 && (
          <div className="bot-prompts">
            {prompts.map(prompt => (
              <button key={prompt} type="button" disabled={busy} onClick={() => void send(prompt)}>{prompt}</button>
            ))}
          </div>
        )}
        <form
          className="bot-compose"
          onSubmit={event => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            aria-label="Mensaje para Siarem-bot"
            value={draft}
            rows={1}
            placeholder="Escribe lo que necesitas…"
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          {busy
            ? <button className="outline" type="button" onClick={stop} aria-label="Detener respuesta"><Square size={14} /></button>
            : <button className="primary" type="submit" disabled={!draft.trim()} aria-label="Enviar a Siarem-bot"><Send size={16} /></button>}
        </form>
      </SheetContent>
    </Sheet>
  );
}

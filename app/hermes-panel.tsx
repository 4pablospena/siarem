'use client';

import { useState } from 'react';
import { Send, X } from 'lucide-react';
import { Sheet,SheetContent,SheetTitle,SheetDescription } from '@/components/ui/sheet';
import { eur, risk, today, type State } from '@/lib/crm';
import { isOpenOpportunity, pipelineNextAction, pipelineOpportunities } from '@/lib/pipeline';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const prompts = ['¿Qué hago ahora?', '¿A quién escribo primero?', 'Prepárame el siguiente mensaje'];

export function hermesBrief(view: string, state: State) {
  const openLeads = state.leads.filter((lead) => lead.status !== 'Convertido' && lead.status !== 'Descartado');
  const openOpps = state.opportunities.filter(isOpenOpportunity);
  const urgent = pipelineOpportunities(state, { focus: true });
  const next = (item: State['opportunities'][number]) => {
    const action = pipelineNextAction(state, item);
    return action ? `siguiente acción ${action.title}${action.date ? ' (' + action.date + ')' : ''}` : '';
  };
  const unpaid = state.invoices.filter((invoice) => !invoice.paid);
  const lines = [
    `Pantalla: ${view}`,
    `Hoy: ${today()}`,
    openLeads.length
      ? `Leads por trabajar: ${openLeads.map((lead) => `${lead.name} (${lead.status}${lead.nextDate ? ', acción ' + lead.nextDate : ''})`).join('; ')}`
      : 'Leads por trabajar: ninguno',
    openOpps.length
      ? `Oportunidades abiertas: ${openOpps.map((item) => `${item.title} en ${item.stage}, ${eur(item.amount)}, ${next(item)}`).join('; ')}`
      : 'Oportunidades abiertas: ninguna',
    urgent.length
      ? `Piden atención, por prioridad: ${urgent.map((item) => `${item.title}: ${risk(state, item).reason}`).join('; ')}`
      : 'Piden atención: ninguna',
    unpaid.length ? `Facturas sin cobrar: ${unpaid.map((invoice) => `${invoice.title} ${eur(invoice.amount)} vence ${invoice.dueDate}`).join('; ')}` : 'Facturas sin cobrar: ninguna',
  ];
  return lines.join('\n').slice(0, 6000);
}

export function HermesPanel({ open, context, onClose, onRestoreFocus }: { open: boolean; context: string; onClose: () => void; onRestoreFocus: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsKey, setNeedsKey] = useState(false);
  const [key, setKey] = useState('');

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...messages, { role: 'user' as const, content }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setDraft('');
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/hermes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context, key: key || undefined }),
      });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !type.includes('text/event-stream') || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string; needsKey?: boolean } | null;
        if (payload?.needsKey) setNeedsKey(true);
        throw new Error(payload?.error || 'Hermes no ha podido responder.');
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
            const snapshot = answer;
            setMessages((current) => current.map((item, index) => (index === current.length - 1 ? { ...item, content: snapshot } : item)));
          } catch {
            continue;
          }
        }
      }
      if (!answer) setMessages((current) => current.map((item, index) => (index === current.length - 1 ? { ...item, content: 'Hermes no ha dicho nada. Prueba con otra pregunta.' } : item)));
    } catch (cause) {
      setMessages((current) => current.slice(0, -1));
      setError(cause instanceof Error ? cause.message : 'Hermes no ha podido responder.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={value=>{if(!value)onClose()}}><SheetContent onCloseAutoFocus={event=>{event.preventDefault();onRestoreFocus()}} side="right" showCloseButton={false} className="hermes-panel">
      <header>
        <div>
          <SheetTitle>Hermes</SheetTitle>
          <SheetDescription>Te ayuda con el siguiente paso</SheetDescription>
        </div>
        <button type="button" className="icon-button" aria-label="Cerrar Hermes" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="hermes-log" role="log" aria-live="polite" aria-label="Conversación con Hermes">
        {messages.length === 0 && <p className="hermes-empty">Pregúntame qué hacer con los leads, las oportunidades, un mensaje o un cobro. Miro lo que tienes ahora en Siarem.</p>}
        {messages.map((item, index) => (
          <article key={`${item.role}-${index}`} className={item.role === 'user' ? 'hermes-user' : 'hermes-assistant'}>
            {item.content || (busy ? 'Hermes está pensando…' : '')}
          </article>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {needsKey && (
        <label className="field hermes-key">
          <span>Clave de Hermes</span>
          <input type="password" name="hermes-key" value={key} autoComplete="off" autoCorrect="off" spellCheck={false} aria-label="Clave de Hermes, oculta" onChange={(event) => setKey(event.target.value)} />
        </label>
      )}
      <div className="hermes-prompts">
        {prompts.map((prompt) => (
          <button key={prompt} type="button" disabled={busy} onClick={() => void send(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
      <form
        className="hermes-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <input aria-label="Mensaje para Hermes" value={draft} placeholder="Escribe lo que necesitas…" onChange={(event) => setDraft(event.target.value)} />
        <button className="primary" type="submit" disabled={busy || !draft.trim()} aria-label="Enviar a Hermes">
          <Send size={16} />
        </button>
      </form>
    </SheetContent></Sheet>
  );
}

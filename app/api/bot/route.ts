import { getChatGPTUser } from '../../chatgpt-auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const message = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

const bodySchema = z.object({
  messages: z.array(message).min(1).max(20),
  context: z.string().max(6000).default(''),
});

const system = `Eres Siarem-bot, el asistente de Siarem. Ayudas a llevar el ciclo comercial: leads, oportunidades, empresas, presupuestos, proyectos y cobros.
Habla en español, con frases cortas. No inventes empresas, importes ni fechas: usa solo el contexto.
Cuando propongas un cambio concreto, termina con un bloque JSON en una sola línea con este formato exacto (sin markdown):
BOT_ACTION:{"kind":"stage"|"followup"|"pay", ...campos}
Campos:
- stage: opportunityId, stage, expectedStage
- followup: opportunityId, title, dueDate (YYYY-MM-DD)
- pay: invoiceId, date (YYYY-MM-DD)
No afirmes que el cambio ya está guardado: la persona debe confirmarlo en la interfaz.`;

function botBase() {
  return (process.env.LITELLM_BASE_URL || process.env.HERMES_BASE_URL || 'http://127.0.0.1:8642').replace(/\/$/, '');
}

function botKey() {
  return process.env.LLM_API_KEY || process.env.HERMES_API_KEY || '';
}

function botModel() {
  return process.env.LLM_MODEL || 'hermes-agent';
}

function redactSecret(text: string, secret: string) {
  return secret ? text.replaceAll(secret, '') : text;
}

function hiddenStream(body: ReadableStream<Uint8Array>, secret: string) {
  if (!secret) return body;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = '';
  const hold = secret.length - 1;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending = redactSecret(pending + decoder.decode(chunk, { stream: true }), secret);
      if (pending.length <= hold) return;
      controller.enqueue(encoder.encode(pending.slice(0, pending.length - hold)));
      pending = pending.slice(pending.length - hold);
    },
    flush(controller) {
      pending = redactSecret(pending + decoder.decode(), secret);
      if (pending) controller.enqueue(encoder.encode(pending));
    },
  }));
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Inicia sesión para hablar con Siarem-bot.' }, { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: 'El mensaje no es válido.' }, { status: 400 });
  }

  const key = botKey();
  if (!key) {
    return Response.json({
      error: 'Siarem-bot espera LLM_API_KEY en el servidor. Sin esa variable no se llama al modelo.',
      needsKey: true,
    }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${botBase()}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: botModel(),
        stream: true,
        messages: [
          { role: 'system', content: `${system}\n\nContexto de Siarem:\n${parsed.context || 'Sin datos cargados.'}` },
          ...parsed.messages,
        ],
      }),
    });
  } catch {
    return Response.json({ error: 'No encuentro a Siarem-bot. Comprueba LITELLM_BASE_URL y vuelve a intentar.' }, { status: 502 });
  }

  if (upstream.status === 401) return Response.json({ error: 'La clave del servidor no es válida para el modelo.' }, { status: 401 });
  if (!upstream.ok || !upstream.body) return Response.json({ error: 'Siarem-bot no ha podido responder. Vuelve a intentar.' }, { status: 502 });

  return new Response(hiddenStream(upstream.body, key), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

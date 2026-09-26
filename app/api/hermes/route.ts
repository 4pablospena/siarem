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
  key: z.string().trim().min(1).max(300).optional(),
});

const system = `Eres Hermes, el asistente de Siarem. Ayudas a una persona que no es técnica a llevar todo el proceso comercial: leads, oportunidades, empresas, presupuestos, proyectos y cobros.
Habla en español, con frases cortas. No inventes empresas, importes ni fechas: usa solo el contexto. Di un siguiente paso concreto que se pueda hacer en la pantalla actual. No afirmes que has cambiado datos: la persona confirma cada cambio en Siarem.`;

function hermesBase() {
  return (process.env.LITELLM_BASE_URL || process.env.HERMES_BASE_URL || 'http://127.0.0.1:8642').replace(/\/$/, '');
}

function hermesKey(override?: string) {
  return override || process.env.LLM_API_KEY || process.env.HERMES_API_KEY || '';
}

function hermesModel() {
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
  if (!user) return Response.json({ error: 'Inicia sesión para hablar con Hermes.' }, { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: 'El mensaje no es válido.' }, { status: 400 });
  }

  const key = hermesKey(parsed.key);
  if (!key) {
    return Response.json({ error: 'Hermes no tiene clave. Escríbela en el panel o define LLM_API_KEY en el servidor.', needsKey: true }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${hermesBase()}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: hermesModel(),
        stream: true,
        messages: [
          { role: 'system', content: `${system}\n\nContexto de Siarem:\n${parsed.context || 'Sin datos cargados.'}` },
          ...parsed.messages,
        ],
      }),
    });
  } catch {
    return Response.json({ error: 'No encuentro a Hermes en este equipo. Déjalo encendido y vuelve a intentar.' }, { status: 502 });
  }

  if (upstream.status === 401) return Response.json({ error: 'La clave de Hermes no es válida.', needsKey: true }, { status: 401 });
  if (!upstream.ok || !upstream.body) return Response.json({ error: 'Hermes no ha podido responder. Vuelve a intentar.' }, { status: 502 });

  return new Response(hiddenStream(upstream.body, key), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

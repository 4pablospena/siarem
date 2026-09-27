import { getChatGPTUser } from '../../chatgpt-auth';
import { getMembership as membership } from '@/db/store';

export async function requireMember(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return { error: Response.json({ error: 'Inicia sesión para continuar' }, { status: 401 }) };
  const member = await membership(user.userId);
  if (!member) return { error: Response.json({ error: 'Crea una empresa o acepta una invitación' }, { status: 403 }) };
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return { error: Response.json({ error: 'Origen no permitido' }, { status: 403 }) };
  }
  return { user, member };
}

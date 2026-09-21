import { getChatGPTUser,chatGPTSignInPath } from './chatgpt-auth';
import CRM from './crm-client';
export const dynamic='force-dynamic';
export default async function Home(){const user=await getChatGPTUser();if(!user)return <main className="login"><div className="brand">s<span>i</span>arem<span className="brand-dot">.</span></div><h1>Tu equipo. El siguiente paso.</h1><p>Accede al espacio de trabajo de tu empresa.</p><a className="primary" href={chatGPTSignInPath('/')} target="_top">Iniciar sesión con ChatGPT →</a><small>Los datos de cada empresa son privados y se comparten solo con su equipo.</small></main>;return <CRM/>}

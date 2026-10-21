import { createHash, timingSafeEqual } from 'node:crypto'
import { cobrarPendentes } from '@/lib/conversa'
import { sqlSistema, comoEmpresa } from '@/lib/db'

const h = (t: string) => createHash('sha256').update(t).digest()

// Chamado uma vez por dia pela Vercel (vercel.json), que manda CRON_SECRET no cabeçalho.
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || !timingSafeEqual(h(req.headers.get('authorization') ?? ''), h(`Bearer ${segredo}`))) return new Response('Proibido', { status: 401 })
  // Cada construtora no seu próprio contexto: a trava por empresa vale também para a rotina.
  let lembretes = 0
  for (const { id } of await sqlSistema<{ id: number }[]>`select id from empresas where ativa`) lembretes += await comoEmpresa(id, cobrarPendentes)
  return Response.json({ lembretes })
}

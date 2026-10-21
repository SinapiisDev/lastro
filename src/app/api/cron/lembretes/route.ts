import { createHash, timingSafeEqual } from 'node:crypto'
import { cobrarPendentes } from '@/lib/conversa'

const h = (t: string) => createHash('sha256').update(t).digest()

// Chamado uma vez por dia pela Vercel (vercel.json), que manda CRON_SECRET no cabeçalho.
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || !timingSafeEqual(h(req.headers.get('authorization') ?? ''), h(`Bearer ${segredo}`))) return new Response('Proibido', { status: 401 })
  return Response.json({ lembretes: await cobrarPendentes() })
}

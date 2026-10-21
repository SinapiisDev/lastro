import { cobrarPendentes } from '@/lib/conversa'

// Chamado uma vez por dia pela Vercel (vercel.json), que manda CRON_SECRET no cabeçalho.
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) return new Response('Proibido', { status: 401 })
  return Response.json({ lembretes: await cobrarPendentes() })
}

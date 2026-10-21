import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'
import { linkTemporario } from '@/lib/storage'

// Confere quem está pedindo e devolve um link do arquivo que vale por 60 segundos.
export async function GET(_: Request, { params }: RouteContext<'/anexos/[id]'>) {
  const s = await exigirSessao()
  const id = Number((await params).id)
  const [a] = await sql<{ caminho: string; obraId: number }[]>`
    select a.caminho, c.obra_id as "obraId" from anexos a join v_compras c on c.id = a.compra_id where a.id = ${id}`
  if (!a || !podeVerObra(s, a.obraId)) return new Response('Documento não encontrado', { status: 404 })
  redirect(await linkTemporario(a.caminho))
}

import { sql } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'
import { baixarArquivo } from '@/lib/storage'

// Foto da obra servida pelo próprio site (a CSP só aceita imagem daqui). Confere quem pede, como os anexos.
export async function GET(_: Request, { params }: RouteContext<'/fotos/[id]'>) {
  const s = await exigirSessao()
  const id = Number((await params).id)
  const [f] = Number.isInteger(id)
    ? await sql<{ caminho: string; obraId: number }[]>`select caminho, obra_id as "obraId" from fotos where id = ${id}`
    : []
  if (!f || !podeVerObra(s, f.obraId)) return new Response('Foto não encontrada', { status: 404 })
  return new Response(new Uint8Array(await baixarArquivo(f.caminho)), {
    // A foto nunca muda depois de enviada: o navegador guarda e não pede de novo.
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' },
  })
}

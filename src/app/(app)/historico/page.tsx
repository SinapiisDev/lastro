import Link from 'next/link'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { descreverEvento, quando, type Evento } from '@/lib/historico'
import { Rolagem } from '@/components/ui'

const POR_PAGINA = 200

export default async function Historico({ searchParams }: PageProps<'/historico'>) {
  await exigirSessao('financeiro', 'chefe')
  const antes = Number((await searchParams).antes) || 0
  const eventos = await sql<(Evento & { compraId: string | null })[]>`
    select id, em, perfil, tabela, acao, antes, depois,
      case when tabela = 'compras' then registro_id::text else coalesce(depois, antes) ->> 'compra_id' end as "compraId"
    from historico
    ${antes ? sql`where id < ${antes}` : sql``}
    order by id desc
    limit ${POR_PAGINA}`

  return (
    <div className="grid gap-4">
      <h1>Histórico</h1>
      <p className="text-cinza">Tudo o que foi feito no sistema, do mais recente para o mais antigo. Nada aqui pode ser apagado.</p>
      <section className="cartao">
        <Rolagem>
          <table className="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>O que</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{quando(e.em)}</td>
                  <td className="whitespace-nowrap">{e.perfil}</td>
                  <td>
                    {e.compraId ? (
                      <Link href={`/compras/${e.compraId}`} className="underline">
                        {descreverEvento(e)}
                      </Link>
                    ) : (
                      descreverEvento(e)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Rolagem>
        {eventos.length === POR_PAGINA && (
          <Link href={`/historico?antes=${eventos.at(-1)!.id}`} className="btn mt-4">
            Ver mais antigos
          </Link>
        )}
      </section>
    </div>
  )
}

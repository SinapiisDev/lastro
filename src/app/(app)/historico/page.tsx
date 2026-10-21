import Link from 'next/link'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { descreverEvento, quando, type Evento } from '@/lib/historico'
import { BotaoLink, CabecalhoTela, Secao, Tabela, Td, Th, Tr } from '@ds'

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
    <>
      <CabecalhoTela contexto="Registro permanente" titulo="Histórico">
        <p className="max-w-3xl text-table text-ink-2">Tudo o que foi feito no sistema, do mais recente para o mais antigo. Nada aqui pode ser apagado.</p>
      </CabecalhoTela>
      <Secao titulo={antes ? 'Eventos mais antigos' : 'Eventos recentes'}>
        <Tabela minimo={640}>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Quem</Th>
              <Th>O que</Th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => (
              <Tr key={e.id}>
                <Td className="whitespace-nowrap text-ink-2">{quando(e.em)}</Td>
                <Td className="whitespace-nowrap font-semibold">{e.perfil}</Td>
                <Td>{e.compraId ? <Link href={`/compras/${e.compraId}`}>{descreverEvento(e)}</Link> : descreverEvento(e)}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabela>
        {eventos.length === POR_PAGINA && (
          <div>
            <BotaoLink href={`/historico?antes=${eventos.at(-1)!.id}`}>Ver mais antigos</BotaoLink>
          </div>
        )}
      </Secao>
    </>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CabecalhoTela, Secao, Situacao } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { carregarFornecedor, fornecedorNaObra } from '@/lib/conversa'
import { Conversa } from '@/components/conversa'

// Simular uma resposta faz a IA ler a mensagem na hora.
export const maxDuration = 120

export default async function ConversaFornecedor({ params }: PageProps<'/conversas/[id]'>) {
  const s = await exigirSessao()
  const f = await carregarFornecedor(Number((await params).id))
  if (!f || (s.perfil === 'obra' && !(await fornecedorNaObra(f.id, s.obraId!)))) notFound()
  const cotacoes = await sql<{ id: number; titulo: string; obra: string; situacao: string }[]>`
    select c.id, c.titulo, o.nome as obra, cf.situacao
    from cotacao_fornecedores cf join cotacoes c on c.id = cf.cotacao_id join obras o on o.id = c.obra_id
    where cf.fornecedor_id = ${f.id} and c.situacao = 'aguardando' ${s.perfil === 'obra' ? sql`and c.obra_id = ${s.obraId!}` : sql``}
    order by c.id desc`

  return (
    <>
      <CabecalhoTela contexto={<Link href="/conversas">‹ Conversas</Link>} titulo={`Conversa com ${f.nome}`} />
      <section className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Secao titulo="Cotações em aberto">
          {cotacoes.length === 0 ? (
            <p className="text-table text-ink-3">Nenhuma cotação aberta com este fornecedor.</p>
          ) : (
            <ul className="flex flex-col">
              {cotacoes.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 border-b border-line py-2.5 last:border-0">
                  <Link href={`/cotacoes/${c.id}`} className="text-table font-semibold">
                    Cotação nº {c.id}: {c.titulo}
                  </Link>
                  <span className="flex flex-wrap items-center gap-2 text-caption text-ink-3">
                    {c.obra} <Situacao status={`forn_${c.situacao}`} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
        <Conversa fornecedor={f} />
      </section>
    </>
  )
}

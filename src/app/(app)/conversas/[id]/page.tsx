import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { carregarFornecedor } from '@/lib/conversa'
import { Secao, Situacao } from '@/components/ui'
import { Conversa } from '@/components/conversa'

// Simular uma resposta faz a IA ler a mensagem na hora.
export const maxDuration = 120

export default async function ConversaFornecedor({ params }: PageProps<'/conversas/[id]'>) {
  await exigirSessao('chefe', 'financeiro')
  const f = await carregarFornecedor(Number((await params).id))
  if (!f) notFound()
  const cotacoes = await sql<{ id: number; titulo: string; obra: string; situacao: string }[]>`
    select c.id, c.titulo, o.nome as obra, cf.situacao
    from cotacao_fornecedores cf join cotacoes c on c.id = cf.cotacao_id join obras o on o.id = c.obra_id
    where cf.fornecedor_id = ${f.id} and c.situacao = 'aguardando' order by c.id desc`

  return (
    <div className="grid gap-4">
      <h1>Conversa com {f.nome}</h1>
      {cotacoes.length > 0 && (
        <Secao titulo="Cotações em aberto com este fornecedor">
          <ul className="grid gap-1">
            {cotacoes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/cotacoes/${c.id}`} className="underline">
                  Cotação nº {c.id}: {c.titulo}
                </Link>
                <span className="text-cinza">({c.obra})</span>
                <Situacao status={`forn_${c.situacao}`} />
              </li>
            ))}
          </ul>
        </Secao>
      )}
      <section className="cartao">
        <Conversa fornecedor={f} podeSimular />
      </section>
    </div>
  )
}

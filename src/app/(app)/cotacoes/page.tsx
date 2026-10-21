import Link from 'next/link'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { dataBR } from '@/lib/regras'
import { Situacao, Vazio, Rolagem } from '@/components/ui'

export default async function Cotacoes({ searchParams }: PageProps<'/cotacoes'>) {
  const s = await exigirSessao()
  const obraId = s.perfil === 'obra' ? s.obraId! : Number((await searchParams).obra) || 0
  const cotacoes = await sql<{ id: number; obra: string; titulo: string; situacao: string; prazo: string; respostas: number; fornecedores: number; criadaEm: Date }[]>`
    select c.id, o.nome as obra, c.titulo, c.situacao, c.prazo_resposta as prazo, c.criada_em as "criadaEm",
      (select count(*) from cotacao_fornecedores cf where cf.cotacao_id = c.id)::int as fornecedores,
      (select count(distinct cf.id) from cotacao_fornecedores cf join cotacao_precos cp on cp.cotacao_fornecedor_id = cf.id
        where cf.cotacao_id = c.id)::int as respostas
    from cotacoes c join obras o on o.id = c.obra_id
    ${obraId ? sql`where c.obra_id = ${obraId}` : sql``}
    order by c.id desc limit 200`

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Cotações</h1>
        {s.perfil === 'obra' && (
          <Link href="/cotacoes/nova" className="btn btn-principal">
            Nova cotação
          </Link>
        )}
      </div>
      <p className="text-cinza">
        A IA pede os preços aos fornecedores pelo WhatsApp, preenche a tabela e indica a opção mais viável. Quem decide é o
        engenheiro, e a escolha vira compra no fluxo de aprovação.
      </p>
      <section className="cartao">
        {cotacoes.length === 0 ? (
          <Vazio>Nenhuma cotação ainda.{s.perfil === 'obra' && ' Use Nova cotação para pedir preços.'}</Vazio>
        ) : (
          <Rolagem>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nº</th>
                  {s.perfil !== 'obra' && <th>Obra</th>}
                  <th>Cotação</th>
                  <th>Responder até</th>
                  <th>Respostas</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {cotacoes.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/cotacoes/${c.id}`} className="font-medium underline">
                        {c.id}
                      </Link>
                    </td>
                    {s.perfil !== 'obra' && <td>{c.obra}</td>}
                    <td>{c.titulo}</td>
                    <td>{dataBR(c.prazo)}</td>
                    <td>
                      {c.respostas} de {c.fornecedores}
                    </td>
                    <td>
                      <Situacao status={`cot_${c.situacao}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Rolagem>
        )}
      </section>
    </div>
  )
}

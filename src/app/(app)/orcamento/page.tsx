import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { brl, comBdi } from '@/lib/regras'
import { Situacao, Vazio, Rolagem } from '@/components/ui'

export default async function Orcamentos() {
  const s = await exigirSessao()
  if (s.perfil === 'obra') redirect(`/orcamento/${s.obraId}`)

  const obras = await sql<{ id: number; nome: string; investidor: string | null; versao: number | null; situacao: string | null; bdi: number; custo: number }[]>`
    select o.id, o.nome, o.investidor, v.versao, v.situacao, coalesce(v.bdi, 0) as bdi,
      coalesce((select sum(round(i.quantidade * i.preco_unitario, 2)) from orcamento_itens i where i.orcamento_id = v.id), 0) as custo
    from obras o left join v_orcamento_vigente v on v.obra_id = o.id
    order by o.ativa desc, o.nome`

  return (
    <div className="grid gap-4">
      <h1>Orçamentos</h1>
      <p className="text-cinza">O orçamento de cada obra é o que vai para o investidor e define o previsto de cada etapa.</p>
      <section className="cartao">
        {obras.length === 0 ? (
          <Vazio>Nenhuma obra cadastrada ainda.</Vazio>
        ) : (
          <Rolagem>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Obra</th>
                  <th>Investidor</th>
                  <th>Versão</th>
                  <th className="num">Custo</th>
                  <th className="num">Valor ao investidor</th>
                </tr>
              </thead>
              <tbody>
                {obras.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orcamento/${o.id}`} className="font-medium underline">
                        {o.nome}
                      </Link>
                    </td>
                    <td>{o.investidor ?? <span className="text-cinza">não informado</span>}</td>
                    <td>
                      {o.situacao ? (
                        <>
                          v{o.versao} <Situacao status={o.situacao} />
                        </>
                      ) : (
                        <span className="text-cinza">sem orçamento</span>
                      )}
                    </td>
                    <td className="num">{brl(o.custo)}</td>
                    <td className="num">{brl(comBdi(o.custo, o.bdi))}</td>
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

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CabecalhoTela, Dinheiro, EstadoVazio, Secao, Situacao, Tabela, Td, Th, Tr } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { comBdi } from '@/lib/regras'

export default async function Orcamentos() {
  const s = await exigirSessao()
  if (s.perfil === 'obra') redirect(`/orcamento/${s.obraId}`)

  const obras = await sql<{ id: number; nome: string; investidor: string | null; versao: number | null; situacao: string | null; bdi: number; custo: number }[]>`
    select o.id, o.nome, o.investidor, v.versao, v.situacao, coalesce(v.bdi, 0) as bdi,
      coalesce((select sum(round(i.quantidade * i.preco_unitario, 2)) from orcamento_itens i where i.orcamento_id = v.id), 0) as custo
    from obras o left join v_orcamento_vigente v on v.obra_id = o.id
    order by o.ativa desc, o.nome`

  return (
    <>
      <CabecalhoTela contexto="O que vai para o investidor e define o previsto de cada etapa" titulo="Orçamentos" />
      <Secao titulo="Orçamento vigente por obra">
        {obras.length === 0 ? (
          <EstadoVazio titulo="Nenhuma obra cadastrada ainda">Cadastre uma obra para montar o orçamento dela.</EstadoVazio>
        ) : (
          <Tabela minimo={760}>
            <thead>
              <tr>
                <Th>Obra</Th>
                <Th>Investidor</Th>
                <Th>Versão</Th>
                <Th num>Custo</Th>
                <Th num>Valor ao investidor</Th>
              </tr>
            </thead>
            <tbody>
              {obras.map((o) => (
                <Tr key={o.id}>
                  <Td>
                    <Link href={`/orcamento/${o.id}`} className="font-semibold">
                      {o.nome}
                    </Link>
                  </Td>
                  <Td className={o.investidor ? '' : 'text-ink-3'}>{o.investidor ?? 'não informado'}</Td>
                  <Td>
                    {o.situacao ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="font-semibold">v{o.versao}</span> <Situacao status={o.situacao} />
                      </span>
                    ) : (
                      <span className="text-ink-3">sem orçamento</span>
                    )}
                  </Td>
                  <Td num className="text-ink-2">
                    <Dinheiro valor={o.custo} />
                  </Td>
                  <Td num forte>
                    <Dinheiro valor={comBdi(o.custo, o.bdi)} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Secao>
    </>
  )
}
